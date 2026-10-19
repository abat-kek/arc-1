# Simple native MCP composition: implementation and acceptance

Follow-up in draft PR #1025 to the [setup simplification](2026-10-19-ide-setup-simplification.md).
The user requested the small conditional-instruction approach before adding another integration layer.

> Later update: [BTP-to-native end-to-end acceptance](2026-10-19-btp-native-end-to-end.md) verifies
> canonical source opening for pinned and aggregate Copilot runs. The initial failures below remain
> historical evidence; session stability, model adherence and edit/save parity are still open.

## Implemented behavior

ARC-1's initialize instructions now name SAP's native `abap_object_list_file_uris` and
`abap_object_get_file_uri`, conditionally for requested VS Code navigation. The same guidance is sent
for single-system stdio/HTTP, aggregate, and pinned per-user/shared connections. A denied/no-target
handshake contains no native-navigation hint. No tool/schema/header was added, and ARC-1 never
connects to a laptop endpoint or receives its MCP token.

The hint prefers an existing ARC-1 link. Otherwise it requests source rather than `.json` metadata,
requires a local destination confirmed by the user for the same backend/client, excludes SID/count
and tool-output inference, and stops on failure. The original revision presented returned URIs
unchanged; the later BTP follow-up uses SAP's verified opener with the exact inner URI encoded as a
query value because Copilot rendered bare `abap:` links as text. It distinguishes
resolution from opening and forbids native edits/activation as part of this navigation workflow.
It is advisory, always present for authorized connections, and has no independent toggle. SAP's
MCP restrictions remain the enforcement boundary for that separate server.

Other setup gaps addressed:

- HTTP `off` now explains that the client must omit `Arc1-Ide-*` headers, instead of generating
  an unsupported `off` header. The Claude default follows the same rule.
- `arc1 config ide` rejects accidental use of the global SAP `--client` option and points to
  `--mcp-client`, whether the global flag precedes or follows the subcommand.
- Traditional single-target HTTP `on` without a configured SID warns that Eclipse links are
  unavailable while mapped VS Code links can still work.
- Real HTTP middleware tests cover `on` with/without SID, the Eclipse-only ceiling, and repeated
  Eclipse/mixed-editor raw headers. They use synthetic SAP responses, not live BTP.

## Live tests on 19 October 2026

An isolated VS Code workspace used the existing confirmed `A4H2023-2` destination for
`https://a4h.marianzeis.de`, client `001`. Its native MCP restrictions allowed that destination
and no object changes. ARC-1 ran local stdio with writes off and IDE links off. The only personal
Copilot instruction was the connection/backend/client/destination mapping and a read-only constraint.
No SAP object was changed, activated, or tested with ATC/ABAP Unit.

| Check | Observed result |
|---|---|
| Installed/running native capability | SAP ADT 1.2.0; local MCP reported 3.62.0 and 33 tools on isolated port 2240 |
| Native class URI resolution after browser logon | `abap_object_list_file_uris` returned `mainFile=cl_abap_typedescr.clas.abap` and six canonical file URIs |
| Later native calls | `PROJECT_NOT_LOGGED_ON` / no ABAP project, even though destination listing still returned the alias |
| Native **Open Object** control, without Copilot | Browser logon completed, then the picker reported the user logged off and destination disconnected |
| Copilot first run, Local harness / Gemini 3.8 Flash | One ARC-1 read passed; native resolution failed; the model tried unconfirmed alias `A4H`. Cancelled; not a pass |
| Copilot revised hint, fresh Local chat / same model | One ARC-1 read passed; all three native calls kept `A4H2023-2`; final answer correctly said neither resolved nor opened, with no fabricated link |
| Revised stop behavior | **Failed**: the model retried same-destination resolver/search calls after failure; the instruction did not enforce a one-call stop |
| Eclipse Copilot local stdio | Per-server mode/SID arrived unchanged; one live ARC-1 class read passed and Copilot rendered the generated `adt://` link |
| BTP redeploy | Initially blocked by expired CF authentication; the [later BTP acceptance](2026-10-19-btp-editor-acceptance.md) deployed and tested this runtime after reauthentication |

Both Copilot ARC-1 reads returned the same class source SHA-256:
`631ff0819d097f18752a7cab744dc95b61fc6ce76282857012d5ec4b4eff58f0`.
The MCP initialize trace confirmed delivery of the revised hint. Actual tool-call records, rather
than the model's narrative, establish which destination was used. The revised run used `get_file_uri`
twice and repository search once, so it did not demonstrate the preferred list-resolver path either.

