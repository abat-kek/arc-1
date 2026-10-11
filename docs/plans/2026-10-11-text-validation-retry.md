# Text-pool validation must not trigger MIME negotiation

PR #974 supplied the reproduction: a selection label exceeding 30 characters
returns HTTP 406, and ARC-1 repeats the rejected PUT with `Accept: application/xml`.
The same status also represents genuine content negotiation, so disabling every
406 retry would break supported backends.

## Decision

Keep the existing negotiation fallback in one small helper. Suppress it only for
text-part PUTs with live-verified validation keys: `SEDX_ADT/110` (selection length),
`SEDX_ADT/107` (invalid annotation), and `DS/512` (inconsistent symbols). Reuse the
existing XML property extractor. The T100 key identifies the failure regardless
of exception serialization; no localized message matching or new XML parser is needed.

Check these keys before extracting MIME-looking text from an error. Preserve
unknown messages, other routes/methods, 415 handling, the legacy 7.40 fallback,
and caching only after successful negotiation. This is narrower than treating
all messages outside `SADT_RESOURCE` as validation failures.

## Reproduction and validation

Baseline `3b6b003d` (main plus #971), Node 24, direct ADT with the public dispatcher
for disposable object lifecycles:

- 758 and 816 over HTTPS/Basic: overlong selections (including `@DDICReference`),
  missing/too-small symbol lengths, and lowercase annotations each cause two PUTs.
- BTP ABAP, named-user OAuth: the symbol cases also cause two PUTs.
- A deliberately invalid Accept on a valid text-part GET negotiates successfully
  on all three systems. 750 discovery has no text-elements service; its native
  path returns 404. No 7.40 system is available.
- All disposable objects were deleted and verified absent with native 404s.

Unit regressions cover the transport attempt count/original error and follow-up
write, structured XML variants, known/unknown keys, route scope and MIME inference.
The same live cases must be rerun on the final build, expecting one rejected PUT
and unchanged genuine negotiation. No roadmap impact (FEAT-34 is a separate
translation-workflow gap).
