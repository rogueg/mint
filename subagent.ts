// Implements mint's `subagent` tool. A subagent is a child pi JSON-mode subprocess with its own session file, optionally forked from the parent's visible conversation branch.
// Named subagents are normal pi prompt templates with `isSubagent: true` frontmatter; frontmatter controls child defaults like fresh context, model, thinking, and tools.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Message } from "@earendil-works/pi-ai";
import {
	parseFrontmatter,
	SessionManager,
	type ExtensionAPI,
	type ReadonlySessionManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const subagentEnvVar = "MINT_SUBAGENT";

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

interface SubagentPrompt {
	name: string;
	body: string;
	freshContext?: boolean;
	model?: string;
	thinking?: ThinkingLevel;
	tools?: string;
}

interface SubagentDetails {
	sessionId: string;
	sessionFile?: string;
	freshContext: boolean;
	model?: string;
	usage?: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		totalTokens: number;
		cost: number;
	};
}

const SubagentParams = Type.Object({
	prompt: Type.String({
		description:
			"Raw prompt to send. When promptName is set, this is passed as template arguments and appended as extra context if the template does not reference arguments.",
	}),
	promptName: Type.Optional(
		Type.String({ description: "Name of a normal pi prompt template whose frontmatter has isSubagent: true." }),
	),
});

// Register the tool unless this extension is already running inside a child subagent process.
export function registerSubagentTool(pi: ExtensionAPI) {
	let subagentRunning = false;

	if (process.env[subagentEnvVar]) return;

	pi.registerTool({
		name: "subagent",
		label: "Subagent",
		description:
			"Run a single pi subagent in a separate session. Use promptName for prompt templates marked isSubagent: true; frontmatter controls defaults like freshContext, model, thinking, and tools. Subagents cannot launch nested subagents.",
		promptSnippet: "Run a single delegated pi subagent and return its final response.",
		promptGuidelines: [
			"Use subagent when an independent pass would help, such as code review or focused investigation. Only one subagent runs at a time.",
		],
		parameters: SubagentParams,

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			if (subagentRunning) throw new Error("A subagent is already running; mint only supports one subagent at a time.");
			subagentRunning = true;

			try {
				const prompts = discoverSubagentPrompts(pi);
				const template = params.promptName ? prompts.find((prompt) => prompt.name === params.promptName) : undefined;
				if (params.promptName && !template) {
					const available = prompts.map((prompt) => prompt.name).join(", ") || "none";
					throw new Error(`Unknown subagent prompt "${params.promptName}". Available subagent prompts: ${available}.`);
				}

				const finalPrompt = template ? expandPromptTemplate(template.body, params.prompt) : params.prompt;
				const freshContext = template?.freshContext === true;
				const session = createSubagentSession(ctx.sessionManager, ctx.cwd, freshContext);
				const sessionFile = session.getSessionFile();
				if (!sessionFile) throw new Error("Could not create a persisted subagent session.");

				const args = buildSubagentArgs(sessionFile, finalPrompt, template);
				const result = await runSubagent(args, ctx.cwd, signal);
				const finalMessage = getFinalAssistant(result.messages);
				const output = getAssistantText(finalMessage) || result.stderr || "(no output)";
				const details = buildSubagentDetails(session, sessionFile, freshContext, finalMessage, template);

				if (result.exitCode !== 0 || (finalMessage?.role === "assistant" && finalMessage.stopReason === "error")) {
					throw new Error(`Subagent failed (session ${details.sessionId}): ${output}`);
				}

				return {
					content: [{ type: "text", text: `${output}\n\n[subagent session: ${details.sessionId}]` }],
					details,
				};
			} finally {
				subagentRunning = false;
			}
		},
	});
}

