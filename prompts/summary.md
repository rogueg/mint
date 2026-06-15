---
description: Summarize a git change for an expert teammate
---

I'd like you to summarize a change. The context is: $ARGUMENTS

If the context is instructions, follow them.
If context is a PR number or url, summarize the changes in that PR. For GitHub PRs, do not rely on the contributor branch still existing: GitHub exposes `refs/pull/<n>/head`, and eval checkouts may already be on a local `eval-pr-<n>` branch at that head. Compare the PR head against the merge base with its base/default branch, not against an arbitrary hand-written SHA range.
If context is a sha, summarize that commit.
Otherwise, look at the current git state. If there are outstanding changes, summarize them.
If there are no changes, but we're on branch other than main, summarize the changes in this branch relative to main.

You must read the `good-communication` skill, that's going to form the basis of what a good summary is. Do not modify files.

Write for an expert teammate who has not read the diff. Organize by the natural parts of the change, not by file. Include what changed, how it works, and any guardrails/compatibility/tradeoffs that would surprise a reader. For refactors, say what responsibility moved and why. For new modes/options, give a short meaning for each; a names-only list is not enough. Skip incidental test/snapshot/lockfile churn.

Example shape:

````md
This change adds CSV export in both the CLI and chart UI, sharing one serializer.

## CLI
`graphene run --format csv` now works for raw queries, named queries, and chart exports. Status output moves to stderr so stdout stays pipeable CSV. Running csv mode on a whole markdown page still errors unless a single query/chart is selected.

## UI
Charts get a hover download button. The page registers each chart's raw rows in `window.$GRAPHENE.chartExports`, and export code feeds those rows through the shared `rowsToCsv()` helper.

The non-obvious bit: exports use raw query rows, not enriched chart data, so chart rendering clones data before enrichment.
````

Before returning, ask `summary-reviewer` to critique your draft with the original request, diff range, and draft summary. Use the feedback to improve the final answer, but do not include a review changelog.
