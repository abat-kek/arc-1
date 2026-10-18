# Application logs and the remaining scope of PR #844

## Decision

Keep [#844](https://github.com/arc-mcp/arc-1/pull/844) open. Its STXL use case overlaps with
[#1012](https://github.com/arc-mcp/arc-1/pull/1012), but INDX/custom clusters, generic DDIC layouts,
and legacy formats are absent from main. Application-log messages are useful for diagnosing failed
imports and background processing; a small native reader is preferable to generic BALDAT decoding.

The proposed `SAPQuery(application_log)` reads one exact saved log number. It uses two guarded GETs
to SAP's existing `APL_LOG_MANAGEMENT_SRV`, with TypeScript validation/projection. It does not run
ABAP, call RFC, install helpers, or copy code from #844. See [ADR-0009](../adr/0009-abap-execution-and-rfc-belong-in-extensions.md).

## Why the native service

SAP documents [Application Logs app activation](https://help.sap.com/docs/ABAP_PLATFORM_NEW/dd52b271fd064d84b4085a87209cb1bd/087c5416539445fa8fcf0fdbd10b96d5.html?version=202310.000)
and [reuse-library service/authorization setup](https://help.sap.com/docs/ABAP_PLATFORM_NEW/b5670aaaa2364a29935f40b16499972d/69263dfde8814ed19646a68675bb5143.html).
This is an SAP-delivered UI service; those documents do not establish a stable released remote API.
Availability must be checked on each landscape. SAP's documented application-log uses include
[diagnosing asynchronous planning-data uploads](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/e296651f454c4284ade361292c633d69/d2c2524cf40a4405a382091f31731532.html?version=2022.000).

Read-only native-source inspection found:

- Overview CDS access control checks `S_APPL_LOG` object/subobject and display activity.
- Message reads retain native log loading, authorization checks, restriction BAdIs and object
  whitelisting. SAP renders the localized messages; ARC-1 does not reconstruct T100 substitution.
- Native calls load log data into session memory. No persistent mutation was found in the inspected
  read chain. Source inspection is not a restricted-user authorization test.

Reading BALHDR/BALDAT directly would need a separately documented table-access security contract;
it cannot promise the same log-specific checks and rendering behavior.

## Verified request contract

1. `ApplicationLogOverviewSet?$filter=LogNumber eq '<20 digits>'&$top=2&$format=json`.
2. Require exactly one matching number; use its returned opaque `LogHandle` in
   `ApplicationLogOverviewSet('<escaped handle>')/ApplicationLogMessageSet` with positive `$top`,
   `$skip`, and `$format=json`.

Direct message filtering by `LogNumber` failed with HTTP 400: the message metadata does not expose
that property, even though native provider source contains a branch for it. A numeric log number
is also not the entity's handle. Both overview and header navigation worked with a real handle.
Unknown-handle navigation returned HTTP 200 with an empty collection, so an empty message response
alone cannot establish whether a log exists. The reader first resolves visibility through overview.

No visible overview match returns `not_found_or_not_visible`. Native 401/403/404/500 failures remain
errors. A successful empty message page is distinct. Unexpected identities, duplicate message
numbers, malformed responses and oversized pages are refused. Next links are never followed.

## Bounds and qualification limits

- Existing data-preview opt-in, caller `data` scope, deny actions and per-user client apply.
- Two GETs share the existing result-admission lease, cumulative byte budget and a 30-second deadline.
- Default 50 messages, maximum 100; one extra message detects continuation. Offset ceiling 5000.
- Native `$top=0` means unlimited and is never emitted. SAP still loads the selected log before
  paging; the client deadline and returned row limit do not bound all SAP-side computation.
- No standalone `/$count`: the inspected native count shortcut precedes the normal header check.
  No text search: native search can render the entire log despite paging.
- Any configured table blocklist hides the action and refuses calls before SAP access. The opaque service can use
  exits/custom persistence, so its complete table lineage cannot be proven.
- No cross-request cache, transactional snapshot, automatic details/long-text loading, log discovery,
  or BTP ABAP support. Message timestamp strings retain SAP's OData representation.
- Audit sinks redact log arguments, native URL keys/filters and response payloads.

Live probes on 2026-10-18:

| Target | Result |
| --- | --- |
| 7.58 | Expanded public `data`-scoped reads matched 4,527 native message projections across 35 logs / 11 object-subobject families. All 59 paging/end/ceiling checks passed, including five empty logs and offset 5000 in a 12,920-message log. This is bounded sampling, not a full read of the largest log. |
| 8.16 | Native service metadata returned 403; direct table preview worked. This does not identify the cause of the 403 or qualify native reads. |
| 7.50 | Native service metadata returned 403; the tested ADT preview endpoint returned 404. No positive application-log read qualification. |

The expanded sample includes Gateway runtime errors, Fiori repository logs, master-data updates,
SPAU, ATC, repository/content activation, archives and CTS. Message types E/W/I/S were present;
the first pages contained 185 long-text and 301 detail availability flags (bodies were not read).
Eight English/German pairs matched SAP's rendering for 67 messages: 25 texts changed with language,
and 23 German messages contained non-ASCII characters. Technical/free text may remain untranslated.

A separate repeatable integration run passed for nine families: 991 messages read completely in
default-size pages, plus page sizes 1/2/100 and exact-end/beyond-end checks. Real HTTP probes also
verified cumulative byte-limit rejection, cancellation during a native GET and queued admission,
and successful reads after each failure. No reader defect was found in these runs.

All probes were read-only; private responses and SAP source remain outside the repository. Native
service metadata still returned 403 on 8.16/7.50; the earlier public-tool checks preserved those errors.
Comparisons use native HeaderSet navigation as the reference, not an independent SLG1/BAL oracle.
The attempted SLG1 UI comparison stopped at unusable GUI text input; its test session was logged off.
Restricted users, PP, BTP ABAP, additional active-service releases, non-Latin text, exception-specific
rendering and independent screen comparisons remain unqualified; no universal compatibility claim.

To repeat the read-only integration test, configure the usual `TEST_SAP_*` credentials and
`TEST_APPLICATION_LOG_NUMBERS` with 1–10 comma-separated exact numbers. Choose stable saved logs
with at most 200 messages each; include an empty log and different application families. Then run:

```sh
npm run test:integration -- tests/integration/application-log.integration.test.ts
```

The test fails on native errors when fixtures are configured; without numbers it records an explicit
fixture skip. It does not discover logs, create data, enable services, or change authorizations.

Unit coverage checks input/response validation, scope and safety denials, privacy, paging, native
errors, and standard/hyperfocused tool contracts. Nine model-evaluation scenarios cover routing,
missing identity, continuation, authorization failure, SO10 distinction, empty/hidden logs,
the offset ceiling and detail flags. Scripted replay tests validate these contracts; no actual-model
accuracy score is claimed.

## Generic cluster proposal

Focused review of #844 at `d27d7cab0bfbf87cbda8e83a783427d42cf3dcca` reproduced unbounded inflate,
row-count allocation amplification, a large-Unicode-string conversion failure, and key collisions
from trimming leading spaces. Other concerns require genuine kernel fixtures: byte order/code-page
coverage, legacy numeric scale, current DDIC layouts versus historical exports, and fragment errors.
The native log reader avoids importing that parser. FEAT-89 retains the useful unfinished scope;
FEAT-88 covers wider native-log functionality and qualification.

Test invitations were posted to [#1000](https://github.com/arc-mcp/arc-1/issues/1000#issuecomment-6241918322)
and [#844](https://github.com/arc-mcp/arc-1/pull/844#issuecomment-6241918732) for the already merged
stored-text feature. Neither invitation describes an unreleased build as an npm release.
