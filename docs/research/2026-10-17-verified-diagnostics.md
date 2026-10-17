# Verified diagnostics — 17 October 2026

[Plan and review](../plans/2026-10-17-verified-diagnostics.md) ·
[User guide](../../docs_page/diagnostic-evidence.md) ·
[Live summary and hashes](adt-vscode-1.2/evidence/diagnostics-live-summary.json)

## Implementation decisions

| Area | Small verified implementation | Deliberate boundary |
|---|---|---|
| SYN-01 | Shared batch handler for SAPRead SYNTAX and SAPDiagnose syntax | Stored explicit objects only; no source snapshot claim or per-object fallback |
| FEED-01 | Target-advertised attributes/operators, typed AND filters, existing pagination | No arbitrary grammar, URL, nested trees or schema cache |
| DDIC-01 | Advertised existing log, structured bounded hierarchy | No activation and no correlation with a new attempt |

The initial parser spike exposed eight failing regression cases: foreign/unrequested reports,
foreign messages, oversized syntax XML, three invalid query depths and ambiguous schema identities.
After correction all 16 parser/log cases passed. The handler, existing syntax and diagnostics suite
then passed **238 tests across five files**, including denied calls and invalid inputs making no SAP
requests. Further tests exposed plain-text DDIC message loss and hidden sibling syntax errors; both now
retain all messages. Full-suite and independent review results are recorded below.

## Live validation

A4H, SAP_BASIS 758, client 001, HTTPS 443, existing Basic identity; writes, SQL and data preview off.
No SAP objects or persistent settings changed. The final dispatcher path produced:

| Check | Observed result | Elapsed |
|---|---|---|
| Four CLAS/PROG/INTF/DDLS active objects via SAPRead | Passed; three DDLS warnings retained | 1,581 ms |
| Same stored inactive request via SAPDiagnose | Failed; native program error retained | 827 ms |
| Dumps schema | Advertised attributes/operators parsed | 198 ms |
| Explicit nonmatching error + datetime filter | Zero rows; no incident content collected | 216 ms |
| Existing domain activation log | Available, nine entries, old timestamp, no attempt correlation | 218 ms |
| Sampled DTEL and TABL | Unsupported: relation not advertised | 193 / 184 ms |

A separate missing-program spike returned a native processed error about the REPORT statement,
not a clean result. This is why the docs do not equate a processed report with object existence.
Fixtures preserve the native syntax/log contract and a normalized projection of the dump schema;
raw responses and source manifest remain private under `test-results/diagnostics/`.

This stage does not claim new live qualification on 750/816, BTP, principal propagation or
multi-target HTTP. Prior 816 feed research remains supporting evidence; this implementation was
live-tested on 758. Target-specific schemas and unavailable states remain authoritative.

## Historical coverage

[Bounded pilot follow-up](adt-vscode-1.2/evidence/history-pilot-summary.json) selected eight existing
Dictionary/text/FUGR objects from the pilot gaps. `scripts/probe-review-history.ts` is reproducible
with existing A4H credentials and an explicit new private output directory.

- PROG/CLAS text metadata advertised no history relation.
- Pilot DOMA/DTEL/TABL/TTYP/FUGR histories contained only `00000` (current state).
- The transport demo domain had one archived `00001` plus current `00000`; this does not supply
  two archived payloads, and its one archived content request returned 403. The read-only probe
  stopped without any authorization workaround. No family met the adapter's historical evidence requirement.
- An initial pass reused the product's narrow source allowlist, which correctly refused these
  unsupported families. The research probe now permits only a canonical advertised revision URL
  under the exact fixed fixture owner; production URL policy remains unchanged.

Stop condition reached: no broader adapter is implemented. FEAT-86 remains research, narrowed by
these observations. No current-versus-current substitute or invented baseline is used.

## Review and release checks

An initial full run found documentation/schema snapshot drift; the matching tables and snapshots
were corrected. The next complete run passed **9,030 tests / 323 files**. A later nested-message
regression failed before the parser fix and then passed with all 35 focused syntax/handler checks.
Final parent integration and exact-commit Claude Opus 5.5 Max GUI review follow below.

The integrated product at `5bc693b3` passed **9,046 tests / 323 files**. Typecheck, build, Biome,
policy validation, schema/file budgets and strict docs passed. The final live dispatcher run above
uses that exact source commit. The native readers remain below 150 lines each; only the existing
dump paginator's file budget grew by 20 lines. No tool wire/token budget increased.

The history probe used 15 GET attempts, 30,985 successful response bytes and 2,434 ms, with no
mutations or exhausted budget. It stopped after the denied archived-content response.