// Find subagent-enabled prompt templates from pi's normal prompt-template registry.
function discoverSubagentPrompts(pi: ExtensionAPI): SubagentPrompt[] {
	const prompts: SubagentPrompt[] = [];
	const seenPaths = new Set<string>();

	for (const command of pi.getCommands()) {
		if (command.source !== "prompt") continue;
		const filePath = command.sourceInfo.path;
		if (!filePath.endsWith(".md") || seenPaths.has(filePath)) continue;
		seenPaths.add(filePath);

		let fileContent: string;
		try {
			fileContent = readFileSync(filePath, "utf8");
		} catch {
			continue;
		}

		const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(fileContent);
		if (frontmatter.isSubagent !== true && frontmatter.isSubagent !== "true") continue;

		prompts.push({
			name: command.name,
			body,
			freshContext: frontmatter.freshContext === true || frontmatter.freshContext === "true",
			model: typeof frontmatter.model === "string" ? frontmatter.model : undefined,
			thinking: isThinkingLevel(frontmatter.thinking) ? frontmatter.thinking : undefined,
			tools: typeof frontmatter.tools === "string" ? frontmatter.tools : undefined,
		});
	}

	return prompts;
}

// Validate frontmatter thinking values before passing them to pi's CLI.
function isThinkingLevel(value: unknown): value is ThinkingLevel {
	return ["off", "minimal", "low", "medium", "high", "xhigh"].includes(String(value));
}

// Apply pi-style positional template arguments for the subset useful to subagent prompt templates.
function expandPromptTemplate(template: string, rawArgs: string): string {
	const args = splitArgs(rawArgs);
	const allArgs = rawArgs.trim();
	let expanded = template
		.replace(/\$ARGUMENTS/g, allArgs)
		.replace(/\$@/g, allArgs)
		.replace(/\$([1-9]\d*)/g, (_match, index) => args[Number(index) - 1] ?? "")
		.replace(/\$\{@:(\d+)(?::(\d+))?\}/g, (_match, start, length) => {
			const from = Number(start) - 1;
			const count = length === undefined ? undefined : Number(length);
			return args.slice(from, count === undefined ? undefined : from + count).join(" ");
		});

	// Preserve caller context even if the template did not opt into prompt arguments.
	if (rawArgs.trim() && expanded === template) expanded = `${expanded.trimEnd()}\n\nAdditional context:\n${rawArgs.trim()}`;
	return expanded;
}

// Split shell-like prompt arguments well enough for pi prompt placeholders.
function splitArgs(input: string): string[] {
	const args: string[] = [];
	let current = "";
	let quote: '"' | "'" | null = null;
	let escaping = false;

	for (const char of input) {
		if (escaping) {
			current += char;
			escaping = false;
			continue;
		}
		if (char === "\\" && quote !== "'") {
			escaping = true;
			continue;
		}
		if ((char === '"' || char === "'") && (!quote || quote === char)) {
			quote = quote ? null : char;
			continue;
		}
		if (/\s/.test(char) && !quote) {
			if (current) args.push(current);
			current = "";
			continue;
		}
		current += char;
	}

	if (current) args.push(current);
	return args;
}

// Create the child session, cloning the current visible branch when requested.
function createSubagentSession(ctxSession: ReadonlySessionManager, cwd: string, freshContext: boolean): SessionManager {
	const sourceFile = ctxSession.getSessionFile();
	const sessionDir = sourceFile ? dirname(sourceFile) : undefined;
	if (freshContext) return SessionManager.create(cwd, sessionDir);

	const leafId = ctxSession.getLeafId();
	if (!leafId || !sourceFile) return SessionManager.create(cwd, sessionDir);

	const branchLeafId = getParentLeafBeforeSubagentToolCall(ctxSession) ?? leafId;
	const source = SessionManager.open(sourceFile, sessionDir, cwd);
	const branchedFile = source.createBranchedSession(branchLeafId);
	return branchedFile ? SessionManager.open(branchedFile, sessionDir, cwd) : SessionManager.create(cwd, sessionDir);
}

// If the active leaf is the assistant message that called this tool, clone from its parent instead.
function getParentLeafBeforeSubagentToolCall(ctxSession: ReadonlySessionManager): string | null | undefined {
	const leaf = ctxSession.getLeafEntry();
	const isAssistantSubagentCall =
		leaf?.type === "message" &&
		leaf.message.role === "assistant" &&
		leaf.message.content.some((part) => part.type === "toolCall" && part.name === "subagent");
	return isAssistantSubagentCall ? leaf.parentId : undefined;
}

