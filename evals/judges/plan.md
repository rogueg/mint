You are judging a coding-agent's performance on a plan eval.

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

Use tools to inspect the checkout if useful, but do not modify files. The current working directory is the checkout under evaluation.

Read the good-communication skill before judging if it is available. Judge the plan: whether it accurately explains the current problem, proposes a simple target shape, and calls out decisions or tradeoffs that need human judgment. Compare it to the sample-good-output and the scenario-specific notes. Penalize generic checklists, vague refactor language, and plans that do not simplify the work.

Return plain text with these headings exactly:

What went well:
- ...
What went badly:
- ...
Notable slop:
- ...
