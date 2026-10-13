# PR #677 — refreshed acceptance tests and October 13 live baseline

Status: **test implementation complete; authenticated acceptance is still partial, not merge sign-off.**
This supplements the [September validation record](2026-09-15-pr677-target-authorization-implementation.md)
without relabeling those older results as final-build evidence. An external tester reported that it
worked, but supplied no build, client, configuration or negative-case notes; that is encouraging
feedback, not a reproducible acceptance result.

## Revision and isolation

- Merged latest `origin/main` `e0c3389234ea2c7bd6900146c5bb6e30fddbc28c` into the PR in
  `baa72bcf`. The merge was clean. Production source deployed below is exactly that merge;
  subsequent changes in this follow-up are test/harness/documentation only.
- Clean `npm ci` and build used Node 24.11.1 and locked, published `@arc-mcp/xsuaa-auth` 1.1.0.
- Reused only `arc1-ta-677-test`, its existing route and its dedicated `arc1-ta-677-xsuaa`.
  Destination and Connectivity bindings are shared and were not modified.
- CF organization was at its 4,096 MiB memory and 10-route limits. Stopping/redeploying this
  existing 384 MiB test app avoided deleting anything or changing other apps.
- Uploaded only built `dist`, `bin`, package manifest/lock, README and LICENSE. No repository
  `.env`, user fixture, key or local auth package was uploaded. Preserved strict PP, no cache,
  explicit target authorization, disabled Basic/writes/UI/plugins, and the ATC/unit-test deny list.
- CF staged Node 24.19.0 with buildpack 1.9.4 on cflinuxfs4. The final process uses the original
  `exec sh ./bin/start-cf.sh` command and its adaptive memory policy. A temporary staging-only
  `HUSKY` property was removed. Original public URL and authorization settings were read back.
- New droplet: `a99d1212-e1fc-48d9-893c-c89ce81850cc`, SHA-256
  `bd66fa2d8d9be8c66060e9d5a560918cb025a67775f205bb5bf62c134084f9fa`.
  Previous droplet retained for rollback: `bf04512b-ad25-4542-b79f-0b5727dc1c67`.

## Test additions

The [acceptance harness](../../scripts/spikes/pr677-target-authorization/README.md) now supports:

1. Optional, fixed `TVARVC` client-marker checks through both aggregate and pinned endpoints.
   Both data and SQL probes select only `MANDT`, `NAME`, `LOW` for `ZARC1_CLIENT_MARKER`, with
   at most two rows. Positive results must contain exactly one marker for the requested client.
   Permission tests require the exact structured denial code; outages are failures, not passes.
   No arbitrary SQL, table names, marker creation or SAP writes are accepted.
2. A same-tenant, second-application **human** JWT-bearer exchange fixture. The source assertion
   must be a verified primary-app user. The issued foreign token is independently checked by
   its issuing application's SAP SDK and user-principal verifier, including expected identity
   and exact local scopes/attributes, before ARC-1's wrong-audience rejection is tested. Failed issuance is
   not a runtime isolation pass. Reciprocal runs are needed for both directions.
3. Offline oracles for the new fixtures: wrong clients, empty/duplicate markers, wrong identities,
   wrong/absent grants, machine principals, SDK/transport errors, and attempts to supply arbitrary
   SQL or send an assertion to another tenant. These are harness tests, not live acceptance.
4. Updated the stale deployment-document assertion to expect the current canonical
   `multi-target-authorization.md` link. No runtime security assertion was removed.

## Local verification

- Build, typecheck, lint, action-policy validation, schema/file budgets and BTP MTA profile validation passed.
- Full unit suite: **8,793 tests / 304 files passed**, both with two workers and on a subsequent
  default-concurrency rerun. The first run, concurrent with typechecking and other local work,
  hit four subprocess/startup timeouts (CLI and signal/audit tests). They did not reproduce in
  either full rerun. Timeouts were not raised and no tests were skipped.
- Harness self-tests: **36 passed**. This includes nine new tests; real-system coverage is below.
- `npm audit` reported four high entries from one `node-forge` advisory through the SAP SDK chain.
  Latest main already contains the time-limited `GHSA-86w9-cpqp-85rv` acceptance until **October 21,
  2026**. `npm run audit:ci` passed under that unchanged exception. This is not a claim of
  non-exploitability or a clean raw audit; reassess before release or exception expiry.

## Initial live baseline (before IAM-change approval)

All requests below used the isolated app on the merged production source. No BTP role collection,
XSUAA descriptor, IAS membership, destination or SAP authorization was changed in these runs.
The secondary user had the existing isolated Viewer collection and no target grants.

