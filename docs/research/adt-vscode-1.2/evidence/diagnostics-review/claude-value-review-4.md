# Claude value review 4 — #1011 follow-up research

| | |
|---|---|
| Reviewed commit | **`7604606b8f69c50bfd2b760c6636a3e0f6286517`** (`test: qualify diagnostic value with workflow and live evidence`) |
| Delta | `b5f441da..7604606b`: one commit, 14 files (docs, evidence, roadmap, `tests/evals/diagnostic-workflow-spike.test.ts`, `scripts/probe-diagnostic-filter.ts`). **No `src/`, schema or tool-fixture change**; the lockfile is unchanged. |
| Context | Main `498c12bb` already contains #1016 and #1019. |
| Reviewer | Claude Code, model **Opus 5.5** (`claude-opus-5-5`), effort **max** |
| Date | 2026-10-17 |
| Method | Immutable `git archive` export. Evidence ZIPs were read in memory only. No models, SAP, network, full suite, shared edits or GitHub. |

## Verdict

**Approve the research and its recommendation. There are no blockers.**

Each recommendation follows from the evidence:

- retain dump filtering first;
- retain explicit batch syntax as a separate extraction;
- defer saved activation logs;
- do not merge the bundle.

Each qualification you listed is accurate (table below). The plan avoids overengineering: no new
production code, no query-language redesign, no hidden internal batching. Four small nits follow.

## Claims verified

| Claim | Evidence | Result |
|---|---|---|
| 10 new Qwen 3.6 trials, separate from the earlier 48 + 9 | Separate directory, archive and manual review. The manifest records harness `b5f441da`, baseline `62eb17b4`, one baseline-first pass, five cases, `qwen3.6:35b-mlx` (NVFP4), temperature 0, seed 1700, 32,768 / 2,048. The earlier report says its 48 results are unchanged. | ✓ |
| Archive integrity | `qwen36-trials.zip`: 22/22 members match `qwen36-files.json` SHA-256. All 10 `manual-review.json` rows match their raw trials: identical answers, call counts, returned bytes, backend calls and raw grades. | ✓ |
| Strict JSON failure versus supported prose | Both `dumps-target` answers (D079 then D113, with timestamps) and the candidate `log-available` message are prose (raw `format: invalid`). Each fact is backed by successful tool results. Syntax answers are valid JSON. | ✓ |
| Baseline log tasks inconclusive | `log-available` hit an unmodeled `system_messages` route; `log-freshness` hit unmodeled domain `object_state` source reads. Neither arm is given a success-rate comparison. | ✓ |
| Contradictory freshness answer is a failed control | The answer concludes "**The latest recorded activation attempt failed …**" and only then says the log may not be the very last attempt. | ✓ correctly a failure |
| Filtered dumps: 6 → 3 tool calls | Baseline: 3 list calls (50/100/200) and 3 detail reads. Candidate: `operator "="` error, then `feed_schema`, then `equals`. Returned bytes 32,958 → 2,565; backend reads 10 → 4. The doc states the dependence on recovery, and that both arms omitted date bounds. | ✓ |
| #1008 collector prototype: 21 → 18 diagnostic HTTP calls, checks preserved | The committed `workflow-spike.json` and my offline rerun agree. Both arms make 16 source GETs and 1 CSRF HEAD, plus 4 vs 1 `checkruns` POSTs. Tool calls 14 → 11; stable result bytes 4,142 → 5,023. Identical verdicts in the stable, drift (`stale`) and missing-report (`not-run`) scenarios, with 8 `object_state` calls retained. A 14% reduction. | ✓ |
| Baseline is draft #1009, not exact main | Stated explicitly (decision doc lines 50–52) | ✓ |
| Live A4H check: five GETs, no incident details committed | The summary has only status, bytes and SHA-256 for five GETs (list; schema + positive; schema + negative, with identical schema hashes), plus booleans and a time bound. The probe pins A4H/001 over HTTPS with read-only safety, writes raw outputs to a new private directory, prints only the summary and refuses to create a dump. The positive match alone would also pass if the filter were ignored; the empty negative query is what proves filtering, and the doc reports both. | ✓ |

The ten trials took 4.2 minutes in total (longest 62 s), within the 15-minute stop.

## Nits (non-blocking)

1. **Disclose the context flag.** The raw summary flags `contextNearLimit` (≥ 90% of 32k) for three
   **baseline** trials: `dumps-target`, `log-available` and `log-freshness`. This is part of the
   cost of unfiltered listing. It also means silent prompt truncation cannot be ruled out for those
   trials. One sentence in the trial section would cover it.
2. **Keep links durable.** The roadmap entries link to `blob/codex/verified-diagnostics/...`.
   Because the bundle will not merge, those links break if the branch is deleted. Use commit
   permalinks (for example `blob/7604606b…/`) or carry the decision doc and the FEAT-74 priority
   change to main with the first extraction PR.
3. **Wording.** The closing line "FEAT-74 now has **demonstrated** task value" is stronger than the
   table's own "a concrete benefit is now **observed**" for one model on a synthetic fixture.
   "Observed" would be consistent.
4. **Test placement (optional).** `vitest.eval.config.ts` does not exclude
   `diagnostic-workflow-spike.test.ts`, so `npm run test:eval` (routing evals) also runs it. It is
   offline and takes about 0.2 s, but it is research code. Either opt it in as you did for
   `diagnostic-value.test.ts`, or leave it and accept the coupling.

## Checks run (scratch export of `7604606b`, Node 22.21.1)

| Check | Result |
|---|---|
| Workflow spike (offline, eval config) | 1/1 passed; all six rows reproduce the committed numbers exactly |
| `tsc --noEmit` (tests config, including scripts and evals) | pass |
| Biome on the new spike test | pass (Biome checked only the test; the probe script was not checked) |
| Strict `docs:build` | pass |
| Evidence: manifest hashes, manual review against raw trials, live summary content | 22/22, 10/10, aggregate-only |

## Limitations

- No model or live rerun. The live result is taken from the committed summary and the probe
  script's logic.
- I could not open the external SAP help links (no network); their use is descriptive only.
- I did not re-review product code (out of scope, unchanged).
