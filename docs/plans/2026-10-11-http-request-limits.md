# Bounded MCP HTTP request bodies (OPS-07)

Current main accepts a 102400-byte JSON-RPC body and returns HTML 413 for
102401 bytes, before dispatch. Reproduced with the real HTTP server on loopback.
Large source writes therefore need an explicit server-side request contract.

## Plan and review

- Add ARC1_MAX_HTTP_REQUEST_BYTES / --max-http-request-bytes, default 102400,
  positive integer capped at 16 MiB. Keep the current default; allow an operator
  to opt into larger MCP JSON requests. OAuth/form JSON stays at 100 KiB.
- Include /mcp, aggregate/pinned paths and Copilot's JSON /authorize alias.
- Before parsing JSON, reserve its configured maximum against a fixed 32 MiB
  per-server in-flight input budget. Hold until response completion/disconnect;
  reject excess admission with 503, never queue. This bounds concurrent parsing
  before authentication without adding a second operator setting.
- Return concise JSON for malformed/oversized input without echoing payloads.
  Keep URL-encoded bodies at their existing limit and authentication/safety intact.
- Test exact byte boundaries, UTF-8, chunked/compressed bodies, route aliases,
  authentication, concurrent admission and cleanup after parse failure/disconnect.
- Verify a >100 KiB disposable class write/read-back through HTTP on available
  SAP test systems; record final build, auth route and cleanup.

Review: raising only Express's limit multiplies pre-auth memory pressure. A small
admission counter suffices; no generic queue or policy framework. The byte budget
bounds admitted input, not total process RSS (JSON/string/object overhead remains).

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
