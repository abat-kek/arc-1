# STXL TypeScript spike

Manual research code; it is not registered as an MCP tool or included in the npm runtime.
The reader uses guarded ADT table queries, then a bounded TypeScript parser and Node's built-in
zlib. It requires no RFC, SAP SDK, Python, AMDP, or installed ABAP companion.

Verified profile: **FF06 / code page 4103 / little-endian / flat TLINE**, compressed CS_LZH or
uncompressed EXPORT data. Other versions/code pages are rejected. It reads stored text lines;
it does not implement the full semantics of `READ_TEXT` or render SAPscript/SmartForms.

See [research and live evidence](../../../docs/research/2026-10-17-stxl-typescript-spike.md).

## Offline validation

Use the repository's supported Node version; this investigation used Node 24.19.0.

```sh
npm ci
npx vitest run tests/unit/spikes/stxl.test.ts
npm run typecheck
```

`tests/fixtures/stxl/` contains only synthetic SAP-generated EXPORT data from releases
750, 758, and 816. Expected SHA-256 values come from the independently returned ABAP TLINE
table, normalized by removing fixed-width ASCII space padding. Small plain fixtures are also
included. The ABAP generator asserts kernel IMPORT round-trip equality before returning data.

## Live reproduction

Provide `TEST_SAP_URL`, `TEST_SAP_USER`, `TEST_SAP_PASSWORD`, and `TEST_SAP_CLIENT` through
the environment or your approved secret loader. TLS verification is required. Never commit
credentials, existing text captures, or SAP standard source code.

```sh
export STXL_SYSTEM_LABEL=758
export STXL_OUTPUT_DIR="$(mktemp -d /tmp/arc1-stxl-XXXXXX)"
npx tsx scripts/spikes/stxl/probe.ts
STXL_ALLOW_HELPERS=true npx tsx scripts/spikes/stxl/kernel-fixtures.ts
npx tsx scripts/spikes/stxl/check-kernel-fixtures.ts "$STXL_OUTPUT_DIR/$STXL_SYSTEM_LABEL-kernel-fixtures-output.txt"
STXL_ALLOW_HELPERS=true npx tsx scripts/spikes/stxl/corpus.ts
STXL_ALLOW_HELPERS=true STXL_CORPUS_LANGUAGE=E npx tsx scripts/spikes/stxl/corpus.ts
STXL_ALLOW_HELPERS=true npx tsx scripts/spikes/stxl/roundtrip.ts
```

`probe.ts` reads STXL through ADT. Set `STXL_PREVIEW_MODE=ddic` to check the alternative DDIC
preview endpoint. The isolated client enables data preview; it does not change a deployed MCP
server's settings. `reader.ts` itself never changes a caller's safety configuration.

To read one existing stored text with no helper writes:

```sh
export STXL_TEXT_KEY='{"TDOBJECT":"TEXT","TDNAME":"YOUR_TEXT","TDID":"ST","TDSPRAS":"E"}'
npx tsx scripts/spikes/stxl/read-text.ts
# Explicit alternative when the SQL space workaround is needed; requires free-SQL authorization:
STXL_ALLOW_FREE_SQL=true STXL_QUERY_ROUTE=sql npx tsx scripts/spikes/stxl/read-text.ts
```

Decoded lines are saved privately as `<label>-read-text.json`, not printed to the terminal.

The oracle scripts require a non-production system and explicit `STXL_ALLOW_HELPERS=true`.
They create, activate, execute, and delete uniquely named `$TMP` classes. `roundtrip.ts` also
creates one unique synthetic standard text, compares its 37 STXL chunks with the oracle, then
deletes it and verifies absence from STXH/STXL. This write capability belongs only to test
setup/cleanup. The candidate reader is read-only.

On the tested 750 system the data-preview endpoints returned 404. Kernel validation still works:

```sh
STXL_ALLOW_HELPERS=true STXL_LEGACY_GET_CLASSRUN=true npx tsx scripts/spikes/stxl/kernel-fixtures.ts
STXL_ALLOW_HELPERS=true STXL_LEGACY_GET_CLASSRUN=true npx tsx scripts/spikes/stxl/legacy-corpus.ts
```

That explicit legacy switch follows the inspected SAP 750 `CL_OO_ADT_RES_CLASSRUN~GET` contract.
GET still executes ABAP and retains the helper opt-in and mutation safety gate. It is not a
read-only fallback. The class name must be uppercase on this backend.

Artifacts use mode 0600 in a directory created with mode 0700. Keep the output directory private.
If a process is terminated or cleanup fails, consult the saved helper source/lifecycle files and
remove only the identified disposable class/text after checking its identity. Reusing a cached
oracle (`STXL_REUSE_ORACLE=true`) is an explicit test convenience, not a production cache.

## Limits and unresolved integration work

- 2 MiB compressed input, 4 MiB decompressed container, 10,000 lines; callers can only narrow limits.
- At most nine bounded SRTF2 windows; each read preserves the ARC-1 table data safety gate.
- Requires full 7,902-byte CLUSTD hex cells and uses CLUSTR for meaningful lengths. Rejects mixed
  identities, missing/duplicate chunk numbers, malformed hex, and partial intermediate chunks.
- Multiple requests do not establish a transactional snapshot. Compression has no verified
  integrity check; valid mutations or opaque trailing compressor bytes are not authenticated.
- SAP 816's SQL-line CONDENSE changes repeated spaces inside literal keys. Ordinary exact-key
  queries can therefore miss a stored text. The spike does not silently broaden its selection.
  `readStoredTextSql` in `sql-reader.ts` is an explicit alternative requiring the existing free-SQL
  opt-in. It reconstructs gaps with `CONCAT_WITH_SPACE` and recovered the affected text on both
  758 and 816. It never changes client safety settings or automatically replaces a failed read.
- Production integration must retain data scope, table blocklists, per-user identity, shared
  response/time budgets, and audit behavior. The public extension facade currently does not
  expose the guarded `runTableQuery` method.

The MIT container reference is attributed in [NOTICE](NOTICE). No GPL implementation was copied.