// Convert the prompt template metadata into the child pi command line.
function buildSubagentArgs(sessionFile: string, prompt: string, template: SubagentPrompt | undefined): string[] {
	const args = ["--mode", "json", "--session", sessionFile];
	if (template?.model) args.push("--model", template.model);
	if (template?.thinking) args.push("--thinking", template.thinking);
	if (template?.tools) args.push("--tools", template.tools);
	args.push("-p", prompt);
	return args;
}

// Return the final assistant message, which is the subagent's answer unless execution failed before model output.
function getFinalAssistant(messages: Message[]): Message | undefined {
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === "assistant") return messages[i];
	}
}

// Extract only text blocks from assistant output; thinking/tool-call blocks are not useful as the parent-facing result.
function getAssistantText(message: Message | undefined): string {
	if (!message || message.role !== "assistant") return "";
	return message.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n");
}

// Reuse the current pi executable when possible, falling back to `pi` on PATH for installed package runs.
function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}
	return { command: "pi", args };
}

// Spawn pi in JSON mode, parse finalized messages, and propagate cancellation to the child process.
async function runSubagent(args: string[], cwd: string, signal?: AbortSignal): Promise<{ exitCode: number; messages: Message[]; stderr: string }> {
	const invocation = getPiInvocation(args);
	const messages: Message[] = [];
	let stderr = "";
	let buffer = "";
	let wasAborted = false;

	const exitCode = await new Promise<number>((resolveExit) => {
		const proc = spawn(invocation.command, invocation.args, {
			cwd,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, [subagentEnvVar]: "1" },
		});

		const processLine = (line: string) => {
			if (!line.trim()) return;
			let event: any;
			try {
				event = JSON.parse(line);
			} catch {
				return;
			}
			if (event.type === "message_end" && event.message) messages.push(event.message as Message);
			if (event.type === "tool_result_end" && event.message) messages.push(event.message as Message);
		};

		proc.stdout.on("data", (data) => {
			buffer += data.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) processLine(line);
		});
		proc.stderr.on("data", (data) => {
			stderr += data.toString();
		});
		proc.on("close", (code) => {
			if (buffer.trim()) processLine(buffer);
			resolveExit(code ?? 0);
		});
		proc.on("error", () => resolveExit(1));

		const abort = () => {
			wasAborted = true;
			proc.kill("SIGTERM");
			setTimeout(() => proc.kill("SIGKILL"), 5000).unref();
		};
		if (signal?.aborted) abort();
		else signal?.addEventListener("abort", abort, { once: true });
	});

	if (wasAborted) throw new Error("Subagent was aborted");
	return { exitCode, messages, stderr };
}

// Build debug metadata for the tool result without exposing bulky child transcript data to the parent model.
function buildSubagentDetails(
	session: SessionManager,
	sessionFile: string,
	freshContext: boolean,
	finalMessage: Message | undefined,
	template: SubagentPrompt | undefined,
): SubagentDetails {
	return {
		sessionId: session.getSessionId(),
		sessionFile,
		freshContext,
		model: finalMessage?.role === "assistant" ? `${finalMessage.provider}/${finalMessage.model}` : template?.model,
		usage: summarizeUsage(finalMessage),
	};
}

// Keep a compact usage summary from the final assistant message for inspection in tool details.
function summarizeUsage(message: Message | undefined): SubagentDetails["usage"] | undefined {
	if (!message || message.role !== "assistant" || !message.usage) return undefined;
	return {
		input: message.usage.input ?? 0,
		output: message.usage.output ?? 0,
		cacheRead: message.usage.cacheRead ?? 0,
		cacheWrite: message.usage.cacheWrite ?? 0,
		totalTokens: message.usage.totalTokens ?? 0,
		cost: message.usage.cost?.total ?? 0,
	};
}
