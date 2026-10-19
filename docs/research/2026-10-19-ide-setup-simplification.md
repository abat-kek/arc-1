# Native Eclipse links and smaller per-client configuration

Follow-up to [editor-link research](2026-10-19-editor-links-and-setup.md) in draft PR #1025.
The earlier record describes the experiments before the Eclipse formatter existed. This follow-up
implements that formatter and an offline configuration helper. It is not yet in published `@latest`.

## Implemented contract

- `ARC1_IDE_LINKS=off` remains the default. `vscode` retains its existing semantics. `eclipse`
  enables SID-based native ADT navigation. HTTP-only `on` allows either editor, selected explicitly
  by each request. Stdio must choose one editor for that connection.
- Eclipse HTTP needs only `Arc1-Ide-Client: eclipse`. No local VS Code alias/map is required.
  A selected multi-target runtime gets the real configured SID from `TargetDescriptor.sid`
  (`sap-sysid`), never the public route alias. The aggregate surface has no SID until target selection.
  A process-wide `ARC1_IDE_SYSTEM_ID` is rejected for multi-target startup.
- Local and traditional single-target HTTP use explicit `ARC1_IDE_SYSTEM_ID=A4H`. This is a
  presentation setting paired with the existing SAP connection, not a routing or authorization input.
  Single-target `eclipse` requires it. HTTP `on` without a SID warns at startup and can serve VS Code but omits Eclipse links.
- Known CLAS, INTF, PROG and DDLS main-object endpoints are emitted as `adt://<SID>/sap/bc/adt/...`.
  No version query, fragment, arbitrary URI template, credentials, or project-creation data is accepted.
  Eclipse includes are omitted until separately qualified. Existing tool source/JSON stays unchanged;
  links use the existing post-authorization, bounded eight-link decoration path without extra SAP calls.
- The link block labels the selected public target when available, configured SID and SAP client,
  and tells the user to check the local project. SID navigation is a manual navigation aid: native
  Eclipse may choose a project without a chooser, and ARC-1 cannot guarantee exact backend identity.

## Configuration helper

`arc1 config ide` prints only the preference fragment to merge into one existing MCP server entry.
It never resolves SAP configuration, inspects or emits credentials, writes settings, or contacts a backend.

| Scenario | Inputs beyond the command |
|---|---|
| Local VS Code | `--destination A4H2023-2` |
| Pinned BTP / VS Code | `--endpoint https://HOST/A4H/001/mcp --destination A4H2023-2` |
| Aggregate BTP / VS Code | `--endpoint https://HOST/multi/mcp --map A4H/001=A4H2023-2` (repeat mappings as needed) |
| Local Eclipse | `--mcp-client eclipse --system-id A4H` |
| BTP / Eclipse | `--mcp-client eclipse --endpoint https://HOST/A4H/001/mcp` |
| Claude configuration | `--mcp-client claude` defaults off; explicit `--editor` selects links |

The helper derives the pinned public target from the URL and emits the mapping header with encoded
aliases. `/mcp` emits `@single` and explicitly documents the traditional-server prerequisite; it cannot
detect the remote deployment mode. Eclipse gets `requestInit.headers`; VS Code and Claude get `headers`.
Local fragments clear unused IDE values to override inherited presentation settings in that server entry.
Users merge nested members and preserve existing connection/authentication members. This is not a full
connection installer or a remote/local identity verifier. `--mcp-client` avoids collision with SAP `--client`.

## Executed checks

| Check | Result / boundary |
|---|---|
| Focused unit/routing/config/CLI tests | 399 passed before review; includes real HTTP pinned/aggregate middleware with synthetic SAP/Destination responses |
| Full local unit suite | 9,444 passed, 339 files including the subsequent native-composition/setup fixes; no skipped/failed tests |
| Typecheck, build, lint and size/schema budgets | Passed; lint retained two existing informational diagnostics in unrelated code |
| Packed `npx`, generated off/vscode/eclipse fragments | Live A4H/001 class reads passed; same source SHA-256 in all modes |
| Packed `npx`, Eclipse class/interface/program/CDS | All four live SAP reads returned the expected native object URI |
| Traditional local HTTP `on` | Eclipse, VS Code, explicit off and missing preference all passed; source stayed identical |
| Native Eclipse dialog | Generated class, interface, program and CDS links opened their matching active source in A4H_2023 |
| Existing BTP app health | Healthy, original version 0.9.27; this follow-up has not deployed the new Eclipse runtime |

Live checks used `https://a4h.marianzeis.de`, client 001, read-only. The generated object links were:

