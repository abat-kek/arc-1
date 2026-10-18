# Eclipse links and simpler local/remote editor setup

Research and read-only experiments: 2026-10-18/19, continuing
[draft PR #1025](https://github.com/arc-mcp/arc-1/pull/1025).
Runtime tested: `28406c16d5ea0e54516eb52b569d92308010e2e2`.
This follow-up changes documentation, not the runtime link contract or plugin manifest.

## Findings

1. Eclipse ADT supports `adt://` navigation. Its own Open ADT Link dialog and an external Chrome
   link both opened live ABAP source. Eclipse Copilot rendered the URI as a link, but clicking it
   did not open source. Treat the Copilot path as an unresolved integration gap.
2. The ordinary Eclipse link identifies a SID, not a unique BTP target, SAP client, or local project.
   Two projects using the same SID and client produced a project chooser. Automatic backend-correct
   navigation needs more than inserting the target SID into the URL.
3. The existing VS Code implementation already has a small local setup: two environment variables
   per stdio server. A single HTTP endpoint needs one `@single` mapping; a single pinned target needs
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
| `adt://A4H.2023/...` project-name shortcut | Rejected | Invalid system ID; not a portable project-name encoding |
| Eclipse Copilot Markdown `adt://` link | Render only | No chooser/editor on click; not an ARC-1 MCP end-to-end test |
| Claude Code ordinary MCP preference probe | Pass | `vscode` / `TEST-001` inherited |
| Claude Code temporary plugin MCP preference probe | Pass | Same values inherited; no SAP access by the probe |

All six ARC-1 source-read cases used `SAPRead(type=CLAS,name=CL_ABAP_TYPEDESCR,version=active)`
against `https://a4h.marianzeis.de`, client 001, with writes, SQL, data preview, transport writes,
and Git writes disabled. All preserved the same first source block, SHA-256
`631ff0819d097f18752a7cab744dc95b61fc6ce76282857012d5ec4b4eff58f0`.
Only the appended link block differed. No SAP source, passwords, bearer tokens or service keys are
included in the committed evidence.

The package was produced with `npm run build` and `npm pack`, then launched by
`npx --yes --package=<absolute-packed-tgz> arc1`. This verifies npm packaging and stdio startup for
the feature branch, not publication of the feature to `arc-1@latest`. The pack inventory contained
982 files and none of `.env`, `cookies.txt`, or `.arc1.json`.

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

External registration was initially disabled. Enabling `adt` in General → Link Handlers made the
Chrome anchor work, following Chrome's normal Open Eclipse confirmation. The fresh preference page
showed `adt` checked and handler “This application”. The Open ADT Link dialog's cached tip could
still say disabled; the registration page and successful external click were the stronger evidence.

Eclipse Copilot was asked only to render a literal Markdown link to CL_ABAP_CLASSDESCR, with no tool
calls or edits. It produced a blue underlined link, but the tested clicks did not navigate. This is
a renderer/handler smoke test, not proof of the BTP MCP flow or a diagnosis of the plugin's internals.
Use the copy/paste Open ADT Link fallback until a direct click is independently qualified.

Installed SAP bundle inspection found additional project-link handling under `sap-adt-project-*`.
The RFC matching path compares client and connection attributes and can open a project-creation
wizard when no suitable project exists. These parameters also include user/password and routing
fields. This is not a verified, harmless substitute for a local project identifier. No credentials
were put in links, and no project was created. Exact matching across RFC, HTTP/cloud projects,
same-SID landscapes and clients remains to be tested before adopting a richer SAP link format.

### Proposed Eclipse implementation boundary

First qualify Copilot's click handler independently of ARC-1. A server-generated link cannot repair a
client that does not dispatch the scheme. An HTTPS landing page with an explicit ADT link is a possible
fallback, but it adds another service and can expose researched object names in URLs/logs; it was not
implemented or recommended as the default here.

Then add an explicit Eclipse presentation mode, with these acceptance conditions:

- Preserve the current source/JSON blocks and the bounded, post-authorization decoration path.
- Keep VS Code and Eclipse preferences per request; a shared BTP instance must serve both without
  emitting both link kinds to every client. Do not reinterpret the existing `vscode` map as Eclipse data.
- Use verified ADT object URIs, not arbitrary URI templates, command URLs, or project-creation data.
- For a SID-only initial mode, label the researched target and require a project choice when ambiguous;
  do not promise exact selection. For exact selection, qualify SAP's richer matching format or use a
  local companion that maps the service identity plus public target ID to an existing Eclipse project.
- Do not automatically choose the first project with a matching SID. Test duplicate SIDs, duplicate
  SID/client pairs, different clients, HTTP/cloud projects, absent projects and malformed mappings.
- Test native dialog, browser and Copilot clicks separately on each supported OS. Test multiple
  installed Eclipse distributions and which application owns the protocol registration.

No `eclipse` configuration mode is shipped by this PR. The proposed contract needs its own tests
and UI evidence before becoming supported setup instructions.

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
would require a documented minimum Claude Code version of 2.1.271.
It must not silently enable VS Code links in Claude Desktop, terminal use, or another editor. A
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
integration, E2E, docs, MTA validation, CodeQL and dependency review. Earlier live BTP pinned and
aggregate evidence remains in the [BTP dossier](2026-10-18-btp-native-ide-links.md); these local
experiments do not replace or broaden that evidence.

The focused local regression run passed **4 files / 98 tests**: `ide-links`, `ide-request`,
`ide-links-http`, and `dispatch-ide-links`. `npm run build`, `git diff --check`, and
`mkdocs build --strict` also passed. No runtime code, authorization policy, tool schema or test
assertions changed in this follow-up.

## Primary references

- [SAP: ADT links](https://help.sap.com/docs/ABAP_Cloud/abap-development-tools-user-guide/4ec63adf6e391014adc9fffe4e204223.html)
- [SAP: ADT 3.28 link-handler registration](https://help.sap.com/docs/abap-cloud/abap-development-tools-user-guide/version-3-28)
- [VS Code MCP configuration and harness compatibility](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)
- [VS Code MCP extension provider API](https://code.visualstudio.com/api/extension-guides/ai/mcp)
- [Claude plugin manifest reference](https://code.claude.com/docs/en/plugins-reference)
- [Claude MCP configuration](https://code.claude.com/docs/en/mcp)

Installed SAP extension manifests and bundled tools were inspected locally to establish exact
version-specific behavior. Vendor implementation excerpts and private configuration are not committed.