| Run | Assertions | What this proves |
|---|---:|---|
| Anonymous/invalid bearer, aggregate + compatibility + pinned routes | 14/14 | HTTP 401 and private/no-store responses |
| Fresh private-window password login, secondary user | 57/57 | Valid user/read scope, missing target attribute, empty tool projection, hidden/unknown target denials |
| Refresh of that token | 57/57 | Supported refreshed user, still no grants, same denials |
| Same-app JWT-bearer user exchange | 57/57 | Supported exchanged user, still no grants, same denials |
| Original token replay plus four explicit data/SQL target-denial probes | 73/73 | Both clients denied for both operations; aggregate exact policy errors and pinned 404s |

Total: **258 passing live assertions**, zero failed assertions in these runs. These are repeated
boundary assertions, not 258 distinct business scenarios. Login identity and IdP origin were
verified privately. Initial/refreshed/exchanged token sizes were 2,049 / 2,072 / 2,076 bytes.
The IAS admin session remained available; the completed private login window was closed.
The reused no-grants refresh test does not measure role-revocation freshness.

The marker-denial run did **not** prove a successful SAP query, client marker, or mapped SAP user.
At the end of this baseline, the foreign-human exchange oracle had not yet been exercised against
a second live service; the approved follow-up below closes that one-direction gap.
No unavailable fixture is counted as a passing security test.

## Approved live role matrix (October 13, approximately 10:48–11:14 UTC)

The user approved temporary changes to the isolated `ARC1 PR677 …` collections/assignments for
the two test users, machine issuance on the dedicated XSUAA, and one disposable second XSUAA
application. Starting role collections, assignments, mappings and the application's security
descriptor were saved privately. The same deployed production revision/droplet was used throughout;
no production code fix was needed in this round. Primary login used its normal browser context;
all secondary logins used incognito. Tokens stayed in the local harness's memory.

| Scenario | Passing assertions in the named run | Evidence and limits |
|---|---:|---|
| Viewer, exact `A4H/100` | 132 | Only the granted target projected; data and SQL denied with the expected scope error |
| Data Viewer + exact target, new JWT-bearer token | 129 | Data marker succeeds through aggregate and pinned routes; SQL remains denied |
| SQL + Data + exact target | 137 | Data and SQL markers both succeed through aggregate and pinned routes |
| Primary exact `A4H/001` | 118 | Correct target projection and rejection of ungranted/unknown targets |
| Concurrent disjoint primary/secondary users | 118 + 132 | Interleaved initialize/list/call checks retain each caller's projection; not independent SAP-username evidence |
| Two exact roles combined | 132 | Verified claim union and complete unpaged two-target catalog |
| Two exact targets + Data/SQL | 166 | Both clients return their own `MANDT` and marker value through both routes |
| Admin without target grants | 73 | Admin diagnostics remain available; no target execution bypass |
| Admin + explicit `*` | 130 | All four currently active targets projected/granted; positive execution checked only on the two 2023 clients |
| Admin + `*` + exact role | 130 | Union remains all-target |
| Admin + `*` + invalid `A4H/*` | 73 | Entire grant set rejected; `*` does not rescue a malformed set |
| 50 / 100 / 256 exact grant values | 118 each | Real issued user tokens traverse XSUAA, CF and ARC-1; only registered/granted targets are projected |
| 257 exact values | 57 | ARC-1 rejects the oversized grant set completely, with no truncation or partial access |
| Machine with read / read + Admin | 21 each | Real machine tokens independently verified, then HTTP 403 before inventory/execution |
| Other application's human token | 16 | Source SDK verifies the actual human and other app's distinct exact grant; primary SDK rejects wrong audience and ARC-1 returns HTTP 401 |

The foreign-human test used the same tenant and IdP origin, the same attribute name, and a separate
application with a different exact grant. It proves **one direction** only; it does not cover a
second ARC-1 deployment, a second IdP origin, or every cross-application trust configuration.
Temporary machine authorities were solely a fixture to issue real tokens, not a supported
production setup. Once restored, a new machine-issuance attempt was refused by XSUAA (HTTP 400);
that issuer refusal is separate from the successful runtime 403 tests above.

### Measured revocation and browser behavior

1. Adding the Data Viewer role did **not** add `data` to a token obtained by refreshing the older
   Viewer session. That token still passed the Viewer scenario (132 assertions). A new JWT-bearer
   user exchange obtained the updated scopes and passed the Data Viewer scenario.
2. After removing the secondary user's exact-target role, replay of the original token and refresh
   of that session still authorized `A4H/100` (132 assertions each). A fresh expiry was not revocation.
3. A new JWT-bearer exchange and a genuinely fresh incognito password login had no target attribute
   and denied all targets (57 assertions each).
4. Within the subsequently reused incognito browser session, adding the exact role and starting a
   **new authorization-code login** produced the new grant (137 assertions). Removing it and
   starting another authorization-code login removed the grant (57 assertions). Cookie deletion
   was unnecessary in these measured runs; this is not a guarantee for all IAS/SSO configurations.
