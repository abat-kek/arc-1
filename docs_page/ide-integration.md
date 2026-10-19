# Open researched objects in SAP ADT for VS Code

ARC-1 can add clickable **Open current source** links to successful research results. SAP ADT for
VS Code **1.2.0** handles these links directly; the ARC-1 ABAP Bridge is not required for this
navigation path. This opt-in compatibility feature is qualified against 1.2.0; its flat URI
representation is not a documented stable SAP API. Links are off by default. Local stdio and HTTP/BTP connections are supported; HTTP
requires explicit preferences on every request, scoped to the VS Code MCP connection.

This feature is currently in [draft PR #1025](https://github.com/arc-mcp/arc-1/pull/1025).
The local `npx` checks used a package built from that branch, not the published `arc-1@latest`.
Use a build containing the PR before applying these settings.

## Choose the smallest setup

| Where ARC-1 runs | Additional setup for VS Code links |
|---|---|
| Local `npx`, one SAP system | Two environment variables in that client's MCP entry: `ARC1_IDE_LINKS=vscode`, `ARC1_IDE_DESTINATION=DEV-001` |
| Local, several independent stdio servers | The same two variables per server, with its own matching local alias |
| HTTP/BTP, traditional single-system `/mcp` | Admin enables links; client sends `Arc1-Ide-Client: vscode` and `Arc1-Ide-Destinations-V1: @single=DEV-001` |
| HTTP/BTP, pinned `/<target>/<client>/mcp` | Same `vscode` presentation marker; one mapping such as `A4H/001=DEV-001` |
| HTTP/BTP, aggregate `/multi/mcp` | Same `vscode` presentation marker; mappings for the selected public targets |
| Claude plugin | Current plugin has no IDE preference fields; use a dedicated per-server MCP entry for experiments |
| VS Code Agent Plugin | Use a dedicated MCP entry instead of the plugin's MCP server when preferences cannot be scoped to that server |

A single pinned target still uses its exact public target ID, even if it is the only system you use.
The `@single` key describes the traditional endpoint implementation, not the number of local IDE projects.
It requires `ARC1_MULTI_TARGET_ENDPOINTS` to be off. The bare `/mcp` on a multi-target deployment
does not produce IDE links with `@single`; use a pinned route for one selected target there.
You do not need the bridge or SAP's local MCP server for ARC-1's direct links.

## Configure the local destination

1. Install SAP's `sapse.adt-vscode` extension, open its ABAP workspace, and
   connect to your SAP system. The 1.2.0 handler needs the extension already activated; clicking a
   link in an unrelated workspace may wait without opening an editor. Version 1.2.0 was qualified;
   later versions require verification because this URI representation is not a stable API.
2. Copy its exact destination alias from the ADT workspace, for example `DEV-001`.
3. Add these variables to your existing local ARC-1 MCP server configuration and restart that server:

```json
"env": {
  "ARC1_IDE_LINKS": "vscode",
  "ARC1_IDE_DESTINATION": "DEV-001"
}
```

Keep your existing SAP connection variables alongside these two entries. Server startup flag equivalents are
`--ide-links vscode --ide-destination DEV-001`. The destination must identify the **same SAP system
and client** as ARC-1. It is a local IDE alias, not necessarily the SAP SID or BTP Destination name.
ARC-1 cannot verify this local mapping. It never infers it from the MCP client's name or roots.

ARC-1 accepts aliases containing letters, digits, spaces, `_`, `.`, `-`, and parentheses, starting
with a letter, digit or `_`, limited to 128 characters and without surrounding whitespace. Only a
plain ASCII alias was live-tested; spaces and parentheses are covered by URI encoding tests.
Unicode aliases are accepted but have not been live-qualified. Unsupported stdio aliases
fail configuration validation and stop server startup.
For stdio, put these variables only in VS Code’s server entry, not a shared shell environment or
configuration used by other clients. HTTP uses the separate request contract below.

Use a launch command that selects a build containing this feature. Before release, build and pack
the PR checkout with `npm run build` and `npm pack`, then use the resulting local package:

```json
{
  "servers": {
    "arc-1-local": {
      "type": "stdio",
      "command": "npx",
      "args": ["--yes", "--package=/ABSOLUTE/PATH/arc-1-1.6.0.tgz", "arc1"],
      "envFile": "/ABSOLUTE/PRIVATE/PATH/arc1-sap.env",
      "env": {
        "ARC1_IDE_LINKS": "vscode",
        "ARC1_IDE_DESTINATION": "DEV-001"
      }
    }
  }
}
```

Replace the package path with your actual packed PR artifact; its filename/version alone does not
prove its contents. This `envFile` plus per-server `env` setup was tested in desktop VS Code
1.142.0: Copilot called the packed ARC-1 process and rendered the returned link. The test used an
absolute path to the installed `npx`; use one if the editor cannot resolve your shell's command.
The private file
holds your existing `SAP_URL`, `SAP_CLIENT`, and authentication settings; keep write gates disabled
unless separately needed. No port, HTTP headers, or BTP destination map is needed for this stdio case.
For a local source checkout, use `command: "node"` and `args: ["/ABSOLUTE/PATH/arc-1/bin/arc1.js"]`
after building it. MCP clients use different configuration schemas; `servers` and `envFile` above are
VS Code fields, not a universal plugin format.
Treat that entry and its private environment file as one connection configuration. When changing
`SAP_URL` or `SAP_CLIENT`, recheck the alias too; a shared working-directory `.env` can otherwise
supply a stale alias for a connection overridden by the client.

### Claude plugin and other local clients

The Claude plugin launches a local stdio ARC-1 process. Its current manifest exposes SAP connection
and safety settings but no IDE link controls. The portable plugin also launches `npx arc-1@latest`
from `${PLUGIN_DATA}`; see [agent plugin setup](agent-plugin.md). Neither entry currently pins the
unreleased feature branch.

For experiments, configure a dedicated ARC-1 MCP server in the intended client and put the two IDE
variables in that server's own `env`, next to its SAP connection settings. Use a build containing
this PR and disable the duplicate plugin MCP server. Keep the plugin's skills if the client lets
you configure those separately. No Claude click surface has yet been qualified.

Do not export one destination alias for the whole Claude process: it can reach other ARC-1 servers
in that session, including ones connected to another backend or ones that should have no links.
Keep a shared plugin environment or `${PLUGIN_DATA}/.env` free of IDE preferences when other clients
use it. This does not automatically detect whether Claude is running inside VS Code.

Claude Code 2.1.302 also called two packed ARC-1 servers against live SAP in one session: one had
links enabled and one had them off. Both returned identical source; only the explicitly enabled
server added a link. Separate synthetic probes verified preference inheritance directly and through
a minimal temporary plugin. The real plugin's saved configuration/substitution path and clickable
links in Claude Desktop, terminal chat, or the Claude VS Code webview remain unqualified.
A future plugin settings picker could remove manual environment
editing, but would still need an explicit editor preference and exact local alias attached to that
one server. The research record describes an isolated manifest-validation prototype; it is not
included in this PR.

## Use the links in Copilot

Ask Copilot to research an object using ARC-1 and include the returned **Open current source** link
in its answer. Click the link and accept VS Code's normal prompt to open it with SAP ADT. A current
SAP logon is required. If the destination is disconnected, reconnect it and click the link again.

The tested path is Copilot Chat → `vscode://sapse.adt-vscode/open?abapUri=…` → SAP's source editor.
Custom-protocol rendering depends on the client; an answer that displays a URI as plain text is
not proof that the client can open it. VS Code Insiders and browser-only clients are not qualified.

Optional Copilot workspace guidance:

```text
Use ARC-1 for SAP research. When it returns an Open current source link, preserve that exact link
in the answer. Do not invent destination aliases or links for unsupported objects. These links
open current source, not a historical snapshot or an exact line. Keep the original research
evidence with the link. Before editing, use the existing SAP editor in the Copilot working set.
```

## Coverage and limits

| Result | Links supplied |
|---|---|
| `SAPRead` source | `CLAS`, `INTF`, `PROG`, `DDLS`; CLAS main/definitions/implementations; macros/testclasses emitted but opening unqualified |
| `SAPSearch` object search | Supported identities in returned JSON object rows; transliteration-prefixed responses are left unchanged |
| `SAPSearch` `tadir_lookup` | ADT-confirmed matches only; database-only rows are excluded |
| `SAPNavigate` `references` | Supported identities in the existing result, including database-derived interface implementers |

At most eight unique links are appended in a **separate text content block**. Original source and
JSON blocks remain byte-identical. Oversized or unfamiliar result envelopes, unsupported types,
failures, SQL results, plugin results, writes, and historical comparisons receive no links. There
are no extra SAP requests, tool definitions, scopes, or schema parameters.

Main source, definitions, and implementations were opened live. Macros/testclasses use inspected
AFF mappings and have encoding tests; their live attempts did not establish successful opening.

Class-include grep results receive no link because an unavailable include can be reported as a
successful explanatory result. Direct CLI source/search exports always omit IDE decoration, even
when these variables are set in `.env`. The ADT-only provenance rule applies specifically to
`tadir_lookup`; reference links retain the existing where-used provider's identity evidence and
do not perform a fresh existence check.

The links open current source through SAP's `abap:/flat/…` representation. They do not select a
method, line, transport revision, or active/inactive version, even if the research result is more
specific. A source read requesting an active version can therefore differ from the editor's current
draft. Recheck the editor before applying an edit.

Opening is the qualified operation. This change does not implement Copilot Keep/Undo, pre-save
validation, editable active/inactive diffs, transport assignment, or activation. Flat and repository
tree URIs can identify the same SAP object differently; a link may open a second editor rather than
reuse an existing dirty tree editor. Continue using the existing editor/bridge workflow for edits
until that identity and save behavior are separately qualified. ARC-1's read-only configuration does
not constrain edits made independently through SAP's extension.

The [ABAP Bridge](https://github.com/arc-mcp/arc1-abap-bridge) still has a role for `abapValidate`,
`abapChanges`, broader tree-based object resolution, and its editor integration. Its older setup
instructions referring to `ARC1_IDE_LINKS=auto` came from unmerged
[PR #676](https://github.com/arc-mcp/arc-1/pull/676); this implementation supports `off` and `vscode`.
Remove any old `auto` setting before upgrading: it now fails validation and stops server startup.

ARC-1 can still check a candidate source before saving with `SAPDiagnose action=syntax` and its
`source` input. The bridge adds the comparison against existing findings; native link generation
adds no validation. SAP's inspected `abap_object_check` tool expects saved files, so it is not an
equivalent replacement for checking an unsaved candidate buffer.

## Compose ARC-1 with SAP's native resolver

The installed ADT 1.2.0 distribution supplies `abap_object_get_file_uri` and
`abap_object_list_file_uris`. Both were called successfully against live SAP through SAP's local MCP
server, which reported version 3.62.0 and 33 tools. This offers another approach: ARC-1 returns normal
research, then the client asks SAP's resolver for the local file URI. ARC-1's IDE variables and headers
can remain off. The client still needs a confirmed mapping to the same SAP system and client,
provided explicitly by the user for that connection; it must not choose the first discovered
destination or infer the mapping from SID alone.

Enable SAP's MCP server in ADT settings, allow the intended destination in its access restrictions,
and log on to that destination. An empty destination restriction denied calls in the tested setup.
Keep its object-change permissions empty for navigation-only use. Confirm the running tool list:
an older ADT 1.1.2 process occupied the shared port 2237 on the test machine and exposed 20 older
tools despite 1.2 being installed. A temporary separate workspace port exposed the new resolver.
Restart stale editor windows or assign a distinct local port when testing multiple versions.

For example, pass an ARC-1 ADT URI to `abap_object_list_file_uris`:

```json
{
  "destination": "DEV-001",
  "objectIdentifier": {"uri": "/sap/bc/adt/oo/classes/cl_abap_typedescr"}
}
```

Use its `mainFile` and matching entry in `files.uris`. Alternatively, `abap_object_get_file_uri`
accepted the explicit source URI `/sap/bc/adt/oo/classes/cl_abap_typedescr/source/main` or AFF filename
`cl_abap_typedescr.clas.abap`. Passing only the class object URI to that tool returned **`.clas.json`
metadata**, not source. Definitions and a namespaced CDS object also resolved successfully.
Follow the exposed schema rather than guessing localized tree paths or choosing the first file.

These calls return canonical `abap:/repotree-v1/…` URIs. The test invoked the native `/open` handler
with the encoded returned URI in `abapUri`, but opening failed with a destination-disconnected
message, including after successful browser logon. The cause was not established; URI shape and
window routing have not been ruled out. Resolver success is verified; that opening path and
automated Copilot composition remain unqualified. The earlier direct flat-link qualification is
a separate result. A future Markdown link builder must also escape parentheses after
`encodeURIComponent`, as ARC-1's current builder does.

The client performs this composition locally; BTP never calls the laptop MCP endpoint or receives
its bearer token. Each server retains its own authentication and safety controls. This can reduce
manual ARC-1 configuration for users already using SAP's MCP server, but adds a local server and
tool call for those who are not. Native resolution is therefore an optional approach, not required setup.

The implementation and read-only live verification record are in the
[ADT 1.2 research dossier](https://github.com/arc-mcp/arc-1/blob/main/docs/research/2026-10-17-adt12-native-ide-links.md).

## BTP and other HTTP deployments

The administrator enables `ARC1_IDE_LINKS: "vscode"` in the deployment's `.mtaext` properties
(or the HTTP server environment). Leave `ARC1_IDE_DESTINATION` unset: startup rejects a global
HTTP alias, even when links are disabled. Existing authentication and SAP permissions still apply.

Add these **non-secret** headers only to the remote server entry in desktop VS Code's user-profile
`mcp.json` or an unshared workspace configuration. Avoid committing personal alias mappings for
teammates; recheck them if Settings Sync copies the configuration to another machine.
Keep the existing URL and OAuth configuration. For example:

```json
{
  "servers": {
    "arc-1-btp": {
      "type": "http",
      "url": "https://YOUR-ARC1-HOST/multi/mcp",
      "headers": {
        "Arc1-Ide-Client": "vscode",
        "Arc1-Ide-Destinations-V1": "A4H/001=DEV-001,A4H/100=QA-100,A4H-2025/001=NEW-001"
      }
    }
  }
}
```

Use the **exact public target IDs** returned by `SAPTargets`, including client and any route alias.
The same mapping works on pinned `/<SYSTEM-OR-ALIAS>/<CLIENT>/mcp` endpoints; only the authorized,
selected target's entry is used. No SID-only matching, guessing, or fallback is performed.
For a traditional single-target `/mcp` endpoint, use `"Arc1-Ide-Destinations-V1": "@single=DEV-001"`.
This requires `ARC1_MULTI_TARGET_ENDPOINTS` off. `@single` does not decorate the bare `/mcp` on
a multi-target deployment and is never a fallback for pinned or aggregate calls.

Percent-encode each local alias as one UTF-8 component (JavaScript `encodeURIComponent(alias)`).
For example, `DÉV (001)` becomes `D%C3%89V%20(001)`. Decode occurs exactly once. The encoded header
must be ASCII, at most 4096 bytes, and contain at most 32 comma-separated entries. Identical duplicate
keys collapse; conflicting duplicates suppress that key. One malformed entry or encoding invalidates
the whole map. Oversized headers, absent preferences and unmatched targets also yield the original
result without a link.

### Keep links out of other clients

Both the administrator switch and **`Arc1-Ide-Client: vscode` plus a matching mapping** are required.
Claude Desktop, Codex, automation, and other clients that omit these preferences receive their
existing output. Even a VS Code user-agent without these headers receives no link. Preferences are
read on every tool call; they are not remembered from another user, workspace, or `initialize` request.

This is an explicit presentation preference, not verified client identity. Any client deliberately
copying both headers can request the same links; MCP does not attest which desktop app is displaying
a result. Keep this entry in VS Code's own configuration rather than a portable configuration shared
with other agents. VS Code supports custom HTTP headers; its configuration formats and forwarding
behavior are documented in the [MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration).

### Can BTP detect the client?

It receives useful hints. Live captures on 2026-10-19 found:

| Client | Initialization name | Later HTTP user agent |
|---|---|---|
| VS Code 1.142.0 | `Visual Studio Code` | `Visual Studio Code/1.142.0` |
| Eclipse Copilot 0.21.0 | `Eclipse/copilot-eclipse` | `GithubCopilot/1.527.0` |
| Claude Code 2.1.302 | `claude-code` | `claude-code/2.1.302 (sdk-cli)` |

Actual VS Code and Eclipse reads through the existing BTP deployment succeeded, and its logs
confirmed the user agents arrived. Eclipse's later user agent identifies Copilot without identifying
the editor. With ARC-1's current SDK/HTTP transport, initialization information is not retained on
later tool requests; a regression test verifies this. Newer MCP revisions provide per-request
client metadata, but this branch still uses the legacy protocol era described in ADR-0006.

These hints could help a future setup UI suggest an editor. They cannot establish whether its ADT
extension is installed, whether the user wants links, or which local alias matches the backend.
Therefore this PR uses explicit preferences. A client copying the VS Code preference gets VS Code
links even when its name says Eclipse; a client calling itself VS Code without the preference gets
none. In stdio the per-server environment has the same role, independently of the client's name.
Do not share or remember a preference by SAP user, IP address, or the last initialization request:
the same person can use multiple clients and workspaces.

ARC-1 applies the selected alias only to successful authorized results for the resolved SAP target.
Preferences never change SAP routing, credentials, target grants, scopes or safety limits, and are not forwarded to SAP or
stored in source caches. Pinned/aggregate results label the server-selected target and local
destination; traditional single-target and stdio results label only the local destination.
A valid alias is still a user-maintained mapping: ARC-1 cannot prove that the local ADT destination
connects to the intended backend. BTP's Cloud Connector route does not provide laptop connectivity;
ADT needs its own SAP logon and working network route.

Desktop VS Code is the qualified client scope. This change does not expand browser CORS headers;
VS Code Insiders, web clients, and browser-hosted agents require separate qualification.

If Copilot rejects a valid aggregate call with `must NOT have additional properties` after changing
an MCP connection, run **Developer: Reload Window** and start a fresh chat. Keep pinned and aggregate
endpoints in separate, stable MCP entries. In the tested Copilot 0.70.0 / VS Code 1.142 combination,
Copilot cached the input validator by tool name; **MCP: Reset Cached Tools** and **Restart Server**
did not clear that separate cache. This matches [VS Code issue #321662](https://github.com/microsoft/vscode/issues/321662).
The aggregate call still requires `target`; do not remove it or relax server validation to work
around a stale client schema.

See the [BTP implementation and verification record](https://github.com/arc-mcp/arc-1/blob/main/docs/research/2026-10-18-btp-native-ide-links.md)
for tested behavior and remaining deployment limitations.

## Eclipse: verified navigation and remaining integration work

Eclipse ADT has its own link format:

```text
adt://A4H/sap/bc/adt/oo/classes/cl_abap_typedescr
```

Use **Open ADT Link** in Eclipse (Cmd+Alt+O on the tested macOS installation), paste the URI, and
select the correct project if asked. For external browser clicks, enable `adt` under **Preferences →
General → Link Handlers**. SAP documents this in its
[ADT link guide](https://help.sap.com/docs/ABAP_Cloud/abap-development-tools-user-guide/4ec63adf6e391014adc9fffe4e204223.html).
Both the dialog path and Chrome → Eclipse path opened live source in ADT 3.60.2 on macOS.
Check the opened project's backend and client even if no chooser appears: one locally matching SID
does not establish that it is the system ARC-1 researched, and ARC-1 cannot force Eclipse to ask.

Direct clicking from Eclipse Copilot is now verified by the user's screenshots: the link opened
the native project chooser, then CL_ABAP_CLASSDESCR source. The chooser is expected when more than
one local project matches `A4H`; it is not a link error or authentication prompt. This was a diagnostic
probe link, not an implemented ARC-1 Eclipse output mode.

Backend selection remains the issue before adding automatic Eclipse links to ARC-1. Eclipse's
generated Share Link contained SID `A4H`, while two local projects represented different A4H
installations with client 001. A SID is insufficient to select the backend researched through a
BTP target. The tested `A4H.2023` authority and literal project-name authority `A4H_2023` were both
rejected as invalid system IDs. Inspection found a native project-name match with underscores
replaced by dots. `adt://H01.EN/...` selected `H01_EN` without a chooser, but its unavailable backend
prevented source opening. Java URI validation rejects underscores and the tested numeric final
label in `A4H.2023`. A validated, unique local project mapping may avoid a companion extension;
arbitrary project names and ambiguous encodings are not qualified.

Earlier automated clicks failed even for the ordinary HTTP control, which the user then opened
successfully. Those failures do not establish a Copilot defect. Direct ADT links work on the tested
installation and do not require an HTTP helper. A browser page and HTTP redirect also opened source
in separate tests, but their complete sequence starting in Copilot remains unqualified.

The current PR accepts only `off` and `vscode`; `Arc1-Ide-Client: eclipse` deliberately receives no
VS Code links. Eclipse support needs a separate, explicit client preference and a policy for
ambiguous projects. A SID-based link with manual selection is the simplest candidate; it must label
the researched target and cannot promise an automatic backend match. Eclipse's per-server HTTP
`requestInit.headers` was verified to transmit presentation preferences, so configuration transport is available. A local
companion remains an option for mappings that native project selection cannot safely represent.
Do not put credentials or
project-creation connection parameters into shared links. BTP deployment alone cannot provide the
local Eclipse project, SAP logon, or laptop network route.

The [editor setup research record](https://github.com/arc-mcp/arc-1/blob/main/docs/research/2026-10-19-editor-links-and-setup.md)
contains the experiment matrix and proposed follow-up order.
