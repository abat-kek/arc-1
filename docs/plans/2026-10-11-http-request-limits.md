# Bounded MCP HTTP request bodies (OPS-07)

Current main accepts a 102400-byte JSON-RPC body and returns HTML 413 for
102401 bytes, before dispatch. Reproduced with the real HTTP server on loopback.
Large source writes therefore need an explicit server-side request contract.

## Plan and review

- Add ARC1_MAX_HTTP_REQUEST_BYTES / --max-http-request-bytes, default 102400,
  positive integer capped at 16 MiB. Keep the current default; allow an operator
  to opt into larger MCP JSON requests. Other JSON endpoints and URL-encoded forms stay at 100 KiB.
- Include /mcp, aggregate/pinned paths and Copilot's JSON /authorize alias.
- Before parsing JSON above 100 KiB, reserve its uncompressed declared size
  (capped at the limit), or the full limit for unknown/compressed lengths, against
  a 32 MiB budget. Hold until response completion/disconnect; reject excess
  large-body admission with 503. Default-sized bodies bypass the budget so
  slow uploads and long tool calls cannot reserve away ordinary traffic.
- Return concise JSON for malformed/oversized input without echoing payloads.
  Keep URL-encoded bodies at their existing limit and authentication/safety intact.
- Test exact byte boundaries, UTF-8, chunked/compressed bodies, route aliases,
  authentication, concurrent admission and cleanup after parse failure/disconnect.
- Verify a >100 KiB disposable class write/read-back through HTTP on available
  SAP test systems; record final build, auth route and cleanup.

Review: raising only Express's limit multiplies pre-auth memory pressure. A small
admission counter suffices; no generic queue or policy framework. The byte budget
limits larger admissions, not live memory: disconnected tool calls may retain
input, and JSON/string/object overhead remains. Slow unauthenticated uploads can
occupy large-body capacity; proxy read/body timeouts remain necessary.

## Validation

Final runtime diff on main `a0fc4cb8`, built locally with Node 24.11.1 on macOS.
The real ARC-1 HTTP server and MCP SDK client used loopback API-key authentication
(admin and viewer); native SAP used HTTPS Basic for SAP_BASIS 750 SP02, 758 SP02,
816 SP01 and named-user OAuth for BTP ABAP. With a 262144-byte limit, each
143181-byte on-prem request (143194 bytes on BTP) created a disposable class,
activated it and read back identical normalized source from both inactive and
active storage. The viewer was denied the same large write. All four classes
were deleted and metadata 404s confirmed cleanup. The first 750 fixture placed
comments outside a method and SAP rejected it; that shell was deleted before
rerunning with valid method comments.

Boundary, UTF-8, compressed and chunked input, disconnect, concurrent admission,
malformed input and real-server authentication tests pass. Full unit suite,
typecheck, lint, policy validation, build, file/schema budgets and strict MkDocs
also pass. The fixed input reservation is not an RSS guarantee or SAP cancellation
mechanism; a disconnected client's already-running SAP work may still finish.
No CF deployment, reverse-proxy limit or PP identity path was exercised. Operators
must measure their actual concurrent workload before increasing the limit.

Final review retained one parser helper and one counter, without changing tool
schemas, SAP write gates or default request size. Removed completed OPS-07 from
the roadmap overview and details.


## Independent review follow-up

The initial fixed reservation caused a default-path lockout (330 slow bodies),
and only two slow bodies or small pending calls exhausted capacity at a 16 MiB
limit. Confirmed independently on the real authenticated HTTP server: two
unfinished unauthenticated uploads changed both valid initialization and an
unauthenticated request to 503. The size-aware rule above preserves ordinary
traffic while retaining bounded larger-body admission, without auth/router hooks.

A separate real-server test confirmed three disconnected synthetic tools can
retain 36 MiB beyond the admission budget. This is documented explicitly; adding
SAP cancellation or dispatch-lifetime accounting would be a separate contract.
The revised tests cover declared size, small requests at capacity, unknown lengths,
compressed parse failures and release on completion/disconnect.

Follow-up validation: 8,371 tests and all local gates pass. The actual server now
returns 401 to unauthenticated small requests and 200 to authenticated
initialization with two unfinished 16 MiB uploads; the same holds with 330 slow
uploads at the default limit. A fresh 143181-byte HTTP class write on 758 SP02
passed activation, exact source read-back, viewer denial and deletion/404 cleanup.
The earlier 750/816/BTP lifecycle evidence remains applicable to unchanged SAP
write code; those lifecycles were not repeated for this parser-only correction.
