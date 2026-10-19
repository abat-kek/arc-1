# Open ARC-1 results in your editor

Use **ARC-1 for research and SAP ADT for opening the object**. In VS Code, navigation uses SAP's native MCP resolver. The ABAP Bridge is not required for navigation.

**VS Code requires SAP's ABAP Development Tools extension and its MCP server.** Open its ABAP workspace
and log on to the matching system. Links open SAP source in that extension's ABAP editor.

> **Before you start:** These settings need a build containing [draft PR #1025](https://github.com/arc-mcp/arc-1/pull/1025).
> An older published `arc-1@latest` will not support them. ARC-1 must already connect to SAP.

## Choose your setup

| Your setup | Follow this section |
|---|---|
| VS Code with local `npx` or BTP ARC-1 | [SAP's native resolver](#compose-arc-1-with-saps-native-resolver) |
| Eclipse with local or BTP ARC-1 | [Eclipse](#eclipse-configuration-and-project-selection) — SID links |

## Compose ARC-1 with SAP's native resolver

**Currently experimental.** The same setup works whether ARC-1 runs
locally through `npx` or remotely on BTP. It supports one system and multiple targets.

Copilot reads through ARC-1, asks SAP's local MCP server for the source URI, and returns a link
that opens in SAP ADT. No ARC-1-specific IDE headers or server-side link configuration are needed.

1. Keep your existing ARC-1 connection. Omit `Arc1-Ide-*` headers; for local ARC-1 leave `ARC1_IDE_LINKS=off`.
2. Enable SAP's MCP server in ADT settings. Allow the intended destination, leave object-change
   permissions empty for navigation-only use, and log on to that destination.
3. In Copilot's tool picker, enable ARC-1 and SAP's `abap_object_get_file_uri` /
   `abap_object_list_file_uris`. VS Code discovers SAP's server; no localhost URL or token needs copying.
4. Confirm the [matching local destination](#which-destination-name-do-i-use) once in chat,
   or save it in personal, always-on Copilot instructions:

    ```text
    ARC-1 connection "arc-1-dev", target "DEV/001", uses the same backend and SAP client
    as my local SAP ADT destination "My-Dev". Use it for VS Code navigation.
    ```

    For local or traditional single-system ARC-1, omit the target clause.

5. [Try a link](#try-it). You do not need to specify the link format.

Don't know the local name? Enable `abap_destination_list` and ask Copilot to list destination names,
then confirm the matching connection. This saves typing; it does not automatically verify the backend.

**Can I use just the SID?** SAP's resolver accepts it, but chooses the first logged-on matching
project when several share a SID. It does not match the backend or SAP client. Use a confirmed
exact destination for now.
[Destination discovery and the proposed local picker](https://github.com/arc-mcp/arc-1/blob/main/docs/research/2026-10-19-destination-selection.md).

## Which destination name do I use?

For VS Code, use **your local ADT destination ID**: the connection you added to the ABAP workspace.
Find it with **ABAP: Open Destination Settings (JSON)**. Check that its backend and SAP client match ARC-1.

| Example | Meaning |
|---|---|
| `DEV` | SAP system ID (SID) |
| `DEV/001` | ARC-1 target: system or route alias + SAP client |
| `My-Dev` | Your local VS Code ADT destination ID; confirm this for native navigation |

**Your colleague can use a different destination ID.** Keep the mapping in your personal Copilot
instructions. No one needs to rename their connection or use the BTP Destination name.
A SID alone does not distinguish two backends or SAP clients with the same SID.

A local picker that remembers this choice is planned, but **not implemented yet**.

## Try it

Ask Copilot:

> Use ARC-1 to read CL_ABAP_TYPEDESCR and give me a link to open its source in VS Code. Do not change it.

For Eclipse, replace “VS Code” with “Eclipse”. Click the link and verify the object, backend and client.
The link opens **current source**, not a historical version or an exact method/line.

| Problem | What to do |
|---|---|
| No native link | Check that SAP's resolver tools are enabled, its destination is allowed and logged on, and you have confirmed the mapping. |
| Destination disconnected / file not found | Log on in ADT, close the failed preview and click again. BTP login does not log on your local editor. |
| Native resolver says no project | Open an object with **ABAP: Open Object...** in the same window first. Recover the confirmed destination before retrying. |
| Old tools/instructions after an update | Reset cached MCP tools, run **Developer: Reload Window**, then start a fresh chat. |

For Claude/plugin clients, leave links off unless you explicitly want an editor handoff.
See [plugin preferences](agent-plugin.md#optional-editor-links); click behavior in Claude UIs is not yet verified.

Tested with desktop VS Code 1.142 / SAP ADT 1.2 and Eclipse ADT 3.60.2 on macOS. Native resolver
opening passed for pinned and aggregate BTP reads; local ADT session stability remains a limitation.
Editing/activation, Insiders, other harnesses and unusual alias characters need separate verification.

[Configuration reference](configuration-reference.md#ide-navigation) ·
[Live test results and limitations](https://github.com/arc-mcp/arc-1/blob/main/docs/research/2026-10-19-btp-native-end-to-end.md) ·
[SAP's destination setup](https://developers.sap.com/tutorials/abap-environment-adt-vscode)

## Eclipse configuration and project selection

Open an Eclipse ADT project connected to the same backend and SAP client as ARC-1.

### ARC-1 on BTP / HTTP

**Administrator:** enable `ARC1_IDE_LINKS=eclipse`. Multi-target destinations supply the SID.
A traditional single-system `/mcp` deployment also needs `ARC1_IDE_SYSTEM_ID=DEV` on the server.

**Developer:** add this to the existing Eclipse Copilot HTTP server entry:

```json
{
  "requestInit": {
    "headers": { "Arc1-Ide-Client": "eclipse" }
  }
}
```

Keep your existing URL and OAuth setup. No local destination-name mapping is needed.

### ARC-1 runs locally

Add these values to `env` in the existing Eclipse Copilot stdio server entry:

```json
{
  "env": {
    "ARC1_IDE_LINKS": "eclipse",
    "ARC1_IDE_SYSTEM_ID": "DEV"
  }
}
```

Replace `DEV` with the real SAP SID, then restart the MCP server.

An Eclipse link uses `adt://DEV/...`. If several projects match, Eclipse may show a chooser:
select the project with the correct backend **and client**. A matching SID alone is not enough.
If clicking does nothing, paste the link into **Open ADT Link**. For browser handoff, enable `adt`
under **Preferences → General → Link Handlers**. Native opening was verified; direct dispatch from
Eclipse Copilot remains unconfirmed.

## Upgrading an earlier draft setup

If you tested an earlier draft: remove `ARC1_IDE_DESTINATION` and
`Arc1-Ide-Destinations-V1`. Replace `ARC1_IDE_LINKS=vscode` with `off`; replace `on` with
`eclipse` only where Eclipse links are wanted. VS Code now uses SAP's resolver exclusively.
