# Native MCP identifiers: name/type interoperability

Follow-up to the [composition tests](2026-10-19-native-mcp-composition.md), checking whether SAP's
`oneOf` identifier schema and `abap_object_get_file_uri` are sufficient for ARC-1 results.

## Conclusion

Yes for the tested object-to-source resolution: ARC-1's existing name/type pair can go directly to
SAP's resolver. A guessed AFF filename, repository tree path or bridge resolver is unnecessary.
This does not remove destination mapping or qualify clickable canonical links, buffer reuse or edits.
Supplied object types were **not strictly enforced** in the negative tests below.

[SAP's public ADT MCP update](https://community.sap.com/t5/technology-blog-posts-by-sap/abap-development-tools-mcp-server-major-update-available/ba-p/14496064)
describes identifiers as the integration point between servers and documents URI, name/type and AFF
alternatives. The running 1.2 distribution exposes the same contract. `oneOf` is a JSON Schema rule,
not a request field: provide exactly one identifier form per object. `objectType` is optional in
the name branch, but supply it when known. Do not combine `uri` and `objectName` in one identifier.

## Fresh live verification

On 19 October 2026, an isolated VS Code workspace started installed SAP ADT 1.2.0 on loopback port
2242. MCP reported **ADT MCP Server 3.62.0, 33 tools**. Its destination restriction was the previously
confirmed `A4H2023-2` (A4H backend, SAP client 001); object-change packages were empty and the edit
tool was disabled. Normal browser logon completed. No ARC-1/BTP deployment was changed.

Eighteen native tool calls produced twelve expected positive results, two expected errors, and four
unexpected successful resolutions with a mismatched object type. This is **not 18 passing acceptance
tests**. Separately, all 18 local schema assertions passed against the fresh exported tool schemas.

| Input / operation | Observed result |
|---|---|
| `get_file_uri`: `CL_ABAP_TYPEDESCR` / `CLAS` | Canonical `.clas.abap` source |
| `get_file_uri`: one batch containing INTF, PROG and DDLS name/type pairs | Correct source for `IF_SERIALIZABLE_OBJECT`, `SAPMSSY0`, `I_CURRENCY` |
| `get_file_uri`: `/DMO/I_FLIGHT` / `DDLS` | Canonical namespaced `.ddls.acds` source, namespace encoded by SAP |
| `list_file_uris`: each of those five objects by name/type | `mainFile` and source/metadata/include listing |
| `get_file_uri`: explicit class `/source/main` URI or `.clas.abap` AFF filename | Same source URI as class name/type |
| `get_file_uri`: class base ADT URI without `/source/main` | `.clas.json` metadata instead of source |
| `read_file`: class name/type, `version=ACTIVE`, `offset=1`, `limit=5` | First five source lines; total 607, truncated with continuation offset 6 |
| Missing class `ZARC1_NONEXISTENT_1025_TEST` | `UNRESOLVED_IDENTIFIERS`, no fabricated URI |
| One identifier containing both `uri` and `objectName` | Native server rejected it with a schema-validation error |

The list responses include `.json` and other files; do not choose the first entry. The program list
also contained duplicate text-property URIs; this did not prevent correct main-source selection.
No session disconnect occurred during these calls, but this does not establish the cause or resolution
of earlier failures. These were SDK calls, not a fresh Copilot execution or editor-opening test.

## Type mismatch finding

All four calls below succeeded instead of rejecting a conflicting type:

| Tool | Supplied identifier | Resolved object |
|---|---|---|
| `abap_object_get_file_uri` | `CL_ABAP_TYPEDESCR`, `INTF` | Class source `.clas.abap` |
| `abap_object_list_file_uris` | `CL_ABAP_TYPEDESCR`, `INTF` | Class main file and includes |
| `abap_object_get_file_uri` | `CL_ABAP_TYPEDESCR`, `ZZZZ` | Class source `.clas.abap` |
| `abap_object_get_file_uri` | `SAPMSSY0`, `CLAS` | Program source `.prog.abap` |

Minimal reproduction after logon, using the confirmed local destination:

```json
{
  "destination": "A4H2023-2",
  "objectIdentifiers": [
    {"objectName": "CL_ABAP_TYPEDESCR", "objectType": "INTF"}
  ]
}
```

The response's `objects.uris[0]` ended in
`Classes/CL_ABAP_TYPEDESCR/cl_abap_typedescr.clas.abap`. This proves mismatched-type acceptance for
these samples, not whether SAP intentionally uses type as a hint or how same-name collisions are
resolved. Do not treat successful resolution as proof of the requested type. Check the returned
object identity before presenting it as the requested object; stop on a mismatch. Prefer an exact
existing source URI for disambiguation. Unknown or ambiguous types need explicit qualification.

Useful upstream feedback: clarify whether `objectType` is a filter or a hint, reject a supplied
mismatch or return an explicit warning, and return resolved name/type alongside each URI. Test
same-name objects of different types before relying on name-only lookup. No upstream message or
issue was sent as part of this investigation.

## Simplest composition

For a whole object whose name/type ARC-1 already supplies, call `abap_object_get_file_uri` directly:

```json
{
  "destination": "DEV-001",
  "objectIdentifiers": [
    {"objectName": "CL_ABAP_TYPEDESCR", "objectType": "CLAS"}
  ]
}
```

Use `abap_object_list_file_uris` when selecting a particular include or determining the available
files; its parameter is singular `objectIdentifier`. Use its `mainFile` to select main source.
For a native read alone, `abap_object_read_file` already accepts the same name/type form, so no
preceding resolver call is required. That is a native-tool capability, not a reason to repeat an
ARC-1 read or bypass an ARC-1 refusal.

For BTP, the client can combine remote ARC-1 research with the local ADT resolver. ARC-1 retains
`ARC1_IDE_LINKS=off` and no presentation headers are required for this optional path. The client
still needs the explicit connection/target-to-local-destination mapping and its own SAP logon.
The resolver's advertised SID fallback chooses the first match when multiple destinations match;
use the exact local destination. BTP cannot infer its backend/client from the alias.

The existing ARC-1 initialize hint already permits this composition; this follow-up changes setup
documentation only. It adds no server-to-laptop connection, resolver dependency or tool schema.
Canonical link rendering/opening and reliable Copilot stop behavior remain separate acceptance gaps.

## Evidence and cleanup

Sanitized local evidence is in `/tmp/arc1-oneof-20261019/`: `tools.json`, `server.json`, `live.json`,
`extra.json`, `wrong-types.json`, `schema.json` and the reproducer scripts. The SDK loaded the existing
local MCP token without printing or saving it in evidence. No SAP writes were performed.
The isolated window and its completed login tab were closed, port 2242 stopped, and the test
workspace's MCP server was disabled. The original VS Code window was left open.
