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

## Live tests actually completed

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
The new foreign-human exchange oracle has **not yet been exercised against a second live service**.
No unavailable fixture is counted as a passing security test.

## Exact next input and remaining gates

The saved IAS test credential worked, so another secondary-user password entry is not currently
needed. A narrowly scoped approval was requested to temporarily change only the isolated
`ARC1 PR677 …` collections/assignments for the two test users, enable machine issuance on the
dedicated test XSUAA, and create/delete one additional isolated XSUAA service for the foreign-human
case. Snapshot and restore starting assignments/descriptors; do not touch shared XSUAA services.

After approval:

1. Replay exact, multi-target, Admin-without-grants, explicit-all-target and concurrent-human
   cases on this build; combine Data/SQL roles with the bounded positive and negative markers.
2. Run supported-human cross-app rejection and machine/Admin-machine rejection with real issued
   tokens. Record an issuance/configuration failure separately from a runtime denial.
3. Correlate permitted calls with independently observed SAP user identity. The marker checks
   physical client routing, not the mapped username. A Basis trace or equivalent backend evidence
   is still needed; do not infer it from token email or `SAPRead(SYSTEM)` alone.
4. Obtain separate approval for any temporary marked destination used to prove wildcard admission
   after inventory reload. Subaccount discovery is shared; this is not covered by role-only approval.
5. Installed-client catalog/login/refresh checks and the optional IAS-fed acceptance gates remain
   as specified in the [contract](../plans/xsuaa-target-authorization.md#live-btp-acceptance-gates).
   Large active inventories and durable BTP Audit Log evidence also remain unmeasured here.

Roadmap checked: **no new roadmap impact**. This closes test-harness gaps in existing PR #677,
not the independent Basis-handbook review (DOC-02) or multi-tenant embedding work (FEAT-59).
