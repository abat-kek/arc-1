# Should any of #1011 reach main?

## Question and fixed scope

Reassess the bundle after merging #1016 and #1019. Main is `498c12bb`; the diagnostic
candidate remains `b5f441da`. Do not treat local model failures as proof that a native
capability has no value. Separate backend usefulness, model usability and release readiness.

1. Recheck SAP's documented workflows and current main alternatives.
2. Run one additional installed model, `qwen3.6:35b-mlx`, on the unchanged final harness.
   Five tasks in each arm: syntax-one, syntax-four, dumps-target, log-available and
   log-freshness. One pass, existing prompts, catalogs, seed and limits; no tuning after
   seeing results. Stop after 15 minutes if unfinished and retain partial evidence.
   This is a third-model exploratory qualification, not an independent replication or
   evidence of broad reliability. No SAP connection or model download.
3. Measure a deterministic four-program review spike with the existing before/after
   source checks retained. Compare syntax-only and whole-check-phase calls/bytes;
   test stable, changed-source and missing-report outcomes. Do not claim live latency.
4. Identify a minimal main-worthy extraction, or document why none is ready. Preserve
   research and deferred triggers if closing the bundle. No speculative production API.

The baseline catalog predates the two merges, but neither changes the catalog. The shared
runtime already contains the #1019 empty-report fix; use ordinary syntax in the new
comparison, not that previously extracted defect, as evidence for the remaining additions.

## Decision rule

Keep a capability only for a concrete task that current main cannot perform as effectively.
Require honest missing/stale evidence and no regression on the existing syntax route.
A successful synthetic task establishes a candidate for qualification, not release coverage.
Prefer smaller existing-action parameters or internal workflow reuse over exposing generic
query grammar. Do not merge #1011 merely because its code review has no blockers.