```text
adt://A4H/sap/bc/adt/oo/classes/cl_abap_typedescr
adt://A4H/sap/bc/adt/oo/interfaces/if_serializable_object
adt://A4H/sap/bc/adt/programs/programs/sapmssy0
adt://A4H/sap/bc/adt/ddic/ddl/sources/i_currency
```

Every native opening presented the duplicate-SID chooser; selecting A4H_2023 opened the expected
object. No project was renamed or created, source changed, or handler preference changed. Test-only
editor tabs were closed afterwards. Earlier user screenshots independently qualify direct Eclipse
Copilot dispatch; these new native-dialog checks do not constitute a new end-to-end Copilot session.
Namespaced URI encoding is covered by unit tests, not a new namespaced native opening.

The unchanged class source hash across local stdio and HTTP styles was
`631ff0819d097f18752a7cab744dc95b61fc6ce76282857012d5ec4b4eff58f0`.
The ten live cases and native screenshot are retained locally in `/tmp/arc1-editor-research/setup-*`.

## Out-of-the-box options investigated

**Infer the SID from ordinary discovery:** both `/sap/bc/adt/discovery` and `/sap/bc/adt/core/discovery`
returned 200 on A4H, but neither exposed a usable SID attribute. No SID inference from hostname,
cookie names, source-object master system, or local project count was added. Multi-target already
has configured `sap-sysid`; explicit single-target SID avoids another startup probe/API dependency.

**Use the client's existing setup UI:** VS Code now documents editable portable `.mcp.json` and
Copilot-global forms, while its profile-specific configuration supports `envFile`. Those formats
are not interchangeable. Interactive `${input:...}` servers are not forwarded to Copilot harness
sessions, so a one-time generated literal preference is a more portable option than an input prompt
on every MCP launch. See the official [MCP setup](https://code.visualstudio.com/docs/agent-customization/mcp-servers)
and [configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration).

**Claude plugin preferences:** the official [manifest reference](https://code.claude.com/docs/en/plugins-reference)
supports `userConfig` and saved `pluginConfigs[pluginId].options`. An isolated three-field
mode/destination/SID manifest passed strict validation. An actual Claude Code/Opus 5.5 Max probe
then returned `{"mode":"eclipse","destination":"","systemId":"A4H"}` from defaults and
`{"mode":"vscode","destination":"SAVED-001","systemId":""}` from a settings-file override.
Both calls had zero permission denials. This qualifies real substitution into the plugin server's
explicit env block, not the installed ARC-1 configuration UI or Desktop rendering.

Initial attempts failed: the Homebrew launcher received an old-client model rejection despite its
reported version; the NVM Claude binary accepted Opus 5.5 and strict validation. Several probe starts
reported `posix_spawn 'stdio'` even with a Node command, followed by cached connection failures.
A fresh probe using the NVM Node executable connected. Its first tool call was then denied because
`mcp__*` was not a sufficient allow rule; an exact tool permission succeeded. These failed attempts
are retained, not counted as passes or proof that env/userConfig is unsupported. A different launcher
and fresh configuration resolved the practical probe; the original spawn-error cause is unconfirmed.

The production Claude plugin and MCPB bundle now expose matching ordinary string fields, default off,
substituted only into their own MCP server environment. A dropdown `options` prototype passed strict
validation but was not adopted: it would make the whole plugin require Claude Code v2.1.271+.
The complete updated Claude manifest passed strict validation in an isolated directory. Manifest
parity/wiring tests passed (45 tests). The repository root still has its pre-existing ignored
CLAUDE.md warning under strict plugin validation; the isolated manifest check does not hide that.
No user settings, installed plugin caches, or keychain records were edited by these probes.

## Remaining qualification

- New Eclipse output through a deployed BTP candidate and a fresh real Copilot session; existing
  VS Code BTP evidence is in the [separate acceptance record](2026-10-18-btp-native-ide-links.md).
- Exact Eclipse project mapping, missing projects, encoded-name collisions, cloud projects, other OSes.
- Actual installed ARC-1 plugin configuration UI and Desktop link behavior; a newer dropdown can be considered separately with an explicit minimum-client policy.
- Canonical SAP VS Code URI/edit lifecycle and existing second-identity/PP deployment gaps remain
  separate. Neither SID navigation nor the helper changes those guarantees.

## Subsequent simple-composition pass

The [native MCP acceptance record](2026-10-19-native-mcp-composition.md) covers the new conditional
initialize hint, HTTP-off/global-`--client` helper fixes, single-target ceiling tests and actual
Opus 5.5 Max review. Native resolution succeeded but later native editor logon failed. Copilot kept
the confirmed alias after the wording fix but did not obey the stop-on-failure instruction.
This remains experimental; the existing direct-link setup is still the qualified path.
