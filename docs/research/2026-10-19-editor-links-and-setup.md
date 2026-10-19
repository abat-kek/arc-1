# Eclipse links and simpler local/remote editor setup

Research and read-only experiments: 2026-10-18/19, continuing
[draft PR #1025](https://github.com/arc-mcp/arc-1/pull/1025).
Runtime tested: `28406c16d5ea0e54516eb52b569d92308010e2e2`.
This follow-up changes documentation and adds client-identity regression tests; the runtime link
contract and plugin manifest are unchanged.

## Findings

1. Eclipse ADT supports `adt://` navigation. Its own Open ADT Link dialog and an external Chrome
   link both opened live ABAP source. The user subsequently confirmed direct Eclipse Copilot
   navigation with screenshots of the A4H project chooser and opened CL_ABAP_CLASSDESCR source.
   Earlier automated clicks were false negatives. The HTTP control also opens a browser by user report.
2. The ordinary Eclipse Share Link identifies a SID, not a unique BTP target, SAP client, or local project.
   Two projects using the same SID and client produced a project chooser. Automatic backend-correct
   navigation needs more than inserting the target SID into the URL. A valid encoded project name
   selected one existing cloud project; arbitrary names and full source opening remain unqualified.
3. The existing VS Code implementation already has a small local setup: two environment variables
   per stdio server. Traditional HTTP with `ARC1_MULTI_TARGET_ENDPOINTS` off needs one `@single`
   mapping; a single pinned target needs
   one exact target mapping. Aggregate configuration is not necessary for single-system users.
4. SAP ADT 1.2's native resolver works against live SAP and returns canonical repository-tree URIs.
   It can potentially remove ARC-1-specific presentation configuration, but still requires local SAP
   MCP setup and a confirmed backend-to-destination match. Canonical URI opening failed with a
   destination disconnect during this run, so resolver success is not full UI qualification.
5. Claude Code passes scoped IDE environment preferences to an ordinary MCP subprocess and to a
   temporary plugin's MCP subprocess. This is explicit opt-in, not reliable IDE detection. Current
   ARC-1 plugin settings do not expose those preferences, and its `@latest` launch does not establish
   that an unreleased feature is available.

## Test matrix

| Experiment | Result | Qualification |
|---|---|---|
| `npx` launches packed PR, links off | Pass | Live read, no link |
| Same packed PR, explicit local alias | Pass | Live read, correctly encoded native link |
| Traditional local HTTP `/mcp`, `vscode` + `@single` | Pass | Viewer API key, live read and link |
| Same HTTP endpoint, no preferences | Pass | Same source, no link |
| Same endpoint, `eclipse` marker | Pass | Same source, no VS Code link |
| Same endpoint, multi-target key instead of `@single` | Pass | Same source, no link |
| SAP 1.2 destination list and resolver | Pass | Actual local SAP MCP, live A4H client 001 |
| Class object URI → `get_file_uri` | Pass, metadata | Returns `.clas.json`, not main source |
| Class source URI / source AFF filename → `get_file_uri` | Pass | Both return the same canonical `.clas.abap` URI |
| Class → `list_file_uris` | Pass | Six files plus explicit `mainFile` |
| Class definitions and namespaced `/DMO/I_FLIGHT` CDS | Pass | Canonical include and `.ddls.acds` URIs |
| Browser → native VS Code canonical URI | Unresolved | Destination disconnect; retry after successful browser logon also failed |
| Eclipse Share Link | Pass | Generated `adt://A4H/...?...` URL |
| Eclipse Open ADT Link | Pass | Project chooser, selected A4H_2023, live CL_ABAP_TYPEDESCR source |
| Chrome → registered Eclipse handler | Pass | OS confirmation, project chooser, live source |
| `adt://A4H.2023/...` authority variant | Rejected | Invalid system ID |
| `adt://A4H_2023/...` literal project-name authority | Rejected | Native Open ADT Link validation: invalid system ID |
| Eclipse Copilot Markdown `adt://` link | Pass, user-verified | Supplied screenshots show A4H project chooser, then CL_ABAP_CLASSDESCR source; diagnostic probe link, not ARC-1 Eclipse decoration |
| Claude Code ordinary MCP preference probe | Pass | `vscode` / `TEST-001` inherited |
| Claude Code temporary plugin MCP preference probe | Pass | Same values inherited; no SAP access by the probe |
| Real VS Code `npx` + `envFile` + per-server `env` | Pass, read/render | Copilot called the packed branch and rendered its exact native link |
| Real Claude Code, two `npx` servers in one session | Pass | Same source hash; only the explicitly enabled server had links |
| Four SDK client names × off/vscode, `npx` | 8 passes | Client name does not override the process preference |
| Real VS Code and Eclipse → existing BTP deployment | Pass, identity/read | Server logs confirmed client user agents; deployed 0.9.27, not candidate decoration |
| Eclipse per-server `requestInit.headers` | Pass | Presentation headers arrived at the local HTTP probe |
| `adt://H01.EN/...` → existing `H01_EN` | Partial | Correct project selected; backend unavailable, source opening not qualified |
| Browser landing page and HTTP 302 → `adt://` | Pass | Both opened CL_ABAP_CLASSDESCR in A4H_2023 |
| Eclipse Copilot plain HTTP control link | Pass, user-reported | User confirmed a browser opens; page loading and ADT handoff were not confirmed by that reply |

All six ARC-1 source-read cases used `SAPRead(type=CLAS,name=CL_ABAP_TYPEDESCR,version=active)`
against `https://a4h.marianzeis.de`, client 001, with writes, SQL, data preview, transport writes,
and Git writes disabled. All preserved the same first source block, SHA-256
`631ff0819d097f18752a7cab744dc95b61fc6ce76282857012d5ec4b4eff58f0`.
Only the appended link block differed. No SAP source, passwords, bearer tokens or service keys are
included in the committed evidence.
The local HTTP instance had multi-target endpoints disabled. `@single` also fails closed on the bare
`/mcp` of a multi-target instance; use its pinned endpoint for single-target IDE presentation.

The package was produced with `npm run build` and `npm pack`, then launched by
`npx --yes --package=<absolute-packed-tgz> arc1`. This verifies npm packaging and stdio startup for
the feature branch, not publication of the feature to `arc-1@latest`. The pack inventory contained
982 files and none of `.env`, `cookies.txt`, or `.arc1.json`.
The subsequent real VS Code test qualified the `envFile` plus per-server `env` configuration:
Copilot 0.70.0 / Gemini 3.8 Flash called exactly the intended `arc1-npx-verified` SAPRead and rendered
the returned link. An initial test used a nonexistent absolute `npx` path and could not start;
correcting it to the installed executable and using a fresh server entry resolved startup. A run
that used the wrong BTP server while local startup was broken was excluded from acceptance.
This new check qualifies local read/render; earlier native opening evidence remains separate.

Real Claude Code 2.1.302 / Opus 5.5 Max called two separately configured packed servers, one `vscode`
and one `off`. An observer compared their actual tool responses: identical source SHA-256 above,
with a link only from the opted-in server. Eight further SDK calls crossed four claimed identities
(`Visual Studio Code`, `Eclipse/copilot-eclipse`, `claude-code`, arbitrary client) with both modes.
All passed and preserved that hash. A stdio process honors its own configuration, not its client's
name; it must not be shared across connections needing different presentation preferences.

## What BTP can learn about the client

A loopback HTTP probe captured only allowlisted headers, initialization/capability metadata and
response summaries. Real clients produced these observations:

| Client | Initialization identity | Later request hints |
|---|---|---|
| VS Code 1.142.0 | `Visual Studio Code`, `1.142.0` | User-Agent `Visual Studio Code/1.142.0`; VS Code conversation/request metadata; no clientInfo |
| Eclipse 2026-06 / Copilot 0.21.0 | `Eclipse/copilot-eclipse`, `4.40.0.v20260601-0713/0.21.0.202608060743` | User-Agent `GithubCopilot/1.527.0`; progress metadata only |
| Claude Code 2.1.302 | `claude-code`, `2.1.302` | User-Agent `claude-code/2.1.302 (sdk-cli)`; tool-use metadata; no clientInfo after legacy fallback |

The installed SDK 1.32.1 creates a fresh server per HTTP request in ARC-1. `getClientVersion()` was
undefined inside later tool handlers for all three clients. VS Code omitted the protocol header
on these requests and the SDK accepted them; Eclipse supplied `2025-11-25`. Claude first attempted
modern `server/discover` with per-request client metadata, then fell back to legacy initialization.
The [2026-07-28 MCP specification](https://modelcontextprotocol.io/specification/2026-07-28/basic)
defines per-request metadata. ARC-1's deliberate legacy-era contract remains in ADR-0006; changing
SDK/protocol era is separate work, not a prerequisite for explicit presentation headers.

The probe also relayed real VS Code and Eclipse MCP requests, with their observed user agents,
to the existing BTP pinned `/A4H/001/mcp` endpoint using fresh authorized OAuth. Both clients read
CL_ABAP_TYPEDESCR successfully. CF application logs confirmed both user agents arrived at the app.
The relay passed JSON-RPC unchanged and used its own existing test token; this is evidence about
request identity and BTP transport, not a new qualification of each client's direct OAuth UI.
The app remained on restored version 0.9.27, which emitted no candidate IDE decoration. No deployment
or environment changes were made. Three synthetic initialization claims, including a made-up
client, were accepted without a session ID: client names are declarations, not attestation.

Therefore “BTP never knows the client” is too broad. It has useful hints, but not a reliable
presentation preference or backend-to-local-destination mapping. Even a verified application
identity would not supply these. A future setup UI could suggest a style from the hints while
requiring explicit confirmation of the destination. Runtime defaults remain off. Never remember
the last initialization preference by user/token/IP: one user can operate several clients at once.

New regression tests cover pinned and aggregate calls: initialization preferences, a VS Code user
agent, and modern-looking client metadata do not independently enable links; explicit preferences
work even with an Eclipse user agent; a following request without preferences remains undecorated.
A transport test verifies fresh handler state while preserving each request's user-agent hint.

## Eclipse details

Installed Eclipse 2026-06, SAP ADT bundles 3.60.2, and GitHub Copilot for Eclipse
0.21.0.202608060743 were inspected on macOS. The native Share Link result for a class was:

```text
adt://A4H/sap/bc/adt/oo/classes/zcl_arc1_task_service?version=active
```

For a standard SAP class, both Open ADT Link and Chrome navigation worked with:

```text
adt://A4H/sap/bc/adt/oo/classes/cl_abap_typedescr
```

The chooser offered `A4H_2023` and `A4H_2025`; both projects display SID A4H and client 001. Selecting
the 2023 project opened active source. This is direct evidence that SID/client alone cannot represent
the public ARC-1 target's backend identity in this landscape. A BTP Destination name is another,
independent identifier and is not automatically an Eclipse project name.
With only one matching local project, a chooser might not appear; that does not prove its backend
matches the researched target. ARC-1 cannot see the local project registry or force a chooser.
The review prompted a further test of literal `A4H_2023`, which the native dialog also rejected as
an invalid system ID before navigation. Further inspection of installed `AdtFileStore` found a
case-insensitive exact project-name comparison after replacing underscores with dots. That match
returns immediately; otherwise each project's SID, destination ID, then HTTP host are considered
and matches collected. No match opens a chooser. Java 21 `URI.getHost()` returned null for `A4H_2023` and
`A4H.2023`, but accepted `A4H.DEV2023`, `A4H-2023` and `H01.EN`. Thus the numeric final label explains
the tested dotted failure; dots in general are not forbidden.

The native dialog accepted `adt://H01.EN/sap/bc/adt/oo/classes/cl_abap_typedescr` and selected the
existing `H01_EN` project without a chooser. Its login then failed because that cloud backend was
unavailable. This qualifies project selection only. No project was renamed or created. Native
project encoding is a promising smaller option, but collisions such as `A_B` versus `A.B`, missing
projects, fallback SID/destination matches and invalid authorities need explicit policy and tests.
Do not describe arbitrary project names as supported or native selection as fail-closed.

External registration was initially disabled. Enabling `adt` in General → Link Handlers made the
Chrome anchor work, following Chrome's normal Open Eclipse confirmation. The fresh preference page
showed `adt` checked and handler “This application”. The Open ADT Link dialog's cached tip could
still say disabled; the registration page and successful external click were the stronger evidence.

Eclipse Copilot first rendered a literal Markdown link to CL_ABAP_CLASSDESCR, with no tool calls or
edits. Automated normal/modifier clicks did not establish navigation. A later diagnostic MCP probe
returned the same direct URI alongside HTTP control links. With the ADT handler enabled, the user
clicked “Eclipse direct” and supplied two screenshots: the native “Choose a project for 'A4H'” dialog
listing A4H_2023 and A4H_2025 (both A4H/client 001), followed by CL_ABAP_CLASSDESCR source in the editor.
This qualifies direct Copilot → OS ADT handler → project selection → source opening on the tested
installation. It does not qualify a core ARC-1 Eclipse formatter, which is not implemented. The
dialog is expected ambiguous-project selection, not an error or an additional authentication step.
A subsequent probe returned both direct ADT and ordinary HTTP control links. Neither navigated
under automated normal/modifier clicks. The user subsequently answered the manual HTTP control
question with “A browser opens”. This qualifies Copilot-to-browser dispatch by user report and
shows the automated negative result was insufficient evidence of a Copilot limitation. It does
not establish that the temporary page loaded, the browser dispatched ADT, or source opened in
that same attempt. The loopback server had been stopped during cleanup before the reply arrived.

The installed plugin and the matching chat-link classes in newer upstream source route Markdown URL annotations through
`FileAnnotationHyperlinkDetector.FileHyperlink`, JFace `URLHyperlink.open`, and SWT `Program.launch`.
No scheme allowlist was found on that path. The separate `UiUtils.openLink` implementation is not
evidence of this path's cause. See the [inspected upstream detector](https://github.com/microsoft/copilot-for-eclipse/blob/b314db437af736364f851334391bc06aa49a6105/com.microsoft.copilot.eclipse.ui/src/com/microsoft/copilot/eclipse/ui/chat/FileAnnotationHyperlinkDetector.java).

Installed SAP bundle inspection found additional project-link handling under `sap-adt-project-*`.
The RFC matching path compares client and connection attributes and can open a project-creation
wizard when no suitable project exists. These parameters also include user/password and routing
fields. This is not a verified, harmless substitute for a local project identifier. No credentials
were put in links, and no project was created. Exact matching across RFC, HTTP/cloud projects,
same-SID landscapes and clients remains to be tested before adopting a richer SAP link format.

### Proposed Eclipse implementation boundary

Direct Copilot ADT dispatch is now user-verified, so a browser service is not required for the
tested Eclipse installation. An HTTPS landing page with an explicit ADT link remains an optional
fallback for other clients. A fixed loopback prototype with an explicit anchor and a separate HTTP 302 redirect both
opened CL_ABAP_CLASSDESCR through Chrome's normal Open Eclipse confirmation and project selection.
The browser-to-Eclipse leg and user-reported Copilot-to-browser leg are now separately verified;
the complete sequence has not been observed in one attempt. A deployed HTTPS
helper adds a service and exposes object identifiers to its URL/logging path. The prototype was not
an arbitrary redirect service and is not a shipped/default component.

Other inspected options do not remove the remaining qualification work:

| Option | Evidence / remaining limit |
|---|---|
| Native SID ADT link | Direct Eclipse Copilot click opened source, user-verified; duplicate SID/client needs manual project choice |
| Encoded native project name | H01_EN selected; valid authority and collision checks required |
| Local destination ID / HTTP host authority | Matching exists in installed code; not live-qualified as a portable mapping |
| Rich `sap-adt-project-*` link | Connection matching/project creation; too much connection data for the simple navigation contract |
| `eclipse+command://com.sap.adt.launch` | General command dispatcher, not a narrowly scoped object-opening contract |
| Workspace/file links | Local semanticfs resources exist, but no portable BTP-to-local-path or Copilot opening qualification |
| Local Eclipse companion | Can validate service/target/project mappings; adds installation and maintenance |
| HTTPS landing page / redirect | Browser-to-Eclipse passed; Copilot-to-browser user-confirmed; complete sequence remains unqualified |

Eclipse's MCP configuration accepted per-server `requestInit.headers`; the real client transmitted
`Arc1-Ide-Client: eclipse` and a mapping to the probe. This verifies a place to configure future
style/mapping preferences, not support for an `eclipse` mode in this PR.

The smallest implementation candidate is an explicit Eclipse presentation mode that emits a
verified real SID and ADT object URI, labels the researched target, and documents manual project
selection. The tested duplicate-SID chooser is acceptable for a navigation aid, but not a guarantee
of automatic backend selection. Native code may choose a matching project without asking in other
landscapes; ARC-1 cannot force a chooser. Exact project mapping should remain a separate option.

Acceptance conditions for that implementation:

- Preserve the current source/JSON blocks and the bounded, post-authorization decoration path.
- Keep VS Code and Eclipse preferences per request; a shared BTP instance must serve both without
  emitting both link kinds to every client. Do not reinterpret the existing `vscode` map as Eclipse data.
- Verify that each intended client can send its own per-server environment or HTTP headers.
- Use verified ADT object URIs, not arbitrary URI templates, command URLs, or project-creation data.
- Omit version queries and fragments from an initial navigation contract. Installed navigation code
  calls `UnlockHandler.doUnlock` for a parsed target version; it is not a passive source selector.
  Fragment behavior is unqualified. The successful native test URIs omitted both.
- Treat any SID-only mode as a manual navigation aid: label the researched target, explain project
  selection, and do not promise or attempt to enforce a chooser remotely. For exact selection,
  qualify the native encoded-project/destination matching or use a
  local companion that maps the service identity plus public target ID to an existing Eclipse project.
- Do not automatically choose the first project with a matching SID. Test duplicate SIDs, duplicate
  SID/client pairs, different clients, HTTP/cloud projects, absent projects and malformed mappings.
- Test native dialog, browser and Copilot clicks separately on each supported OS. Test multiple
  installed Eclipse distributions and which application owns the protocol registration.

No `eclipse` configuration mode is shipped by this PR. The direct-link click blocker is closed for
the tested client. The formatter, real-SID provenance, per-client opt-in, mapping policy and
end-to-end core integration still need their own implementation/tests before supported setup instructions.

## VS Code simplification

The direct link path is the smaller setup for a user with ARC-1 and SAP's editor already installed:
one alias per local stdio process, or one map entry per HTTP target. The bridge and local SAP MCP
server are not prerequisites. A setup command or small extension UI could select the local alias,
ask the user to confirm its system/client, and generate that same existing configuration. That
would reduce JSON editing without introducing another runtime protocol or automatic SID guessing.

For users already using SAP's MCP server, client-side composition is attractive:

```text
ARC-1 research (local or BTP)
  → retain the verified ADT object URI and selected backend
  → confirmed local destination
  → SAP abap_object_list_file_uris
  → match mainFile to files.uris (or deliberately select an include)
  → native editor opening
```

This requires no ARC-1 IDE headers and avoids hard-coding localized repository-tree paths. It still
needs a deliberate mapping; neither one discovered destination nor matching SID alone proves it is
the backend used by ARC-1. It also costs an extra local tool call and remains subject to SAP MCP's
own authentication, destination allowlist and connection lifecycle.

The earlier missing-tool observation was traced to a 1.1.2 language-server process owning port 2237.
That process returned server version 1.0.0 with 20 tools. The 1.2 workspace on a temporary separate
port returned server version 3.62.0 with 33 tools, including both file URI resolvers. Thus installed
extension version alone is insufficient evidence of which local MCP server a client has reached.

The native object-URI resolver returned `.clas.json` for the class object endpoint. Explicit
`/source/main`, source AFF filename, or `list_file_uris.mainFile` is required to select main source.
Definitions and a namespaced CDS URI resolved without guessed tree paths. Opening the resulting
canonical source link in the editor still disconnected the destination during this run. No write,
activation, Keep/Undo, dirty-editor identity or version-selection claims follow from these reads.
The displayed error does not establish the cause; URI shape or VS Code window routing may still
be involved. A future Markdown link builder must escape parentheses as well as applying
`encodeURIComponent`, especially for namespaced object paths.

VS Code's MCP reference supports input variables, but documents that the Copilot harness does not
forward servers needing interactive `${input:...}`. Therefore an alias prompt inside the MCP JSON
is not a universal simpler setup. Prefer a one-time configuration UI that saves a literal, non-secret
alias, or use the explicit two-variable/one-entry setup in the user guide.

## Claude plugin scope

The current `.claude-plugin/plugin.json` has SAP/safety `userConfig` fields and an inline `npx
arc-1@latest` server; root `mcp.json` is the portable plugin entry using `${PLUGIN_DATA}`. Neither
exposes IDE preferences. Do not edit an installed plugin cache as persistent configuration.

Claude Code 2.1.302 / `claude-opus-5-5` with max effort called a synthetic read-only preference tool.
One test used an explicit MCP config; another loaded a temporary plugin declaring that same server.
Both returned exactly `mode=vscode,destination=TEST-001` inherited from a scoped process environment.
The probe did not read credentials or access SAP. Actual ARC-1 + SAP was tested separately through
the packed stdio process. This does not qualify link rendering in Claude's different UIs.
The successful temporary plugin declaration had no `env` block. A follow-up with an explicit
non-secret `env` entry reported that the plugin tool was unavailable and did not execute it. That
run does not establish whether environment merging failed or plugin loading failed; it is not a
pass for the real ARC-1 manifest's environment/substitution path.

These are inheritance experiments, not a recommended process-wide configuration recipe. A global
`ARC1_IDE_DESTINATION` reaches every inheriting ARC-1 stdio server, including servers for another
backend or servers that should have no links. Use per-server `env` instead; the user guide no longer
recommends launching all of Claude with one alias. A dedicated plugin preference must be substituted
only into that plugin server's environment, alongside its SAP connection configuration.

An initial plugin probe used `--strict-mcp-config` with an empty MCP config, which excluded the
plugin server; it was not counted as a successful plugin test. The successful plugin run omitted
that override. The isolated ordinary MCP probe retained strict configuration and succeeded.

Strict validation of the repository plugin reported the existing warning that root `CLAUDE.md` is
not loaded as plugin project context. The validator output, not its process status, was used to
classify that run as a strict-validation failure. It is unrelated to IDE preferences; it is not a
new feature regression and was not silently removed in this PR.

A future editor picker should default to off and expose an exact local destination only when needed.
An isolated copy of the manifest with two new fields and MCP environment substitutions passed
`claude plugin validate --strict` on 2.1.302. The accepted picker shape is a `type: "string"` field
with `options: ["off", "vscode"]` and `default: "off"`; a JSON Schema-style `enum` was rejected.
The destination field was a string with an empty default. This validates a proposed manifest,
not its configuration UI, saved-value substitution or an installed ARC-1 plugin. Using `options`
would require a documented minimum Claude Code version of 2.1.271, according to the
[official userConfig reference](https://code.claude.com/docs/en/plugins-reference#limit-a-field-to-fixed-options).
The final isolated validation output was “Validation passed”; the initial `enum` candidate and the
real repository layout with its existing `CLAUDE.md` warning are distinct failed checks.
The proposed picker must not silently enable VS Code links in Claude Desktop, terminal use, or another editor. A
per-plugin preference can simplify one-system use, but multiple differently mapped stdio connections
still need per-server configuration. Native MCP resolver composition is also possible for a local
Claude client, provided the client can render/open the result; this was not UI-qualified here.

## Cleanup and evidence limits

Temporary HTTP servers were stopped; temporary browser tabs were closed. The VS Code workspace's
MCP port and access restrictions were restored, and global settings were byte-identical to their
backup. Eclipse's ADT external handler preference was restored to its original disabled state.
The original stale-port conflict therefore remains a local setup issue to resolve when adopting
SAP's native resolver. No BTP deployment changes were made in this follow-up.

At runtime commit `28406c16`, every reported GitHub PR check passed, including Node 22/24 tests,
integration, E2E, docs, MTA validation, CodeQL and dependency review
([runtime CI](https://github.com/arc-mcp/arc-1/actions/runs/39167290752)). Earlier live BTP pinned and
aggregate evidence remains in the [BTP dossier](2026-10-18-btp-native-ide-links.md); these local
experiments do not replace or broaden that evidence.

The focused local regression run passed **4 files / 98 tests**: `ide-links`, `ide-request`,
`ide-links-http`, and `dispatch-ide-links`. `npm run build`, `git diff --check`, and
`mkdocs build --strict` also passed. No runtime code, authorization policy, tool schema or test
assertions changed in that initial documentation pass. The later client-identity work adds three
regression cases across `ide-links-http` and `mcp-era-contract` (24 tests in the focused run).
Full typecheck, size/schema budgets and strict docs passed. The first full unit run had three
subprocess startup/time-limit failures in the unrelated CLI/shutdown suites (9,408 passed).
Those two files passed in isolation (56 tests); a complete rerun with two workers passed
**337 files / 9,411 tests**, with no skipped or failed tests. No timeout or assertion was relaxed.

A fresh Claude Code 2.1.302 / `claude-opus-5-5` Max review found test-strength gaps, not a runtime
defect. Its corrections add a positive initialization-identity control, separate synthetic metadata
and user-agent-only checks, and a real HTTP/shared-memory-cache test. Two API-key users alternate
different aliases and opt-out while SAP returns ETag/304 revalidation; the cache retains only source
and each response uses its own preference. The initial new cache assertion exposed the existing
`[cached:revalidated]` response marker; the final assertion explicitly preserves that marker too.
The revised focused run passed 25 tests, with full typecheck and size/schema budgets passing too.
The reviewer read source/artifacts, not the live systems. Matching order, newer upstream-code scope,
and version-query limits were checked against installed bytecode before documenting them.

Final identity/cache test commit `e2aeeda2` subsequently passed every reported PR check, including
SAP integration and E2E ([CI run](https://github.com/arc-mcp/arc-1/actions/runs/39209070910)). Downloaded
reports show 9,652 unit passes on each of Node 22 and 24, 262 integration passes / 97 skips, and
143 E2E passes / 4 skips, with zero failures. Skips do not qualify the corresponding live scenarios.

Claude Code 2.1.302 / Opus 5.5 at max effort independently reviewed the documentation and relevant
implementation. It found a blocking configuration risk in the process-wide Claude launch recipe:
one alias could decorate results from another ARC-1 server. That recipe was removed from the guide;
only per-server configuration is recommended. The review also led to explicit multi-target-off
requirements for `@single`, narrower URI/project-name claims, local package startup examples,
`auto` migration guidance, and clearer distinctions between isolated validation and real plugin
installation. These documentation corrections were checked against code and a fresh strict docs
build; the reviewer did not execute the test matrix.

The smallest proposed implementation follow-up is two default-off/default-empty plugin preferences,
substituted into that one server's existing `env`. Before shipping, qualify upgrade defaults,
saved-value substitution with the existing SAP fields, startup validation, and the intended client
surface. A plain string field avoids adding a picker-related minimum client version. Bridge-supplied
`ARC1_IDE_LINKS=auto` configurations and the CLI help's broad `1.2+` wording need release review too.

## Primary references

- [SAP: ADT links](https://help.sap.com/docs/ABAP_Cloud/abap-development-tools-user-guide/4ec63adf6e391014adc9fffe4e204223.html)
- [SAP: ADT 3.28 link-handler registration](https://help.sap.com/docs/abap-cloud/abap-development-tools-user-guide/version-3-28)
- [VS Code MCP configuration and harness compatibility](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)
- [VS Code MCP extension provider API](https://code.visualstudio.com/api/extension-guides/ai/mcp)
- [Claude plugin manifest reference](https://code.claude.com/docs/en/plugins-reference)
- [Claude MCP configuration](https://code.claude.com/docs/en/mcp)

Installed SAP extension manifests and bundled tools were inspected locally to establish exact
version-specific behavior. Vendor implementation excerpts and private configuration are not committed.
