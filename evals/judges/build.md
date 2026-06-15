You are judging a coding-agent's performance on a build eval.

<scenario-details>
{{spec}}
</scenario-details>

<checkout>
{{checkout}}
</checkout>

<changed-files>
{{status}}
</changed-files>

<agent-response>
{{response}}
</agent-response>

Use tools to inspect the changed files and run targeted checks if useful, but do not modify files. The current working directory is the checkout under evaluation, so `git diff`, `git status`, and file reads reflect the agent's result.

Read the good-code skill before judging if it is available. Judge the resulting code first: correctness, simplicity, readability, comments, types, and whether the implementation matches the scenario. Use the scenario-specific guidance for details that matter in this eval. The final response matters too, but only after the code quality.

Return plain text with these headings exactly:

What went well:
- ...
What went badly:
- ...
Notable slop:
- ...
