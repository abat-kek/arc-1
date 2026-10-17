# Transport reviews

These workflows turn existing ARC-1 intent-tool results into reusable local JSON and HTML.
They use the configured CLI connection, identity, dispatcher, policies and audit path. They do
not release transports, activate objects, or change SQL/data permissions. This page describes
the implementation on this branch; it is not a claim about the published 1.5.2 package or an
older deployed MCP instance. Build the checkout before using its local CLI.

## Collect a transport review

```bash
arc1-cli review A4HK906371 --mode released --output-dir reviews/A4HK906371
# Optional current-source checks and bounded dependency context:
arc1-cli review A4HK906371 --mode released --syntax --context --output-dir reviews/A4HK906371-checked
```

Each command writes `evidence.json` and a standalone `report.html`, with private file permissions
and no silent overwrite. The report contains raw CTS keys, logical objects, per-part hunks,
source hashes, attribution, coverage gaps and checks actually performed. HTML is script-free;
source and messages are escaped. The machine report excludes the
continuation token. Reports can contain source code and SAP identities: share them deliberately.

`complete` describes collection of the supported source evidence, **not release readiness**.
`partial` includes missing/uncertain source, unsupported components or omitted hunks. `stale`
means inventory/target changed. `error` means collection failed or the connected runtime did
not provide the required versioned evidence. Exit code is 0 for complete collection, 1 otherwise;
check outcomes remain separate. ATC and ABAP Unit are not automatically run. Use the existing
[CLI checks](cli-guide.md) when their workload is warranted.

### Comparison intent

| Mode | Source selected | Missing evidence |
|---|---|---|
| `released` | Numbered snapshot attributed to the request or one of its tasks | Never substitutes current work |
| `active` | Saved active pseudo-version `00000` | Missing attribution stays uncertain |
| `draft` | Saved inactive pseudo-version `99999` | Not release-readiness evidence |
| `legacy` | Existing exact-transport preference, including work states, then candidate fallbacks | Kept for compatibility; inspect evidence labels |

The CLI defaults to `released`; existing `SAPTransport action="diff"` callers default to
`legacy`. Pseudo-versions never serve as historical baselines. An undated work state with known
history produces a candidate predecessor with ambiguous chronology. `no-prior-snapshot` means
no predecessor was found; an all-additions display is not proof of object creation. A 404 is
unavailable evidence, not proof of absence or deletion.

Every selected class part remains visible even when another part succeeds. Unattributed candidate
changes retain their hunks. `REPT` components explicitly identify unreviewed historical text pools.
Method CTS keys select whole source parts; they do not prove attribution of each hunk across
simultaneous requests. `isTestTransport` is preserved; no filtering rule is enabled without a live
fixture establishing its semantics. An advertised history `next` link marks coverage partial;
ARC-1 does not invent continuation behavior.

### Bounds and continuation

| Layer | Limit |
|---|---|
| One diff page | 20 objects by default, maximum 40; sequential part reads |
| SAP work per page | 30 seconds, 180 high-level reads and 180 actual sends including retries/CSRF |
| Successful response bodies | 1 MiB per response, 8 MiB cumulative per page; an oversized body stops the page |
| Diff computation | 100 ms / 20,000 edit-length work bound per part |
| Displayed hunk | 400 lines / 16 KiB per part; full statistics retained when computed |
| Page output | 512 KiB; omitted hunks and remaining pages are explicit |
| CLI collector | At most 5 pages of 20 objects, plus one final inventory revalidation |
| Optional checks | Syntax for up to 10 changed objects; dependency context for up to 3 changed/uncertain objects |

Use `summary:true` for hashes/statistics without hunks. Request bounded detail with the same
`reviewMode`, `continuation`, `offset` and `limit:1`. Large individual hunks remain capped; inspect
the recorded revision paths through existing revision readers when necessary.

The continuation is bound to caller, configured target, request, mode and normalized inventory,
including task identities/statuses, component identities and request status. It expires when the process restarts.
An offset without a token remains compatible but unverified. Inventory equality does not freeze
source: hashes identify the bytes read at their respective retrieval times. Optional active
syntax checks compare active hashes before/after, report drift or missing evidence, and never
claim to validate the historical snapshot. Dependency context likewise describes current source.
Page metrics exclude CLI startup/capability probes, optional checks and other pages. Optional
tools retain their own existing limits; the CLI is not a single atomic or hard-deadline SAP run.

Multi-target mode still excludes `SAPTransport.diff`. The local CLI uses its existing supported
direct connection modes; these commands do not introduce another remote credential store.

## Try an offline report

```bash
npx tsx scripts/demo-review-workflows.ts test-results/review-demos
```

Open `complete.html`, `partial.html` and `stale.html` in the output directory. Each has matching
JSON and is visibly marked as synthetic. No SAP connection is required. Use a new directory for
another run.

## Review checklist

1. Confirm the system/client, request and comparison mode.
2. Read the coverage gaps before interpreting unchanged source.
3. Inspect changed parts and their revision references.
4. Read which checks ran and which source state they examined.
5. Add your interpretation separately from the collected facts.

For the staged implementation and research decisions, see the
[ADT adoption backlog](https://github.com/arc-mcp/arc-1/blob/main/docs/research/adt-vscode-1.2/README.md).
