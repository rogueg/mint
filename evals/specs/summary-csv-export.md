---
name: summary-csv-export
repo: https://github.com/graphene-data/graphene
# squash-merge commit of https://github.com/graphene-data/graphene/pull/462
sha: 5f48a0f0656cf39f4b9a9ea9ab3e47eddae6e7e9
prompt: |
  /change-summary HEAD^..HEAD
---

This spec tests our ability to summarize a medium-sized feature PR (CSV export, ~420 additions across cli, lang, and ui). The change has two user-facing surfaces (CLI flag and UI download button), one shared core (`rowsToCsv`), some non-obvious plumbing (chart data registry + run socket), and a side refactor — a good test of whether the summary organizes by concept instead of by file.

# Evaluation guidance
We're evaluating the written summary only. The agent should not make any changes.

The audience is an expert teammate who hasn't seen this change and wants to understand it without reading the diff. Evaluate:
* **accuracy** — every claim should be checkable against the diff. Penalize invented motivations or wrong mechanics.
* **altitude** — leads with what changed and why, then explains the mechanism conceptually, naming the key files/functions. A file-by-file walkthrough of the diff is a failure even if accurate.
* **selectivity** — the important things are covered (below), minor test-infra churn is at most a brief aside.
* **concision** — small snippets only where they earn their keep; no laundry lists.

Key things a good summary covers:
* both surfaces: `--format csv` on `graphene run` (works for raw GSQL, `-q` named queries, and `-c` charts) and the hover download button on charts in the UI.
* the shared serializer `rowsToCsv` in the new `lang/csv.ts`, and why it lives in `lang/` (used by both cli and ui).
* the subtle one: chart export returns the *raw* query rows, not the enriched chart data — which is why `ECharts.svelte` now `structuredClone`s data before `enrich()`, and why exports are registered in `window.$GRAPHENE.chartExports`.
* in csv mode, status logging moves to stderr so stdout is clean, pipeable CSV.
* the guardrails: `--format` is validated, and csv on a markdown file requires `-q` or `-c`.
* notices the side refactor: run/list/named-query in `run.ts` shared duplicated workspace-analysis code, now extracted into `analyzeMdFile()`.

Things to penalize:
* claiming csv export works on a whole markdown page without `-q`/`-c`.
* presenting the screenshot-test accommodations (hiding the button, parking the mouse) as a headline item.
* summarizing test files as if they were the feature.

<sample-good-output>

**CLI**: Adds `graphene run --format table|csv` (default `table`). Works for raw gsql, named queries, and charts. In csv mode, all status output moves to stderr so stdout is clean CSV you can pipe to a file. Running an md file in csv mode without `-q`/`-c` errors out, since a whole page has no single result to export.

**UI**: charts get a download button (top-right, visible on hover) that downloads the chart's backing data, with a filename derived from the chart title.

On page load, `window.$GRAPHENE.chartExports[componentId]` stores the rows/fields for each component.
`$GRAPHENE.exportChartCsv()` grabs that export, and uses `rowsToCsv` to convert to CSV.
The csv is returned to cli either via the socket, or via `page.evaluate` for headless browsers

Side cleanup: `run.ts` had three near-identical copies of "normalize path, load workspace, analyze" across the run/list/named-query commands — these collapsed into one `analyzeMdFile()` helper.

</sample-good-output>