5. Opening the bound XSUAA logout URL built by `buildXsuaaSessionRefreshUrl` reached ARC-1's
   `/oauth/logged-out` confirmation. A new authorization-code flow then requested credentials;
   the secondary login still had no target grants (57 assertions). This verifies the bound
   logout/reconnect operation, not a newly reproduced `invalid_scope` error-page injection.

Two exploratory expectations were wrong: the first refresh check expected newly added scopes
(three failed assertions), and the first reused-browser login check expected a stale missing grant
(26 failed assertions). Inspection of the independently verified tokens explained both. The same
captured tokens passed the corrected, explicitly named scenarios; no runtime code or policy was
weakened, and these exploratory failures are not hidden by an overall zero-fail claim.

### Size, routing and audit observations

- Access-token sizes at 50 / 100 / 256 / 257 exact values were **3,402 / 4,336 / 7,248 / 7,266 bytes**.
  These are token bytes, not total HTTP-header sizes. The scale fixtures included one real target
  and synthetic exact IDs; the active registry still had four targets. This does **not** establish
  support for 256 active backends or a customer with large enterprise group claims.
- The two-client markers are the pre-existing `TVARVC` parameter `ZARC1_CLIENT_MARKER`: client
  `001` returns `001`, client `100` returns `100`. The harness selected only the fixed marker fields
  and did not create data. This proves physical client routing, not which SAP username PP mapped.
- Independent destination inventory readback confirmed four active PP targets and one Basic
  candidate excluded under the unchanged Basic-disabled setting. No destination was changed;
  successful backend access was not asserted for the 2025 or NPL targets.
- A bounded sample of CF logs contained expected missing/malformed/over-limit/not-granted
  decisions and no raw entitlement-array/token fields in the inspected denial events. This is
  neither an exhaustive redaction audit nor durable BTP Audit Log evidence. Absence of a log entry
  alone is not proof that SAP was never contacted.

### Cleanup and restoration

- Readback matched all six starting isolated collections, including role references, user
  assignments and attribute mappings. The secondary user's pre-existing Viewer assignment was
  preserved. No new target or capability assignment remains.
- All eight saved descriptor fields matched after restoration: app name, tenant mode, scopes,
  authorities, foreign-scope references, attributes, role templates and OAuth configuration.
- The disposable foreign-human collection, service key and second XSUAA service were removed.
  Existing fixture roles, the original harness service key and the test app were preserved.
- Shared service bindings, original destinations, IAS group memberships/mappings and SAP roles
  were not modified. No other application was stopped or deleted.
- The harness stopped without persisting tokens; the temporary credential files were removed.
  The secondary incognito window was closed and the normal IAS admin window was preserved.
- After recording this round, all 36 harness self-tests, 22 focused documentation/session-recovery
  tests, strict MkDocs build and `git diff --check` passed. The preceding head's complete PR checks
  were green; a documentation-only evidence commit still needs its own CI results.

## Exact next input and remaining gates

The saved IAS test credential worked, so another secondary-user password entry is not currently
needed. The core static role matrix now has final-build evidence, but the
[contract's live gates](../plans/xsuaa-target-authorization.md#live-btp-acceptance-gates) are **not
all closed**. In particular:

1. **Backend identity:** a primary-user login in the opened client-100 SM20/WebGUI tab is requested
   to inspect existing, narrowly selected audit evidence. If suitable records do not exist, a Basis
   owner must agree an alternative; do not enable broad tracing, create helpers or grant SAP_ALL.
2. **Future wildcard target:** separately approve one temporary client-100 PP destination copy
   with a unique PR677 alias and restarts of only the isolated test app, then deletion/restoration.
   It is subaccount-visible and another multi-target app could discover it on reload; role-only
   approval does not cover this. No such destination was created in this round.
3. **Installed clients:** run the Viewer/Data/SQL/Admin, schema-refresh and unchanged-legacy cases
   in the named real MCP clients. The harness is not Inspector/Cursor/VS Code coverage; the
   external tester's unversioned success report cannot replace these cases.
4. **Application/origin isolation:** reciprocal application acceptance and the same email under
   distinct IdP origins remain untested. A second approved origin/identity fixture is needed.
5. **Optional IAS recipe:** September evidence remains historical. Replay group-fed, static-plus-IAS,
   unrelated-group filtering and lifecycle cases on this build before recommending that recipe as
   final-build verified; do not silently mutate existing IAS mappings or group membership.
6. **Operational limits:** real enterprise-group token/header size, large active inventories and
   durable BTP Audit Log delivery remain unmeasured. The 256-value parser boundary is not a fleet
   sizing guarantee. The documented revocation window still needs operator acceptance.

Roadmap checked: **no new roadmap impact**. This closes test-harness gaps in existing PR #677,
not the independent Basis-handbook review (DOC-02) or multi-tenant embedding work (FEAT-59).
