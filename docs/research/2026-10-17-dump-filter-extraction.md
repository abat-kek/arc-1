# Dump-filter extraction validation

Source: #1011 `5725fab6`; independent base: main `498c12bb`.
The filter-only extraction preserves ordinary calls and adds optional schema discovery.

## Plan and review

[Plan](../plans/2026-10-17-dump-filter-extraction.md) ·
[Claude plan review](dump-filter-extraction/claude-plan-review.md).
The four required conditions are implemented: unchanged legacy request options, diagnostic limit
advice, filter-only dependencies, and a single query encoder with narrower typed values.

One review assumption needed correction: the shared HTTP client already serializes BOTH legacy
and typed queries with `URLSearchParams` when adding SAP context. Reusing the old helper still
simplifies the code; it does not establish a difference in the final query-key encoding. A test
checks both helper input and the final decoded HTTP query. No client-side matching engine is added.

The new filter property exceeded existing wire limits in its first form. Duplicate wording was
trimmed from SAPDiagnose while retaining action requirements and the filter example. Wire/token
ceilings stay unchanged; only the expected description count rises by one.

## Validation record

Focused tests, full checks, model controls, live probe and final Claude review are recorded here
before the draft is opened. Original model research remains at
[the immutable #1011 decision](https://github.com/arc-mcp/arc-1/blob/5725fab6515f7a410e3e488003ae1a7aa3d8c249/docs/research/2026-10-17-diagnostic-main-decision.md).

## Remaining #1011 work

Batch syntax still has observed value (FEAT-69) and is not included. Saved activation logs remain
deferred (FEAT-71). #1011 stays open as an extraction source; this PR does not meet the user's
condition to close it only after no useful work remains. No transport/notebook dependency is added.
