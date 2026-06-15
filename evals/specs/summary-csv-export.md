---
name: summary-csv-export
pr: https://github.com/graphene-data/graphene/pull/462
prompt: |
  /summary {{pr}}
---

This spec tests our ability to summarize a medium-sized feature PR (CSV export, ~420 additions across cli, lang, and ui). The change has two user-facing surfaces (CLI flag and UI download button), one shared core (`rowsToCsv`), some non-obvious plumbing (chart data registry + run socket), and a side refactor. A good summary organizes around those parts, not around the files in the diff.

# Evaluation guidance
This is a summary eval: judge the response, not code changes. Use `good-communication` for the general standard, and compare against the example below.

Specific things to look for:
* separates the CLI surface, UI surface, shared CSV plumbing, and side refactor.
* covers the important mechanics: `--format csv`, stderr status logging, md-file guardrail, `rowsToCsv`, `window.$GRAPHENE.chartExports`, and raw rows vs enriched chart data.
* does not claim csv export works for a whole markdown page without `-q`/`-c`.
* does not treat screenshot-test accommodations or test files as the feature.

<sample-good-output>

**CLI**: Adds `graphene run --format table|csv` (default `table`). Works for raw gsql, named queries, and charts. In csv mode, all status output moves to stderr so stdout is clean CSV you can pipe to a file. Running an md file in csv mode without `-q`/`-c` errors out, since a whole page has no single result to export.

**UI**: charts get a download button (top-right, visible on hover) that downloads the chart's backing data, with a filename derived from the chart title.

On page load, `window.$GRAPHENE.chartExports[componentId]` stores the rows/fields for each component.
`$GRAPHENE.exportChartCsv()` grabs that export, and uses `rowsToCsv` to convert to CSV.
The csv is returned to cli either via the socket, or via `page.evaluate` for headless browsers

Side cleanup: `run.ts` had three near-identical copies of "normalize path, load workspace, analyze" across the run/list/named-query commands — these collapsed into one `analyzeMdFile()` helper.

</sample-good-output>
