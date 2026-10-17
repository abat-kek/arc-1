# Diagnostic evidence

These reads help inspect existing objects without saving or activating them. All calls retain the
current caller's scope, deny rules, target restrictions and SAP authorization. Available in builds
containing these changes; the published 1.5.2 package does not include them.

## Check several objects

```json
{
  "tool": "SAPRead",
  "args": {
    "type": "SYNTAX",
    "version": "active",
    "objects": [
      { "type": "CLAS", "name": "ZCL_EXAMPLE" },
      { "type": "DDLS", "name": "ZI_EXAMPLE" }
    ]
  }
}
```

Use 1–20 distinct CLAS, PROG, INTF or DDLS objects (PROG is unavailable on BTP). The compatibility
route `SAPDiagnose(action="syntax", objects=[...])` returns the same evidence. Omit `name`,
`objectType`/`type` and `source` when using a batch; it checks stored active or inactive source.
Single-object checks, including unsaved source, keep their existing behavior.

| Result | Meaning |
|---|---|
| `passed` | Exactly one recognized, processed report per object; no reported errors; warnings may remain |
| `failed` | Complete object reports contain syntax errors |
| `incomplete` | Missing, duplicate, unknown or unattributed evidence prevents a full verdict |
| Object `not-checked` | SAP did not establish a usable report for that requested object |

Messages retain their source locations. `requestedVersion` records the request; SAP supplies no
immutable source hash or independent version proof. `checkedAt` is observation time. A processed
report is not proof that an absent object exists; SAP can return an include-style syntax error.
There is one native batch POST, with a 30-second deadline and 512-KiB response limit. No per-object
fallback or package expansion runs.

## Filter short dumps

First call `SAPDiagnose` with `{"action":"feed_schema"}`. This reads the target's advertised dumps
attributes and operators. Then submit typed filters:

```json
{
  "action": "dumps",
  "maxResults": 10,
  "filters": [
    { "attribute": "runtimeError", "operator": "equals", "values": ["TIME_OUT"] },
    { "attribute": "datetime", "operator": "between", "values": ["20261001000000", "20261017235959"] }
  ]
}
```

Filters are ANDed; there are at most eight, including an optional legacy `user` filter. Each
attribute, operator and operand count must be advertised. Datetimes use valid UTC
`YYYYMMDDHHMMSS`; reversed ranges are refused. String values are bounded ASCII identifiers/patterns
with spaces, `_`, `/`, `$`, `.`, `*` and `-`; quotes, backslashes and grammar delimiters are refused.
No arbitrary query expressions, feed URLs or shared schema cache are accepted.

Existing `user`, `from`, `to`, result limits and inclusive time-cursor pagination remain supported.
Typed filters apply only to list mode, without `id`. Schema plus pages share a 30-second deadline
and 2-MiB response budget. Schema parsing itself is capped at 256 KiB. A saturated second that
prevents safe paging still produces an explicit error.

## Read an existing Dictionary log

```json
{ "action": "activation_log", "type": "DOMA", "name": "ZEXAMPLE" }
```

Types: DOMA, DTEL, TABL or DDLS. ARC-1 checks metadata identity and follows exactly one advertised,
canonical activation-log link with GET. It never activates the object or follows links inside logs.

| Status | Meaning |
|---|---|
| `available` | Existing log read; hierarchy, messages and raw severity retained |
| `unsupported` | This object's metadata advertises no supported log relation |
| `denied` | SAP returned 401/403 |
| `unavailable` | SAP returned 404 |

Malformed or ambiguous metadata/logs fail. `retrievedAt` is retrieval time; `activationTime` remains
null and `correlation` remains `not-established`. An old successful log says nothing about a later
activation attempt. Unknown severities remain unknown. Limits: 20 seconds, eight HTTP attempts,
512 KiB combined metadata/log, depth eight, 250 entries and 2,000 characters per text field.
Clipped output sets `truncated: true`.
