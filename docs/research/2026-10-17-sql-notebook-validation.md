# SQL notebook validation — 17 October 2026

## Scope and review

NB-01 / FEAT-87 follows transport draft PR #1008. The [plan](../plans/2026-10-17-adt-followups.md)
records the design review and acceptance criteria. The implementation uses existing SAPQuery
and dispatcher enforcement; it adds no authentication, SQL execution or permission engine.
[User guide](../../docs_page/sql-notebooks.md) · [pilot](2026-10-17-transport-pilot.md) ·
[live summary and source hashes](adt-vscode-1.2/evidence/notebook-live-summary.json).

## Checks

| Check | Result |
|---|---|
| Focused notebook, CLI, cancellation and existing review CLI | 31 tests passed |
| Full unit suite | 8,968 tests / 319 files passed (`--maxWorkers=4`) |
| Typecheck, build, Biome, policy validation, file/schema budgets, strict docs | Passed |
| Import / output guards | No client construction on import; explicit mappings, private new files, bounded UTF-8 input |
| Cancellation | Real local HTTP stream closes after abort; remaining cell not executed |
| Initial regression spike | Eight newly added cases failed before corrections; scalar metadata added two more fail-before cases |
| Independent Claude GUI review | Pending exact-commit review |

The unconstrained full run hit two existing HTTP/shutdown timing failures; both affected files
passed in isolation (35 tests), then the full suite passed with four workers. No unrelated test
timeouts or product code were changed.

## Live evidence

A4H / SAP_BASIS 758, client 001, HTTPS 443, existing Basic identity. Both runs had writes,
transport writes, Git writes and table-preview permission disabled. Only the allowed run enabled
free SQL in its child process. No persistent settings or SAP objects were changed.

| Run | Outcome | End-to-end time |
|---|---|---|
| Flight notebook, free SQL enabled | Six detail rows, complete; independent assertion passed; exit 0 | 3,395 ms |
| Same notebook, free SQL disabled | Detail blocked; assertion not run; partial report; exit 1 | 2,460 ms |

Full JSON/HTML and private logs remain under `test-results/notebook/live/` in the implementation
worktree. The public summary records artifact hashes, configuration, counts and source hashes.
The count-only sanitized fixture `tests/fixtures/json/notebook-scalars-758.json` preserves the
observed query responses; no credentials or business rows are archived.

### What the live spike changed

- An initial field-to-field assertion was rejected by SAP syntax. The example now checks for a
  negative occupied-seat count with a supported constant predicate; the rejected query remains
  private test evidence, not a supported example.
- For scalar `COUNT`, SAP reports matched input records as `totalRows`: zero or 40, while returning
  exactly one row. A proven scalar projection now checks its output cardinality independently.
  Ordinary detail queries still reject contradictory row metadata.
- Numeric results include padding (`"0 "`, `"40 "`). Assertions compare exact strings; the example
  and documentation preserve the space instead of silently trimming or converting numbers.

## Limits

This is a sequential observation, not an atomic data snapshot. The live notebook was checked on
758 only; the runner has not been live-qualified on 750, 816 or BTP in this stage. Saturation,
malformed replies, export limits, unsafe HTML, mappings and denied-operation behavior also have
local regression coverage. HTML is statically checked; no rendered browser inspection was made.
No human preparation-time or customer usefulness measurement is claimed.
