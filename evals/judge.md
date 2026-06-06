You are judging a coding-agent's performance on an eval scenario.

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

Read the good-code skill before judging if it is available. In addition to what is specified in the scenario details, you should be on the lookout for things that seem off from that skill's description of good code.

Return plain text with these headings exactly:

What went well:
- ...
What went badly:
- ...
Notable slop:
- ...
