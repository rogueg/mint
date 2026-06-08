// Project-local pi extension for mint. It wires this repo's agent guidance, prompt templates, skills, and custom tools into pi while developing mint itself.
// Resource discovery is static; APPEND_SYSTEM.md is read each turn so prompt edits take effect immediately without /reload.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSubagentTool } from "./subagent.ts";

const baseDir = dirname(fileURLToPath(import.meta.url));
const appendSystemPath = join(baseDir, "APPEND_SYSTEM.md");
const promptsDir = join(baseDir, "prompts");

export default function (pi: ExtensionAPI) {
	// Make this repository's resource folders available to pi on startup and /reload.
	pi.on("resources_discover", () => {
		return {
			skillPaths: [join(baseDir, "skills")],
			promptPaths: [promptsDir],
		};
	});

	// Append APPEND_SYSTEM.md to the system prompt for each user turn.
	pi.on("before_agent_start", async (event) => {
		const appendSystemPrompt = (await readFile(appendSystemPath, "utf8")).trim();
		if (!appendSystemPrompt) return;

		return {
			systemPrompt: `${event.systemPrompt}\n\n${appendSystemPrompt}`,
		};
	});

	registerSubagentTool(pi);
}
