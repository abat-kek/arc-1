# Transport review validation and review log

**17 October 2026.** This record covers the focused transport branch, not every feature in the
preserved broader prototype. See the [plan](../plans/2026-10-17-transport-review.md) and
[ADT adoption backlog](adt-vscode-1.2/README.md).

## What was reviewed

- Existing revision selection, raw CTS rollup, per-part reads and failure handling.
- Page budgets, source hashes, continuation identity and inventory binding.
- Collector validation, current-source check provenance, output escaping and file handling.
- Public/runtime schemas, snapshot changes, user guide and roadmap consistency.

The implementation keeps one transport engine, one sequential collector and one static renderer.
It reuses the dispatcher, authentication, policy, HTTP budgets and diff library. There is no new
service, background job, frontend framework, credential store or general workflow engine.

## Plan and implementation review findings

| Finding | Decision / verification |
|---|---|
| Broad prototype mixes independent stages | Extract transport/report work into a new worktree; original 67 file hashes remain identical |
| Collector imported coverage from handler | Move pure coverage counting into the transport evidence module |
| Task state and empty tasks absent from continuation fingerprint | Include task identities/status/owner; regressions fail before the fix and pass after |
| Configured target label could hide a changed SAP client | Bind actual SAP client explicitly; regression fails before and passes after |
| Duplicate objects/parts could inflate collection coverage | Reject duplicate evidence before saving/counting it; two failing-before regressions |
| Empty/malformed entry could look like valid empty history | Validate every entry before filtering; two failing-before regressions; mixed entries also rejected |
| Undated higher-numbered candidate could become a certified predecessor | Retain candidate but mark chronology ambiguous; failing-before regression |
| Oversized first-object metadata could return offset 0 repeatedly | Return an explicit incomplete-review error; bounded regression |
| Existing output directory could mix new JSON with old HTML | Reserve a new private directory before SAP calls; no-overwrite regression |
| New tool parameters absent from docs table | First full run failed seven parity assertions; add both fields to the canonical table |

Tests also cover selected-include 404 with successful main, unattributed changed siblings, REPT
scope, explicit modes, flagged metadata without filtering, history continuation qualification,
wide UTF-8 output, byte/attempt/cancellation limits, CPU diff bounds, malformed collector pages,
current-source drift and inert HTML rendering. CLI tests verify dispatcher use, private files,
failed collection evidence, invalid modes and preserving earlier reports.

## Read-only live spikes

All calls used this local checkout's CLI and an existing Basic-auth test identity, TLS verification
on, cache off, writes/transport writes/Git writes/data preview/free SQL disabled. There were no
SAP mutations, activations, transport releases or configuration changes. These are local CLI
results, not verification that a deployed connector was upgraded.

| Target | Release confirmed through COMPONENTS | Observed result | Limit |
|---|---|---|---|
| A4H/001, HTTPS 443 | SAP_BASIS 758 SP02 | Released A4HK906371: 2 logical objects, 3 changed parts; main adds +1, helper *2→*3, report literal changes. Two current syntax checks passed; two contexts returned. | Existing demo only; no broad CRUD/ATC/Unit suite |
| NPL/001, HTTPS 443 | SAP_BASIS 750 SP02 | CL_ABAP_TYPEDESCR VERSIONS parsed; missing NPLK999999 returns a tool error. Current caller has no released requests. | Active-only standard history; no historical transport pair verified |
| A4H/001 at the 2025 host, HTTPS 443 | SAP_BASIS 816 SP01 | Standard-class VERSIONS parsed; existing empty released A4HK910276 returns zero objects and explicit “not a release verdict.” | No nonempty historical transport pair verified |

Exact public calls:

```text
SAPRead {"type":"COMPONENTS"}
SAPRead {"type":"VERSIONS","objectType":"CLAS","name":"CL_ABAP_TYPEDESCR"}
SAPTransport {"action":"diff","id":"A4HK910276","reviewMode":"released","limit":1}
SAPTransport {"action":"diff","id":"NPLK999999","reviewMode":"released","limit":1}
```

End-to-end report:

```bash
arc1-cli review A4HK906371 --mode released --syntax --context --output-dir NEW_DIRECTORY
```

The initial focused 758 run took 17.327 s including startup and optional calls. Its first page used
10 high-level reads / 10 actual sends, 18,704 successful response bytes and 1,932 ms. The empty
816 review used one send, 4,924 bytes and 163 ms inside the handler. These single-run timings were
collected while local tests ran; they are observations, not benchmarks or sizing guarantees.

The final 758 source replay returned the same complete two-object report, both syntax checks
passed and both contexts returned. It took 22.348 s overall; its page used 10 sends, 18,704 bytes
and 1,654 ms. Tested source manifest SHA-256:
`77258acefe2f97b17f41c3e43bfafacd249ff93c499e9852326fa7ff90d52bc1`.

Private ignored artifacts are under `test-results/transport-review/`: original/updated observation
JSON, live command inputs recorded above, command envelopes/logs, the live report and complete/
partial/stale synthetic demos. Synthetic demos call no SAP system. The final source-file hash
manifest identifies the tested implementation independently of documentation-only changes.

## Automated results

Recorded before draft creation; refresh this section after substantive code changes.

- Initial focused extraction: 203 tests passed in eight files.
- Additional review regressions: six failed before fixes, all 26 then passed in three files.
- Chronology regression: one failed before its fix.
- Final focused review/CLI/docs run: 92 passed in seven files.
- First full suite: 8,910 passed, seven documentation parity failures; corrected and parity 9/9 passed.
- Final full suite: **8,920 passed in 314 files**, 159.25 seconds (two workers).
- Typecheck (source/scripts/tests), build, lint, policy validation (130 entries / 14 schemas),
  file/schema budgets and strict documentation build passed. Lint reported two existing informational
  suggestions in unrelated files; no errors. Final whitespace check passed after removing an extra EOF blank line.

HTML escaping/CSP and report contents are covered by tests. Browser automation refused the local
`file:` preview; no browser-policy workaround was attempted and no new rendered-browser check is
claimed. The original notebook screenshot in the archive was inspected and shows demo flight data.

## Remaining work and release limits

No verified historical text/FUGR/DDIC/deletion adapter, test-transport exclusion rule or backend
history paging is added. Method keys identify a whole class part, not individual hunk ownership.
Current active syntax/context do not validate an older released snapshot. Hashes identify retrieved
source, but collection is not atomic. Multi-target transport diff remains excluded.

The roadmap adds FEAT-86 (historical coverage), FEAT-87 (notebook runner), FEAT-88 (policy explanation),
and corrects FEAT-71's GET evidence. FEAT-69/74 remain open because their local prototypes are not
part of this change. The adoption index retains the other conditional ideas and resume criteria.

## External review

Claude Code Opus 5.5 Max GUI review: pending draft PR and exact revision.
Record each actionable finding, its disposition, tests and final review revision here.
