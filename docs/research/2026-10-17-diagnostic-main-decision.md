# What is worth keeping from #1011?

**Decision: retain dump filtering and bounded syntax batching as separate candidates for main.
Do not close #1011 as valueless, and do not merge its current bundle. Defer the activation-log
addition.** The useful correctness fix is already on main through #1019; #1016 is merged too.

This follow-up changes the earlier priority judgment. It adds ten trials on another installed
model, a workflow spike, and a positive live filter match. It does not erase the earlier failures.

## Recommendation

| Addition | Main value | Next delivery boundary |
|---|---|---|
| Dump filtering | Find rare incidents without returning large lists to the model; a concrete benefit is now observed | First extraction: existing `dumps` action, bounded target-validated filters, error recovery and optional schema discovery. No generic feed framework, cache or new tool. |
| Batch syntax | Check an explicit object list with fewer calls; useful for programmatic consumers as well as capable models | Separate extraction. Keep the existing single-object route. Integrate review batching only with source reconciliation, per-object policy/error semantics and a measured benefit. |
| Dictionary log | Supplies additional historical diagnostic text | Defer. Reading the text worked, but another model mixed an unsupported failure verdict with caveats. No automated attribution to a recent activation. |
| Empty native syntax report | Corrects an existing false-success result | Already merged as [#1019](https://github.com/arc-mcp/arc-1/pull/1019). |

The minimum useful filter case is runtime-error equality. The current flat AND implementation is
bounded and already handles the tested case; it is not necessary to redesign it into a query
language or add new features. Further attributes/operators should earn coverage through actual
tasks. Existing `user`, time bounds and result limits must keep working without schema discovery.

## Why these are real tasks

SAP documents [filter rules for runtime-error feeds](https://help.sap.com/docs/abap-cloud/abap-development-tools-user-guide/selecting-abap-runtime-errors-for-feed),
including runtime-error names and AND/OR matching. Main currently exposes user/time/result limits,
but no runtime-error predicate. An agent can fetch and inspect lists; that is more data and can
run into the 500-row call limit or the existing same-second pagination limit. Filters narrow the
server query before those bounds. This is useful without an extra permission preflight.

SAP also documents [Dictionary activation logs as troubleshooting evidence](https://help.sap.com/docs/SAP_NETWEAVER_AS_ABAP_FOR_SOH_740/c238d694b825421f940829321ffa326a/b17f1a00c8b942a3a1884eca8d3a1cb9.html).
That establishes the use case, not a timestamp/correlation contract for ARC-1's saved-log GET.
Main's activation result and source-state checks remain distinct evidence; neither invents a log
message that the API does not return. A failed model interpretation is not an API authorization
defect, but it matters for the intended diagnosis workflow.

[SAP's manual syntax-check documentation](https://help.sap.com/docs/SAP_NETWEAVER_AS_ABAP_FOR_SOH_740/c238d694b825421f940829321ffa326a/a73f2290404f47cb8f3656fac3ed46e5.html)
describes the open editor's source. It does not establish multi-object wire support. The batch
contract instead rests on the installed-client inspection and earlier recorded 758 native probe.
ATC remains a different check, even though it already accepts object lists in main.

## Ten additional model trials

Installed **`qwen3.6:35b-mlx`**, NVFP4, unchanged harness at `b5f441da`; one baseline-first pass
through five tasks in both arms. Same full nine-tool catalog, prompts, temperature 0, seed 1700,
32,768 requested context and 2,048 output-token limit. All ten finished within the fixed
15-minute stop. The earlier 48 formal trials remain separate. Qwen 3 and 3.6 are related models;
these are not independent statistical samples or proof of universal reliability.
The frozen baseline is the #1009 stack at `62eb17b4`, not current main. It already includes the
pending transport/notebook work; neither #1016 nor #1019 changes its tool catalog. This isolates
the #1011 additions on that stack and is not a direct whole-catalog main-versus-head benchmark.

| Task | Baseline | Candidate | Interpretation |
|---|---|---|---|
| One stored syntax check | Pass, 1 call | Pass, 1 call | No regression on this model/control |
| Four stored checks | Pass, 4 calls | Pass, 1 call | Correct verdicts; result bytes grow 262 → 1,143 |
| Two rare TIME_OUT dumps | Pass in prose, 6 calls | Pass in prose, 3 calls | Result bytes 32,958 → 2,565; backend reads 10 → 4 |
| Available log message | Inconclusive: unmodeled route | Correct message in prose, 1 call | New evidence retrieved; no fair baseline success-rate comparison |
| Latest-attempt attribution | Inconclusive: unmodeled routes | Contradictory answer, 1 call | Failure verdict followed by lack-of-correlation caveats; control fails |

For dumps, the candidate first tried `operator="="`, received an error, discovered the schema,
then used `equals` successfully. This is evidence for optional recovery discovery, not a rule to
call it before every operation. Baseline and candidate omitted date bounds in their calls; their
answers correctly identify timestamps in this one-day fixture. Mixed-day selection remains a
needed control. Response-byte reductions include errors and schema output, not only final rows.

The strict grader rejects prose as invalid JSON. The table credits only manually checked task
facts supported by successful tool results; raw grades and answers are unchanged. No aggregate
success percentage, token-cost estimate or latency claim follows. The model log answer begins
with a failure assertion, then says the log is not correlated. Those caveats do not establish the
earlier verdict. See [all ten answers and review notes](adt-vscode-1.2/evidence/diagnostic-followup/manual-review.json).

## Workflow spike: smaller benefit than “four calls to one”

The real transport collector from draft #1008 and the diagnostic dispatcher were run over synthetic HTTP fixtures.
A research-only batch scheduler retained all eight before/after source-state calls for four
programs; stable, source-drift and missing-report cases preserve the same verdicts.

| Four-program review | Existing scheduler | Batch prototype |
|---|---:|---:|
| Syntax calls | 4 | 1 |
| Diagnostic calls, including source checks | 12 | 9 |
| Calls including the two fixed inventory reads | 14 | 11 |
| Diagnostic HTTP calls, including one CSRF fetch | 21 | 18 |
| Stable diagnostic result bytes | 4,142 | 5,023 |

This is a 14% reduction in the measured diagnostic HTTP calls, not a fourfold workflow speedup.
Inventory payloads are fixed in the spike; source reads and parsing use real code. No SAP wall-clock
benefit is claimed. Classes have more source sections, so source verification may dominate further.
Batching also widens the interval between each object's before/after observations and changes
failure isolation; these need deliberate handling in a production integration.

The runner accepts a `ToolInvoker` and goes through `executeCliToolCall`. Therefore the earlier
idea of invisible internal batching is not a free change: the current prototype uses the public
batch action and its existing dispatcher gates. A hidden raw-HTTP path would bypass that boundary.
Do not add one to avoid catalog bytes. The production runner is unchanged.

## Positive live filter verification

The unchanged candidate source was exercised through its real local dispatcher on A4H/001,
HTTPS 443, existing Basic identity, writes/SQL/data preview disabled. Three bounded list calls:
read one existing recent dump; filter by that returned runtime-error name; query a nonmatching
name. The positive query returned the same ID/error and the negative query returned no rows.
Five underlying GETs succeeded. No dump was generated and no object was modified.

The last recorded release is 758 SP02; this small probe did not query release metadata again.
Raw incident content remains private. The committed [aggregate summary](adt-vscode-1.2/evidence/diagnostic-followup/live-filter-summary.json)
contains hashes and counts only. This closes the missing positive match on A4H, not 750/816/BTP/PP
qualification or broad operator coverage.

## What must happen before a merge

1. Extract filters independently onto current main; retain bounds and existing call compatibility.
   Test positive/negative matches, mixed days, invalid-operator recovery, denials and the old small-
   model controls. State supported target coverage; do not claim all advertised operators were tested.
2. Extract batch syntax separately if explicit multi-object checking is wanted. Keep its missing-
   report, single-object and unsupported-type controls. Transport integration needs its own review.
3. Keep the log experiment and failed uncertainty controls in research. Resume for a concrete
   historical-log workflow or native attempt-correlation evidence.

No new product code or schema was changed by this follow-up. The research scripts/tests are
reproducible; [evidence inventory](adt-vscode-1.2/evidence/diagnostic-followup/README.md) and
[fixed plan](../plans/2026-10-17-diagnostic-followup-research.md) record scope and limitations.
FEAT-74 now has demonstrated task value and an A4H positive match; FEAT-69 retains integration gaps;
FEAT-71 retains the failed uncertainty control. #1011 remains a draft source for those extractions.
