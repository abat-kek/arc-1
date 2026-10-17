# ADT for VS Code 1.2: native research-to-editor links

Research started 2026-10-17, against ARC-1 main `37fece94` (1.6.0). This is a focused continuation
of the earlier IDE/bridge work, not a replay of all ADT 1.2 feature work.

## Recovered requirements and work

| Earlier requirement / evidence | Disposition |
|---|---|
| Click a researched object in GitHub Copilot and open the real SAP editor | Implemented in core for qualified source types, using SAP's new native URI handler |
| Avoid browsing thousands of localized repository-tree entries to resolve a name | SAP's flat AFF filename representation removes tree traversal for these types |
| Preserve native Copilot editing, Keep/Undo, user control of save/activate | Still an editor workflow; navigation alone does not qualify editing or dirty-buffer reuse |
| Pre-save SAP validation with new-vs-existing findings (`abapValidate`) | Remains in the bridge; no new core API needed for navigation |
| Editable active-vs-inactive diff (`abapChanges`) | Remains in the bridge; transport review evidence is separately developed in #1008 |
| Bridge write journal / proposal inbox / review UX | No automatic revival; requires an explicit editor design and tested ownership of buffers |
| Avoid ARC-1 locks blocking ADT afterward | Old session-release change already merged separately in #803; do not reintroduce the old HTTP patch |
| Remote/shared ARC-1 and more than one SAP target | Deferred until per-client destination mapping is verified; a SAP SID is not a local IDE alias |

Sources recovered:

