# BTP editor acceptance after CF reauthentication

Draft [PR #1025](https://github.com/arc-mcp/arc-1/pull/1025), read-only acceptance on 19 October 2026.
This closes the deployment blocker recorded in the [native MCP composition follow-up](2026-10-19-native-mcp-composition.md).
It tests the direct ARC-1 links and delivery of the optional native-navigation hint, not successful
composition with SAP's separate local MCP server.

## Candidate and setup

The existing `arc1-multi-beta` app in `us10-001`, space `abap-dev`, temporarily ran a fresh build of
`22b9ff49bc8edcf70e6721bae77b808849acf835` (runtime implementation `ecf89bde`).
Candidate droplet: `57ee21d8-e8f6-47e8-a97a-4f782e1cafd0`; reported version `1.6.0`.
The uploaded JavaScript tree SHA-256 was
`59e7ece04bd44bf2c8f4bac6ffe304e348d110edd8dafdc13b4f942e6f904d63`.

The only presentation environment change was `ARC1_IDE_LINKS=on`, with no global destination alias
or SID. Existing XSUAA, Destination and Connectivity bindings, target policy, safety settings and
one-instance/512 MiB sizing were retained. No SAP object, destination, role or Cloud Connector
configuration was changed. A normal browser authorization-code/PKCE login supplied the harness's
user token. CF login and this BTP application login are separate sessions.

The deployment command's `--no-route` option temporarily unmapped the existing route; it was
immediately mapped back to the same app before authentication and acceptance. No new route was
created. Future updates should omit this option when retaining an existing mapping.

## Live MCP matrix

| Check | Result |
|---|---|
| Four targets, baseline plus both editor styles on pinned and aggregate routes | 20 source reads passed |
| Missing preference, user-agent only, unknown/conflicting editor, wrong target map and conflicting map, each route | 12 source reads passed with no links |
| Concurrent Eclipse / VS Code / no-preference requests, then a preference-free follow-up | 4 passed, no preference leakage |
| Eclipse interface, program and CDS source | 3 passed with native main-object links |
| Both routes × Eclipse / VS Code / no preference after CF restart, same token | 6 passed |
| Same six checks after a real `refresh_token` exchange | 6 passed |
| No bearer / unknown pinned / unknown aggregate target | 401 / 404 / tool error respectively; no link or supplied alias leaked |
| `A4H/100` pinned active class read | Failed after 121.3 seconds; one error block, no link |

The 36-case primary matrix covered `A4H/001`, `A4H-2025/001`, `NPL/001` and shared-Basic
`A4H-BASIC/001`. Eclipse used `NPL` for NPL and `A4H` for the A4H targets, including the public alias
`A4H-2025/001`. Each original source block matched its preference-free baseline. The A4H client-001
class hash remained `631ff0819d097f18752a7cab744dc95b61fc6ce76282857012d5ec4b4eff58f0`.
The native-resolver instruction was present and within 2,048 characters on every matrix connection.

VS Code mappings in the SDK matrix are serialization fixtures, not qualification that one local
alias matches every backend. Actual editor opening used only the user-confirmed `A4H/001` →
`A4H2023-2` mapping. Eclipse extras were `IF_SERIALIZABLE_OBJECT`, `SAPMSSY0` and `I_CURRENCY`;
their BTP responses had the expected `/oo/interfaces/`, `/programs/programs/` and `/ddic/ddl/sources/`
paths. Opening those types remains backed by the separate native-dialog tests.

Client-100 audit anchor: `REQ-230`, 09:54:46–09:56:46 UTC; terminal event reports `AdtNetworkError` after
120,002 ms. Per-user destination setup succeeded first. The earlier original-app baseline also
reproduced this source timeout, so this remains an infrastructure/source-read qualification gap,
not a failure introduced by link decoration. One failed retry here does not establish its root cause.
An initial harness launch before the OAuth callback had finished was excluded: it had no access token
and made no source requests. Only completed authenticated attempts appear in the matrix above.

## Actual Copilot acceptance

Eclipse 2026-06 / Copilot 0.21.0 and VS Code 1.142.0 / Copilot 0.70.0 used Gemini 3.8 Flash.
VS Code used the **Local** harness. Each editor had separate, stable `btpPinned1025` and
`btpMulti1025` HTTP entries and its own normal OAuth flow. No bearer token or local proxy was put
in either configuration. Eclipse required only `requestInit.headers.Arc1-Ide-Client=eclipse`;
VS Code used its editor header and exact `A4H/001=A4H2023-2` mapping.

| Client | Request | Observed result |
|---|---|---|
| Eclipse | Pinned `CL_ABAP_TYPEDESCR`, no `target` argument | One successful SAPRead; correct SID/client and clickable-looking `adt://` link rendered |
| Eclipse | Aggregate `CL_ABAP_CLASSDESCR`, `target=A4H-2025/001` | One successful SAPRead; public alias retained in label, real SID `A4H` in URI |
| Eclipse | Aggregate `CL_ABAP_TYPEDESCR`, `target=A4H/001`, after CF restart | One successful SAPRead and exact returned link rendered |
| VS Code | Aggregate `CL_ABAP_TYPEDESCR`, `target=A4H/001` | One successful SAPRead with target present and exact direct link rendered |
| VS Code | Pinned `CL_ABAP_CLASSDESCR`, after aggregate call | One successful SAPRead without target and exact direct link rendered |
| VS Code | Aggregate `CL_ABAP_TYPEDESCR`, after CF restart | One successful SAPRead and exact direct link rendered |

CF audits independently record all six successful calls, with `GithubCopilot/1.527.0` or
`Visual Studio Code/1.142.0`. These are actual clients; the separate matrix case with a deliberately
supplied user-agent is not counted as Copilot evidence. Request anchors before restart: Eclipse
`REQ-196` at 09:52:52 UTC and `REQ-211` at 09:53:31 UTC; VS Code `REQ-241` at 09:56:41 UTC and
`REQ-243` at 09:57:25 UTC. After restart: VS Code `REQ-66` at 10:00:04 UTC and Eclipse `REQ-68`
at 10:00:19 UTC. IDs are process-local and require their timestamps.

Clicking the pinned VS Code answer first reached a file-not-found preview while its local destination
was disconnected. **Log On to Destination…**, normal browser SAP sign-in, closing the failed preview,
and clicking the same link again opened `cl_abap_classdescr.clas.abap`; the expected class definition
and Runtime Type Services source were visible. No file was created, edited, saved or activated.
This is fresh flat-URI opening evidence, not canonical URI, dirty-buffer reuse or edit parity.

The new Eclipse answer rendered its exact `adt://` link, but an automated click did not open a fresh
editor. Its existing ADT handler preference was not changed in this round. The earlier user screenshots
show the project chooser and opened source, but the accompanying reply concerned the HTTP handoff;
they do not uniquely identify a direct-link click. The earlier research record and setup guide now
state that evidence boundary explicitly. Native-dialog/browser opening remains verified separately.

## CI and review

[CI run 39228587820](https://github.com/arc-mcp/arc-1/actions/runs/39228587820), head `22b9ff49`, completed:

- Node 22 and 24: **9,684 unit passes each**, zero failures/skips.
- Integration: **261 passed, 98 skipped**, zero failures.
- E2E: **143 passed, 4 skipped**, zero failures.
- Docs, MTA, gate, reliability, dependency/Socket and CodeQL checks passed.

Counts were read from downloaded JSON artifacts. The CI merge ref includes newer main-branch tests;
the local runtime suite had 9,444 passes. Skips are not live evidence. The actual Opus 5.5 Max review
and addressed findings are recorded in the composition dossier; no runtime code changed in this
acceptance follow-up, so it does not claim a new review run.

## Cleanup and remaining scope

The original droplet `6f485d59-0037-4b8b-aa42-3c9ef4356ea2` is restored. Health reports `ok`,
version `0.9.27`, startup `2026-10-19T10:02:32.275Z`. API comparisons confirmed the original
environment, process command/health check/sizing, service-binding identities and effective routing
(same route GUID/URL, app/process, port 8080, weight and HTTP protocol). Remapping created a new
route-destination GUID and timestamps; those metadata are not byte-identical to the baseline.

Eclipse's original MCP configuration was restored exactly, including its unrelated server entries.
The isolated VS Code window was closed and its temporary MCP config disabled; the user's original
window stayed open. No Eclipse project, editor source or handler preference changed. Temporary
local OAuth/configuration backups and raw logs were removed after verification; sanitized evidence
remains in `/tmp/arc1-btp-20261019/`. This test did not permanently upgrade the shared BTP app.

Remaining gaps are client-100
reliability, a second SAP identity, a live known-but-ungranted target with `xsuaa-attribute`, PP-only
multi-instance acceptance, direct Eclipse Copilot clicking and exact project/backend matching.
Optional native-MCP composition remains experimental; its earlier model-stop and canonical-opening
failures were not retested or resolved by these direct-link checks.
