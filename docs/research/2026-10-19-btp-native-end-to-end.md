# BTP → SAP ADT MCP resolver → VS Code: end-to-end acceptance

Follow-up to draft [PR #1025](https://github.com/arc-mcp/arc-1/pull/1025) on 19 October 2026.
This supersedes the earlier **canonical opening unqualified** status for the precise cases below.
It does not qualify editing, saving, every client, or a permanently stable local ADT session.

## Change and minimal setup

The previous instruction returned a canonical `abap:` URI unchanged as a Markdown target. Actual
Copilot output contained valid Markdown, but VS Code rendered it as plain text. The installed SAP
ADT 1.2 URI handler registers `/open`, reads `abapUri` using `URLSearchParams`, and calls
`vscode.open` with the decoded URI. The revised ARC-1 initialize hint therefore describes:

```text
vscode://sapse.adt-vscode/open?abapUri=<encodeURIComponent(exact returned abap: URI)>
```

The exact inner URI is preserved; `%20` becomes `%2520` in the outer query, and namespace escapes
are preserved the same way. The hint prefers `abap_object_get_file_uri` with name/type for an
object and reserves `abap_object_list_file_uris` for include selection. It retains explicit
backend/client mapping, source-identity checks, no metadata links, no denial bypass and no native
editing/activation. On errors/mismatches it tells the client to stop rather than retry another
resolver, bridge or destination. These are instructions, not cross-server authorization enforcement.

The successful test workspace contained only:

- One pinned and one aggregate BTP HTTP entry **for comparison**; normal setup needs only one.
  Neither entry contained `Arc1-Ide-*` headers, a local destination, or a bearer token.
- SAP's automatically registered native MCP provider. Its restrictions allowed the intended
  destination and no object changes; the native edit-file feature was off. Only the two resolver
  tools were selected for navigation. The three old ABAP Bridge tools were deselected for the final runs.
- A single always-on local instruction mapping both test connections/target `A4H/001` to
  `A4H2023-2`, confirmed against the same backend URL and SAP client `001`, plus a read-only constraint.

`ARC1_IDE_LINKS` remained unset/off on BTP. No local alias or native MCP token went to BTP. No new
ARC-1 tool, schema, bridge process, custom agent or application-authentication mechanism was added.
The [setup guide](../../docs_page/ide-integration.md#compose-arc-1-with-saps-native-resolver)
contains the minimal JSON and mapping; the same mapping principle works with local stdio or single-target HTTP.

## Environment and evidence method

VS Code **1.142.0**, SAP ADT extension **1.2.0**, native server **3.62.0 / 33 tools**, macOS ARM64,
actual Copilot **Local** harness with **Gemini 3.8 Flash**. The existing CF test app was temporarily
switched to the candidate with normal cached XSUAA OAuth and Principal Propagation for `A4H/001`.
A separate local ADT browser sign-in was still required. Port 2243 isolated this test from an older
ADT process; it is a test-machine workaround, not a required production port.

Evidence comes from serialized Copilot tool invocations (including their MCP definition/source),
native resolver responses, final Markdown, the actual clicked link, and the resulting native editor.
A source body or model assertion alone is not treated as an opening pass. Source contents, tokens,
private environment snapshots and model reasoning were not committed. A local evaluation compared
both final link query values with the corresponding native response URIs after one outer decode:
**2/2 exact matches**, including namespace and space encoding.

## Final candidate acceptance

The final chat's captured tool source includes the **new** `encodeURIComponent(exact URI)` hint.
No test prompt supplied the wrapper format or a repository path for these runs.

| Case | Actual calls | Result |
|---|---|---|
| Aggregate `A4H/001`, `IF_SERIALIZABLE_OBJECT` | `SAPTargets`; `SAPRead` with explicit target, INTF and active version; native `get_file_uri` with confirmed alias + name/type | Returned source URI matched the link query exactly. Clicking opened `if_serializable_object.intf.abap`; interface source was visible in the native editor. **Pass** |
| Pinned `A4H/001`, `/DMO/I_FLIGHT` | `SAPRead` DDLS, active; native `get_file_uri` with confirmed alias + name/type | Returned namespaced URI matched the link query exactly. Clicking opened `(dmo)i_flight.ddls.acds`; `define view entity /DMO/I_Flight` was visible. **Pass** |
| Missing class `ZARC1_NONEXISTENT_1025_TEST` | One pinned `SAPRead`, CLAS, active → 404 | No native resolver call, no fabricated link; final answer reported the missing object. **Pass for this explicitly requested negative test** |

No SAP source was changed or activated. Native ADT performs normal editor/background requests,
including check runs; this is distinct from an agent invoking a mutation or ATC/ABAP Unit tool.
The successful runs did not call the ARC-1 Bridge extension.

## Failures and recovery retained as evidence

1. With the original hint, BTP class reads passed but native resolution initially reported
   `No ABAP project found` / `PROJECT_NOT_LOGGED_ON`, although destination listing returned the alias.
   Copilot retried native/bridge operations after the error. This was a failed stop-behavior test.
2. Browser sign-in alone did not immediately recover resolution. Opening a harmless object through
   native **Open Object** succeeded, after which the same MCP resolver succeeded. This is an observed
   recovery, not proof of the underlying lifecycle cause.
3. A BTP read and native resolution for `CL_ABAP_CLASSDESCR` passed, but the bare canonical Markdown
   target was not clickable. A manually prompted, verified SAP-handler link rendered correctly.
   Its first click produced a disconnect/file-not-found editor. **Retry Logon**, closing that stale
   error editor, and clicking the identical link then opened class source. This initial class
   acceptance therefore includes manual link-format guidance and session recovery; it is separate
   from the two final candidate runs above.
4. The native communication log recorded an automatic local logoff and a debugger-listener request
   ending with HTTP 400. Timing does not establish causality. No debugger setting or SAP timeout was
   changed, and a long-lived session is not qualified.
5. Restarting the BTP MCP entries left **old initialization instructions** in Copilot's serialized
   tool source. An aggregate attempt in that state failed native resolution and retried it. After
   **MCP: Reset Cached Tools**, **Developer: Reload Window**, and local ADT sign-in, the fresh chat
   received the new hint and completed both final positive cases. Do not count the stale-hint run
   as a test of the new stop wording.

On a local session error, stop and recover the same confirmed destination explicitly. Do not select
another alias, create a missing source file, or report opening based only on URI resolution. The
new missing-object negative case does not prove reliable stopping after every native resolver failure.

## Automated validation and boundaries

- **9,445 unit tests passed in 339 files**, zero failures/skips. Focused initialize/authorization
  tests passed, including the new URI-handler contract and worst-case label budgets below 2,048 characters.
- Build, typecheck, lint, policy validation and source/schema size budgets passed. Two pre-existing
  unrelated Biome informational diagnostics remain; tool-definition snapshots did not change.
- The preceding head `1003a9a1` completed CI successfully after a rerun. Its original failure was a
  newer merge-ref where-used integration expectation, outside this patch; the rerun passed integration
  and E2E. The draft PR records the latest candidate's CI separately.

Still unqualified: automatic recovery from the local logout, all-model stop adherence, same-name
object/type collisions, other OS/harness combinations, canonical include opening, dirty-buffer
reuse, Keep/Undo, save/transport/activation semantics, second-user PP and PP-only multi-instance
routing. Existing client-100 timeouts remain separate BTP acceptance gaps. Native composition stays
experimental; direct ARC-1 links remain the simpler option when SAP's local MCP server is not otherwise used.

## Restoration

The original test-app droplet **0.9.27** was restored and `/health` confirmed it running. Environment,
process command/instances/memory/disk/health-check/log-rate settings, service binding IDs, and every
route-destination mapping were compared against the private pre-test snapshot and matched. This
run did not remap routes. Private CF snapshots/logs were removed after verification.

The original 81-tool Copilot selection was restored, including the three previously enabled Bridge
tools; the two BTP test groups and native resolver group were deselected. The isolated workspace's
native MCP provider and temporary communication logging were disabled, its window was closed,
and completed test login pages were closed. Existing destination credentials and the user's other
VS Code window were not changed.
