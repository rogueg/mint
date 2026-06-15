---
name: good-communication
description: Describes what high-quality written communication looks like. Always read this before communicating something non-trivial.
---

Good communication helps a capable teammate understand the situation quickly without reading the whole diff or codebase.

## Start from the reader's job
Write for someone who wants to make a decision or understand a change, not for someone grading how much you noticed.
Lead with the few facts that determine the shape of the work: what changed, why it matters, what risk remains, and what the reader should do next.

## Organize around the thing itself
Use sections that match the natural structure of the problem. Do not force generic headings like "What changed / Why / How" if the change has a clearer shape.
Good headings are specific enough to help scanning: "CLI", "UI", "Sanitization", "Snowflake browser login".

## Be concrete, not exhaustive
Name the important files, functions, commands, and user-facing behavior. Skip incidental churn, test snapshots, lockfiles, and file-by-file tours unless they are the point.
Every claim should be checkable. Avoid invented motivations and vague praise.

## Prefer direct language
Use short sentences and plain verbs. Avoid agentic filler like "This PR aims to", "comprehensive", "robust", "seamlessly", or "significantly improves".
Do not narrate your process. Do not apologize. Do not over-explain obvious code.

## Make tradeoffs explicit
If there is a security, compatibility, migration, or product tradeoff, state it plainly. Include why the risk is bounded when that matters.

## Plans should be useful before they are complete
A good plan explains the current problem accurately, proposes a simpler target shape, and calls out decisions that need human judgment.
Use pseudocode when it communicates the shape better than prose.
Avoid giant checklists, speculative abstractions, or plans that merely restate the prompt.

## Summaries should teach the mental model
A good summary is organized by concept, not by file. It should tell the reader what they can now do, what changed internally to support it, and the non-obvious details that would surprise someone reading only the headline.