- Closed, unmerged [PR #676](https://github.com/arc-mcp/arc-1/pull/676), branch
  `claude/arc-1-vscode-abap-diffs-f0bfa9`. Its `docs/plans/ide-integration-v1.md`,
  `docs/research/2026-07-31-vscode-arc1-diff-bridge.md`, and
  `docs/research/2026-08-01-native-abap-editing-integration.md` record the previous requirements.
  The old `auto` mode inferred IDE identity/roots and emitted bridge links. Neither that mode nor
  its bridge fallback is carried forward.
- [arc1-abap-bridge](https://github.com/arc-mcp/arc1-abap-bridge): README, PLAN, and Copilot guidance.
  The earlier tree resolver traversed localized repository groups; a recorded depth-four search
  involved 2,181 listings. Native `abap:` editing already existed before ADT 1.2.
- Local Codex session **Analyze ABAP ADT extension 1.2**, with the saved
  `2026-10-16/i-x20/outputs/ARC1_RESEARCH_HANDOFF.md` and `ARC1_IMPLEMENTATION_PROMPT.txt`.
  Its transport, notebook, policy, and diagnostics research is already represented by draft PRs
  [#1008](https://github.com/arc-mcp/arc-1/pull/1008),
  [#1009](https://github.com/arc-mcp/arc-1/pull/1009),
  [#1010](https://github.com/arc-mcp/arc-1/pull/1010), and
  [#1011](https://github.com/arc-mcp/arc-1/pull/1011). This change does not duplicate them.

## Observed native contract

Compared installed official `sapse.adt-vscode` macOS ARM64 extensions **1.1.2** and **1.2.0**.
Inspected the extension manifest and bundle, plus the bundled ADT language server's URI and AFF
filename mapping. SAP implementation files and decompiled output remain local; none are copied
into ARC-1.

1. The 1.2.0 JavaScript bundle registers `window.registerUriHandler`; the inspected 1.1.2 bundle
   does not. Its `/open` path reads the `abapUri` query value and passes the parsed URI to
   `vscode.open`. It does not expose a public name-to-editor-URI resolver.
   The manifest has no `onUri` activation event: open an ABAP workspace first. The statement about
   no resolver refers to the extension's exported JavaScript API; the new MCP resolver below is
   a separate supported composition surface.
2. The bundled `VsCodeUriHandler` uses the native wrapper
   `vscode://sapse.adt-vscode/open?abapUri=<encoded URI>`.
3. The language server accepts `abap:/flat/<destination>/<AFF filename>` and resolves an AFF
   object identity without walking the localized `repotree-v1` tree. The destination segment is
   a local connection alias, not a backend SID. This internal representation is an observed
   compatibility contract, not a claim of a public stable SAP API.
4. `AffFileNameBuilder` uses `(namespace)name` for an ABAP `/NAMESPACE/NAME`, in lowercase.
   abapGit-style `#namespace#name` is wrong here. Initial live attempts using `#` failed; extra
   percent encoding did not fix the wrong filename. The corrected `(dmo)i_flight.ddls.acds`
   subsequently opened real CDS source.
5. Qualified suffixes are `clas.abap`, `intf.abap`, `prog.abap`, and `ddls.acds`. Class source
   parts use `clas.definitions.abap`, `clas.implementations.abap`, `clas.macros.abap`, and
   `clas.testclasses.abap`. All four suffixes occur in
   `ClasAffObjectTypeHandler` in `com.sap.adt.oo_3.62.0.jar` and
   `AdtDocumentSymbolsParams` in `com.sap.adt.tools.abapsource_3.62.0.jar`. Do not extrapolate AFF
   names for all ARC-1 object types.
6. Flat URI operations are not identical to repository-tree operations. The inspected flat
   implementation lacks several lifecycle/transport/file-type operations. Neither this inspection
   nor a successful open proves safe editing, activation, dirty-editor reuse, or transport handling.

### Native MCP composition discovered during Claude review

ADT 1.2.0 bundles `abap_object_get_file_uri` (`ResolveFileUrisAdtMCPTool` in
`com.sap.adt.tools.core_3.62.0.jar`) and `abap_object_list_file_uris`. The supplied `abap-developer`
agent now directs the model to URI resolution/AFF file listing instead of directory traversal.
The resolver accepts destination plus object identifiers (ADT URI, name/type, or AFF filename) and
is inspected to return canonical repository-tree URIs; this return path was not live-qualified. Use the exact destination alias, not the ambiguous SID
fallback. The extension still does not export a public JS resolver API.

The bundled language-server classes in `com.sap.adt.tools.core_3.62.0.jar` identify
`abap_object_read_file` and optional `abap_object_edit_file`; those in
`com.sap.adt.ris.search_3.62.0.jar` identify `abap_repository_search_object` and
`abap_repository_find_references`. These tool identities come from the bundled server, not the
extension manifest. The manifest leaves
`adt.mcpServer.enableEditFileToolForABAPObjects` disabled by default and warns of competing edit
tools. This supersedes the comparison guide's June claims of absent MCP read/search/edit tools;
the historical inventory is retained but explicitly distinguished from 1.2.

Useful client composition: ARC-1 research → returned ADT URI → SAP MCP resolver → canonical editor.
It can avoid a core resolver, bridge tree traversal, and flat/tree duplicate identities. Do not
call the local SAP MCP service from ARC-1 or copy its bearer token into server configuration. An
attempt in the current Copilot session reported the resolver unavailable. The tool picker also
showed older IDs such as `abap_activate_objects` and no match for `abap_object_get_file_uri`. No
settings or allowlists were changed, so canonical resolver invocation remains a follow-up live
check, not a passed test.

Example for local alias `DEV-001`:

```text
Object: /DMO/I_FLIGHT (DDLS)
Inner:  abap:/flat/DEV-001/(dmo)i_flight.ddls.acds
Outer:  vscode://sapse.adt-vscode/open?abapUri=abap%3A%2Fflat%2FDEV-001%2F%28dmo%29i_flight.ddls.acds
```

URI path segments are encoded before encoding the outer query. Parentheses in the outer URL are
percent encoded so a Markdown renderer cannot terminate the link early. The generator accepts
only a bounded destination alias and ABAP object-name grammar; backend-supplied URLs are ignored.

## Implementation boundary

`src/server/ide-links.ts` decorates successful research results after the normal dispatcher and
post-dispatch processing. `ARC1_IDE_LINKS=vscode` plus `ARC1_IDE_DESTINATION` is an explicit local
stdio opt-in. Default `off` preserves all existing outputs. HTTP/multi-target configurations are
refused or suppressed; no inferred roots, external redirects, command URIs, custom templates,
loopback listeners, bridge-install detection, or extra SAP requests are involved.

Only known envelopes are consumed: source-read arguments, object-search rows, ADT-confirmed TADIR
lookup matches, and reference identities. Additional content is a separate text block, at most
eight unique links. JSON remains JSON in its original block. Parsing is bounded to 256 Ki characters
and 1,000 candidates; malformed/unfamiliar envelopes fail silently to the original result. The
links say **current source**, not the exact researched version or location. No new tool schemas or
authorization scopes are needed. Direct CLI exports explicitly disable decoration even when the
configuration inherits IDE opt-in from `.env`. Class-include grep results are excluded because
missing includes can produce a successful explanatory result. Transliteration-prefixed search
responses are not plain JSON and remain undecorated. The ADT-only provenance filter applies to
TADIR lookup; reference identities can include database-derived interface implementers.

## Live checks

Read-only UI checks used VS Code 1.142.0 on macOS ARM64, installed SAP ADT 1.2.0, the existing `A4H2023-2` local destination, and
a4h (SAP_BASIS 758) through HTTPS 443. No ABAP edits, saves, activation, transport changes, or
persistent trust-prompt changes were performed. An expired SAP browser logon was refreshed through
the normal ADT login; after reconnecting the link was retried. A temporary local Markdown preview
held the navigation fixtures.

| Fixture | Observation |
|---|---|
| `CL_ABAP_TYPEDESCR` / CLAS | Real class source displayed through SAP's native handler |
| `IF_SERIALIZABLE_OBJECT` / INTF | Real interface definition displayed |
| `SAPMSSY0` / PROG | Program source displayed |
| `/DMO/I_FLIGHT` / DDLS | Correct namespace AFF filename displayed the CDS view entity |
| `ZCL_ARC1_TASK_SERVICE` / definitions | Existing local definitions include displayed |
| `ZCL_ARC1_TASK_SERVICE` / implementations | Existing implementation include displayed |
| Same class / macros and testclasses | Attempts showed file-not-found while the destination was disconnected; not qualified |
| Copilot Chat rendered native CLAS link | Clicking the assistant answer opened `CL_ABAP_TYPEDESCR`; source and answer visible together |

The Copilot check isolated **rendering and opening**, using an Ask-mode request to reproduce the
exact generator-shaped link without tools. It did not reconfigure the user's live MCP connection
to run this branch. Real ARC-1 dispatch and payload invariance are covered by automated tests.
Other OSes, VS Code Insiders, BTP/750/816 systems, macros/testclasses success, Unicode/spaced
destination aliases, and save/edit workflows were not live-qualified in this run.

## Automated checks and review

Focused tests exercise exact URI decoding, namespaces, class parts, slash-type aliases, injection
rejection, unsupported identities, unchanged source/JSON, disabled/error/HTTP/multi-target paths,
bounded deduplication, ADT-vs-DB lookups, malformed responses, and actual dispatch/hyperfocused
wrapping with no additional HTTP calls. Model quality is not a useful substitute for these
deterministic contracts; the separate Copilot smoke check covers the client-rendering boundary.

Claude Code was invoked with model `claude-opus-5-5` and `--effort max` for both research and
independent code review; completed runtime usage records confirm that model. Research review
identified the native MCP resolver, questioned unsupported flat-URI assumptions, and recommended
explicit destination mapping and a client-side canonical-resolver path. Live opening checks then
qualified the narrower navigation contract.

Code review found a medium-severity CLI export regression: shared dispatcher decoration could
append Markdown to source/JSON output when `.env` enabled links. The CLI now explicitly disables
decoration without mutating the resolved configuration, with source/search tests for text and JSON
output. Smaller findings were addressed through trimmed-alias validation, include handling, and
more precise provenance and qualification statements. The initial verdict was **approve after
fixing the CLI regression**. Final verification after those fixes:

- `npm run typecheck`, `lint`, `validate:policy`, `check:sizes`, `build`, and `mkdocs build --strict`
  passed. Tool-definition snapshots and schemas were not changed.
- The focused configuration, link generator, real dispatcher, and CLI regression run passed
  **364 tests**. One existing CLI subprocess test was explicitly excluded from that focused run;
  it was separately exercised and failed its startup deadline. No timeout or assertion was relaxed.
- An earlier complete `npm test -- --maxWorkers=2` run passed **329 files / 9,286 tests**. Later
  full and isolated runs hit four pre-existing subprocess cases: the CLI source-entry test's
  10-second deadline and three shutdown tests' 5-second `post-started` deadlines. These are
  reported as unresolved local timing failures, not silently counted as passing. A clean exported
  copy of base commit `37fece94`, using the same dependencies and one worker, reproduced the
  exact four failures (50 passed / 4 failed), confirming they also occur without this change.
- The first default-concurrency run also hit two HTTP-body timing failures; all 77 tests in the
  three affected files subsequently passed in an isolated two-worker run before later deadlines
  recurred. The new navigation and CLI-export assertions passed throughout.

The live Copilot exercise checks native link rendering/opening; it does not claim a model-quality
benchmark or a branch-connected end-to-end MCP deployment. Deterministic tests cover the actual
research envelopes, dispatch path, payload invariance, and request counts.

## Suggested continuation

- Qualify a per-client, per-target mapping for shared HTTP/BTP services before enabling links there
  (roadmap COMPAT-19). Never reinterpret a local alias as a SAP SID or silently choose the first root.
- Qualify canonical editor identity and existing dirty-buffer reuse before claiming native AI-edit
  parity with the bridge (COMPAT-20). Include Keep/Undo, unsaved edits, save, validation, transport,
  and activation as separate checks against a disposable object.
- Expand object coverage only with actual SAP filename/handler evidence and a successful open;
  preserve a clean no-link fallback for unsupported types.
- Keep notebook, transport-review, policy, and diagnostics feedback on their existing PRs. A new
  editor feature is evidence to investigate an endpoint, not proof that every release exposes it.
