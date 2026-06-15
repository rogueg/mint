mint is a Pi extension designed to help LLMs write excellent code.

It has a collection of prompts (and chains of prompts) that an agent uses. Our main goal in this project is to iterate on those prompts and explore how they affect the resulting code/writing.

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

# Prompts
This repo focuses on a few abilities we want our agent to get really good at:
- plan - lay out the shape of a problem, and the best way(s) to solve it. Quality here is both having a good solution to the problem, but also being able to communicate it clearly.
- summary - take a change, and identify the key thing it does and why. Quality here is giving a solid birds-eye view of a change without me having to read the code.
- build - actually make a particular change. Quality here is code that works, is performant, but most importantly is easy to follow and well-documented.
