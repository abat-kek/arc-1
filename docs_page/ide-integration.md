# Open researched objects in SAP ADT for VS Code

ARC-1 can add clickable **Open current source** links to successful research results. SAP ADT for
VS Code **1.2.0** handles these links directly; the ARC-1 ABAP Bridge is not required for this
navigation path. This opt-in compatibility feature is qualified against 1.2.0; its flat URI
representation is not a documented stable SAP API. Links are off by default. Local stdio and HTTP/BTP connections are supported; HTTP
requires explicit preferences on every request, scoped to the VS Code MCP connection.

## Configure the local destination

1. Install SAP's `sapse.adt-vscode` extension, version 1.2.0 or later, open its ABAP workspace, and
   connect to your SAP system. The 1.2.0 handler needs the extension already activated; clicking a
   link in an unrelated workspace may wait without opening an editor.
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
Unicode aliases are accepted but have not been live-qualified. Unsupported aliases
fail configuration validation.
For stdio, put these variables only in VS Code’s server entry, not a shared shell environment or
configuration used by other clients. HTTP uses the separate request contract below.

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
| `SAPRead` source | `CLAS`, `INTF`, `PROG`, `DDLS`; CLAS main/definitions/implementations/macros/testclasses |
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

ARC-1 can still check a candidate source before saving with `SAPDiagnose action=syntax` and its
`source` input. The bridge adds the comparison against existing findings; native link generation
adds no validation. SAP's inspected `abap_object_check` tool expects saved files, so it is not an
equivalent replacement for checking an unsaved candidate buffer.

## Compose ARC-1 with SAP's native resolver

The installed ADT 1.2.0 distribution also supplies `abap_object_get_file_uri` and
`abap_object_list_file_uris`. When your client's SAP MCP tool list exposes them, it can pass the
ADT object URI returned by ARC-1 search and the exact local destination to SAP's resolver. SAP
is inspected to return the canonical `abap:/repotree-v1/…` file URI; listing AFF files can identify a specific
include. Follow the exposed schema rather than guessing tool arguments or localized tree paths.

This client-side composition is also a candidate for users of a shared ARC-1 HTTP service. It does
not require ARC-1 to call SAP's local MCP server or handle its bearer token. Each server keeps its
own identity and access restrictions. The resolver was inspected in the bundled language-server jars, but was
unavailable in the Copilot session used for this run; its end-to-end workflow remains unqualified.
Tool names and availability depend on SAP's installed version and configuration.

The implementation and read-only live verification record are in the
[ADT 1.2 research dossier](https://github.com/arc-mcp/arc-1/blob/main/docs/research/2026-10-17-adt12-native-ide-links.md).

## BTP and other HTTP deployments

The administrator enables `ARC1_IDE_LINKS: "vscode"` in the deployment's `.mtaext` properties
(or the HTTP server environment). Leave `ARC1_IDE_DESTINATION` unset: startup rejects a global
HTTP alias, even when links are disabled. Existing authentication and SAP permissions still apply.

Add these **non-secret** headers only to the remote server entry in the desktop VS Code workspace
or user-profile `mcp.json`. Keep the existing URL and OAuth configuration. For example:

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
`@single` is never a fallback for pinned or aggregate multi-target calls.

Percent-encode each local alias as one UTF-8 component (JavaScript `encodeURIComponent(alias)`).
For example, `DÉV (001)` becomes `D%C3%89V%20(001)`. Decode occurs exactly once. The encoded header
must be ASCII, at most 4096 bytes, and contain at most 32 comma-separated entries. Identical duplicate
keys collapse; conflicting duplicates suppress that key. Invalid entries, malformed encodings,
oversized headers, absent preferences and unmatched targets yield the original result without a link.

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

ARC-1 applies the selected alias only to successful authorized results for the resolved SAP target.
Preferences never change SAP routing, credentials, target grants, scopes or safety limits, and are not forwarded to SAP or
stored in source caches. The result labels the server-selected target and local destination.
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
