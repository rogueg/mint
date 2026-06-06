// Project-local pi extension for mint. It keeps this repository's agent guidance, prompt templates, and skills wired into pi while developing the repo itself.
// The extension is intentionally small: resources are discovered on startup/reload, while APPEND_SYSTEM.md is read each turn so prompt edits take effect immediately.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const baseDir = dirname(fileURLToPath(import.meta.url));
const appendSystemPath = join(baseDir, "APPEND_SYSTEM.md");

export default function (pi: ExtensionAPI) {
	// Make this repository's resource folders available to pi on startup and /reload.
	pi.on("resources_discover", () => {
		return {
			skillPaths: [join(baseDir, "skills")],
			promptPaths: [join(baseDir, "prompts")],
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
}
