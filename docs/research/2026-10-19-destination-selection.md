# Local destination selection: can a SID replace a personal alias?

Research for PR #1025, 19 October 2026. This is a contract/installed-code inspection, not a new
live acceptance run. The shorter [setup guide](../../docs_page/ide-integration.md) contains the
configuration steps; the [previous live acceptance](2026-10-19-btp-native-end-to-end.md) used an
exact confirmed destination.

## Findings

| Path | What identifies the local destination? | Can everyone use just the SID? |
|---|---|---|
| Direct ARC-1 VS Code links | Exact local alias in `abap:/flat/<alias>/…` | No SID resolver is invoked. A SID only works here if it is also the actual alias. |
| SAP native MCP resolver | Exact destination, with a SID fallback | Supported, but not reliable when SID/client/backend matches are ambiguous. |
| Eclipse `adt://` | SID, resolved by Eclipse projects | Project selection may be necessary; the link does not prove backend/client identity. |

Personal alias names need not match across developers. With direct HTTP links, each client supplies
its own map; local stdio uses per-server environment settings. With native composition, a confirmed
mapping is kept in the user's chat/instructions. The BTP server does not inspect laptop settings.

## SAP 1.2 contract and implementation

The saved live `tools/list` response from native MCP 3.62.0 declares that `destination` accepts an
exact destination ID or a three-character SID, and that multiple SID matches use the first match.
The resolver's `objectType` does not help select a destination: backend/client selection happens
before object resolution.

Read-only bytecode inspection of the installed SAP distribution confirmed the selection order:

- Extension `sapse.adt-vscode-1.2.0-darwin-arm64`, bundled
  `com.sap.adt.tools.core_3.62.0.jar`, class `com.sap.adt.tools.core.mcp.AdtMcpDestination`.
- `computeResolveProject()` first calls `findProject(value)` for the exact local destination/project.
- If that fails, `findFirstProjectBySystemId(value)` compares project SIDs case-insensitively.
- It returns the first matching **logged-on** project. If none is logged on, it retains the first
  matching project; the subsequent logon check then rejects it.
- The SID fallback does not compare the requested SAP client or backend URL and does not reject
  multiple matching logged-on projects. Its result can therefore change as the logged-on set changes.
- The destination allowlist is checked separately against the resolved destination ID. It remains
  an access control, not proof that the selected project is the ARC-1 backend the user intended.

The installed `abap_destination_list` tool advertises a list of logged-on destinations, and the
previous live response returned alias IDs. Inspection of `AdtDestinationsMcpTool.execute()` shows
that it returns registered destination keys as text, with no backend/client metadata or independent
project-logon check in that method. Listing an alias is not a successful project-open test.
The exposed 33-tool surface contains no destination-detail
lookup giving the model a verified alias → backend/client mapping. A single listed ID is therefore
not evidence of the right backend. Copilot can list names to help the user choose; it cannot replace
that confirmation with an inference from the list alone.

Sources: the locally captured SAP tool contract and installed binaries are the primary evidence.
SAP's [destination setup tutorial](https://developers.sap.com/tutorials/abap-environment-adt-vscode)
confirms that users choose destination IDs. VS Code's [MCP setup guide](https://code.visualstudio.com/docs/agent-customization/mcp-servers)
distinguishes user-profile settings from shared workspace configuration. The SAP Help MCP tools page
was reachable but did not expose readable content to the text browser; it is not treated as evidence
for unobserved behavior.

## Simplification to pursue

A local picker would remove the need to type or standardize aliases:

1. Show the available local ADT destinations, with verified backend/client details if a supported
   local API exposes them; otherwise ask the user to check the destination settings.
2. Let the developer select the one matching the ARC-1 connection or public target.
3. Save that association locally for this user/profile and this specific connection/target.
4. Ask again when the alias disappears or the connection/backend changes; do not silently substitute
   the first destination or a SID match.

This picker is a proposal, not implemented in PR #1025. A supported SAP destination metadata API
would make automatic candidate matching possible; SID alone would only narrow the candidates.
Do not ship a guess based on an alias spelling, an unsigned target label, or one logged-on project.

## Documentation validation

The setup page now separates local VS Code, remote VS Code, Eclipse and optional native composition;
uses one consistent example; and identifies administrator versus developer settings. It uses plain
Markdown so the same instructions remain readable on GitHub and the MkDocs site. Configuration
examples are checked against the existing offline helper/request resolver, and the strict site build
and rendered local preview are checked without changing SAP, BTP or IDE connection settings.