The native disconnect's cause remains unconfirmed; neither URI routing nor server/session lifecycle
is established as the cause. A successful destination-list call is insufficient evidence of a logged-on
project. At this initial stage canonical opening and composition were **not qualified**; the later
BTP follow-up closes the specific opening cases above, while buffer reuse stays unqualified. The already
qualified direct ARC-1 flat links remain a separate option and need no local SAP MCP server.

Setup friction observed: an old ADT 1.1.2 process on another window exposed only 20 tools on port 2237;
an isolated port exposed the new tools. A `/tmp` workspace entered Restricted Mode. A trusted home
workspace was used without changing trust policy. The `code` shell alias was Cursor on this machine,
so the actual VS Code application CLI was used. The new Copilot harness connected to ARC-1 but was
cancelled before acceptance; only the explicitly selected Local harness runs above are qualified.

## Automated checks and independent review

- Full local unit suite: **9,444 passed, 339 files**, no skipped/failed tests after the final fixes.
- Typecheck, build, policy validation, lint and file/schema budgets passed. Lint retained two existing
  informational diagnostics in unrelated code. Tool-definition fixtures were unchanged.
- Instructions are tested for standard/hyperfocused, aggregate, pinned PP/shared, the maximum
  single-system label, a sole granted target with a maximally JSON-escaped label, and no-target denial.
- Actual Claude Code **Opus 5.5**, `--effort max`, read-only review completed. It found no ARC-1 boundary
  defect. It requested explicit source selection and presentation semantics, tighter setup guidance,
  and instruction-branch/budget tests. These were addressed. Its end-to-end opening qualification
  remains unresolved and is why the optional composition stays experimental in a draft PR.

The earlier [packed npx and Eclipse verification](2026-10-19-ide-setup-simplification.md) remains valid.
A subsequent actual Eclipse 2026-06 / Copilot 0.21.0 stdio run closed the `env` forwarding gap:
`ARC1_IDE_LINKS=eclipse` and `ARC1_IDE_SYSTEM_ID=A4H` reached the test launcher unchanged, and
`SAPRead` returned the same class source hash plus its Eclipse link. Copilot rendered it as a clickable
link. Automated clicking did not produce a fresh opening, so this run qualifies forwarding/read/render
only; earlier user screenshots confirm project selection/source opening without identifying whether
the direct or HTTP handoff link initiated it. Native dialog opening remains separate evidence. The
original MCP configuration and editor layout were restored; no existing server credentials changed.
Eclipse BTP output is covered by the subsequent acceptance. Exact Eclipse project matching,
second-user PP coverage, and native editor save/identity behavior remain open.

## Sources and interpretation

- [VS Code MCP developer guide](https://code.visualstudio.com/api/extension-guides/ai/mcp)
  documents server instructions and tool availability.
- [VS Code customization concepts](https://code.visualstudio.com/docs/agents/concepts/customization)
  distinguish model guidance from enforcement. The observed retries reinforce that distinction.
- [VS Code tool concepts](https://code.visualstudio.com/docs/agents/concepts/tools) describe focused
  tool selection and the different Local/Copilot harness scopes.
- [SAP's RAP tutorial](https://github.com/SAP-samples/abap-platform-rap130/blob/main/exercises/ex01/README.md)
  describes enabling the local ADT MCP server and logging on to destinations.

The instruction-only approach removes extra ARC-1 headers when SAP's resolver is already configured,
but still needs a verified mapping, a healthy native session, and reliable client behavior. It is
not yet an out-of-the-box replacement for direct links. Do not add a proxy, bridge replacement, or
new global configuration based only on successful URI resolution.

## Name/type follow-up

The [fresh identifier investigation](2026-10-19-native-mcp-identifiers.md) confirms direct name/type
resolution to main source for CLAS, INTF, PROG and DDLS, including a namespaced object. Use the list
tool for includes rather than requiring it for every whole-object resolution. It also found that
supplied wrong types can resolve a different type, so a successful call does not establish type
identity. Native reads accept name/type directly. These SDK checks do not replace the outstanding
Copilot/canonical-opening acceptance, and no runtime instruction changed in this follow-up.
