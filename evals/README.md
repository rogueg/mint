# pi evals

Minimal eval harness for running pi against a pinned repo and judging the resulting patch.

## Run

```bash
bun evals/run.mjs schedule
```


The judge prompt lives in `evals/judge.md` and uses `{{PLACEHOLDER}}` values filled by the runner.

The runner will:

1. parse the markdown spec/frontmatter
2. clone `repo` and checkout `sha` under `evals/results/.../repo`
3. run pi with the spec prompt in JSON mode, explicitly loading `extension.ts`
4. save the raw transcript and `git diff`
5. ask a separate `pi -p --no-tools` judge to score the final diff

Artifacts are written to `evals/results/<timestamp>_<name>/`:

- `spec.md` — copied eval spec
- `repo/` — final edited checkout
- `transcript.jsonl` — raw pi JSON event stream, saved for debugging but not sent to the judge
- `diff.patch` — final patch sent to the judge
- `status.txt` — changed files
- `judge.md` — plain-text judge feedback
- `judge.json` — currently just parsed score, if found
- `session/` — isolated pi sessions for both the coding agent and judge
- `*.stderr.log` / `*.stdout.log` — command logs

## Spec format

```md
---
name: example
repo: https://github.com/org/repo.git
# optional: reads GH_TEST_GITHUB_TOKEN from .env/process env for private GitHub repos
githubToken: GH_TEST
sha: abc123
prompt: |
  Implement the requested change.
model: openai-codex/gpt-5.5
thinking: medium
timeoutSeconds: 80
# optional:
# setup: npm install
# verify: npm test
# judgeModel: openai-codex/gpt-5.5
---

Evaluation guidance and ideal-result notes go here.
```

Required fields are `repo`, `sha`, and `prompt`.

Environment overrides:

You can also pass an explicit markdown path instead of a spec name.

- `PI_EVAL_MODEL` — model for the coding agent, unless `model` is set in the spec
- `PI_EVAL_JUDGE_MODEL` — model for the judge, unless `judgeModel` is set in the spec
- `<NAME>_GITHUB_TOKEN` — used when a spec sets `githubToken: <NAME>`; also loaded from repo-root `.env` if present

Default command timeouts are intentionally short: 80 seconds for the main agent, 25 seconds for the judge, and 60 seconds for setup/verify unless overridden in frontmatter. Prefer `*Seconds` fields for evals; `*Minutes` fields are still accepted.
