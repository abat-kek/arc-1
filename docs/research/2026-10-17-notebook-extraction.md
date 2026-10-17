# What to keep from notebook PR #1009

## Decision

Keep native notebook authoring guidance, a portable example and two existing-query
regressions. Retire the alternate notebook format and runner. Creating a JSON file
does not need another MCP action, CLI command, generator or execution framework.

The user explicitly rejected #1009's additions and requested a reviewed extraction,
merge and closure. [Plan](../plans/2026-10-17-notebook-extraction.md) ·
[User guide](../../docs_page/sql-notebook-authoring.md).

## Baselines

| Source | Inspected revision / qualification |
|---|---|
| ARC-1 main | `37fece94359c8a48523af56b0ff71f52359a7c21`, version 1.6.0 |
| #1009 | `62eb17b456cd57908cdac2a508082027ed5d88f7`, stacked on #1008; 29 notebook-specific files |
| Installed SAP extension | `SAPSE.adt-vscode` 1.2.0, darwin-arm64 |
| Current upstream page | [SAP Marketplace](https://marketplace.visualstudio.com/items?itemName=SAPSE.adt-vscode), checked October 17; lists the SQL Notebook |

The live Marketplace description confirms the feature, not a wire-format guarantee
or exact latest version. SAP Help's SQL-console page was unavailable to the text
fetcher. The installed manifest and serializer are the format evidence; no SAP
implementation code is redistributed.

## Extraction review

| #1009 component | Disposition |
|---|---|
| `Flight_Capacity_Showcase.abapsql` | Adapt its proven airline query into `examples/notebooks/flight.abapsql`. Remove the personal destination; add a separate count cell and interpretation notes. |
| Native-format knowledge | Document the five supported fields and real editor commands. Unknown metadata and results are not persisted by the inspected serializer. |
| Scalar-count fixture | Preserve the sanitized 758 fixture byte-for-byte as `query-scalars-758.json`. Test the existing HTTP → XML parser → SAPQuery handler path. |
| `flight.notebook.json`, document schema/importer | Reject. Native `.abapsql` already expresses the needed Markdown/SQL cells. |
| Runner, CLI, assertions, result export and HTML | Reject. They duplicate editor execution and add a new completeness contract without measured user benefit. |
| Scalar aggregate detector | Reject. Existing SAPQuery preserves native metrics; a partial SQL parser would add maintenance and semantic risk. Explain the counts instead. |
| Workflow error classifier / private-file helpers | No consumer on main. Their fixes serve the unmerged workflows, not existing query behavior. Frozen source remains available for #1008 review. |
| Eight-transport pilot | Useful historical evidence for #1008, unrelated to authoring. [Preserved pilot](https://github.com/arc-mcp/arc-1/blob/62eb17b456cd57908cdac2a508082027ed5d88f7/docs/research/2026-10-17-transport-pilot.md); do not repeat its SAP calls or claim customer savings. |
| Old plan, reviews and broad research index | Preserve on the source branch. They describe the rejected runner and are not approval of this extraction. |

No source, schema, authorization, dependency or CLI changes are required. Existing
whitespace tests already cover exact cell strings; the new cases add the specific
`totalRows=0/40` versus one scalar output row distinction. They pass on unchanged
production code and are contract coverage, not a claimed bug fix. Their XML is a
minimal reconstruction from recorded public responses, not a captured SAP body.

The current roadmap has reused FEAT-86/87 for stored-text coverage and repeated
SQL-literal spaces. Neither is a notebook item now. Checked: **no roadmap impact**;
do not carry #1009's old deletions into main. ABAP object creation is also outside
this extraction; the PR contains no object-creation improvement.

## Validation

Results and independent review are recorded here before merge. Native editor
execution and ARC-1 query execution are different routes and are qualified separately.

- Installed 1.2.0 serializer: the example round-trips semantically unchanged, with
  three ordered Markdown/SQL cells and no destination binding. The actual serializer
  was evaluated locally with minimal VS Code cell/data stubs; no extension code
  is checked in. Bundle and example hashes are in `notebook-extraction/serializer.json`.
- Focused existing query/parser/aggregate tests: 197 passed. The first run had one
  test-fixture error (unescaped `<` in reconstructed XML); escaping it fixed the
  fixture. No production defect or fail-before product regression is claimed.
- Full local suite: **9,235 tests passed** (Node 24.11.1, four workers). Build,
  all TypeScript projects, lint, policy, size/schema budgets and strict docs pass.
  Existing production files and tool snapshots are unchanged.
- Fresh live probe: the example returned six airline rows and `"40 "` in one count
  row; the negative predicate returned `"0 "` in one row with `totalRows=0`.
  Three freestyle query POSTs, zero mutations. Free SQL disabled was refused
  before another POST. A4H/001, HTTPS 443, local dispatcher, existing Basic identity;
  previously recorded release 758 SP02, not queried again. An initial probe setup
  typo left free SQL disabled and was refused before SAP; corrected locally.
  [Aggregate evidence](notebook-extraction/live-summary.json).
- Editor rendering/open-save validation remains unconfirmed: the shared VS Code
  window changed during file selection. No notebook cell was executed there.
  Serializer round-trip and ARC-1 live queries do not establish an editor run or
  compatibility with other extension versions, 750, 816 or BTP.
- Claude plan and frozen-diff reviews: pending final recording.

Raw local outputs remain private. Only count-only fixtures, aggregate summaries
and review reports belong in the repository. The original 67-file working tree,
11 research inputs and #1009 source branch are preserved.
