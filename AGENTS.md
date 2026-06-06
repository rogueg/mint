mint is a Pi extension designed to help LLMs write excellent code.

# Evals
We have evals to test that the agent will write good code in a given repo.
`bun evals <spec-name>` will run a spec of that name from evals/specs/
evals/results/ contains historical results, and evals/checkouts/ store the checkout state from the most recent run of each unique repo.

results contain the following files:
- `transcript.jsonl` — raw pi JSON event stream, saved for debugging
- `agent-response.md` — final natural-language response from the coding agent, sent to the judge
- `diff.patch` — final patch saved for debugging; the judge gets `status.txt` and inspects the checkout itself
- `status.txt` — changed files
- `judge.md` — plain-text judge feedback
- `judge.json` — currently just parsed score, if found
- `session/` — isolated pi sessions for both the coding agent and judge
- `*.stderr.log` / `*.stdout.log` — command logs
