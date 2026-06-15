You are judging a coding-agent's performance on a summary eval.

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

Use tools to inspect the checkout or diff if useful, but do not modify files. The current working directory is the checkout under evaluation.

Read the good-communication skill before judging if it is available. Judge the written summary: whether it gives an expert teammate a clear, accurate mental model of the change without reading the diff. Compare it to the sample-good-output and the scenario-specific notes. Penalize invented claims, vague prose, file-by-file tours, and emphasizing incidental churn.

Return plain text with these headings exactly:

What went well:
- ...
What went badly:
- ...
Notable slop:
- ...
