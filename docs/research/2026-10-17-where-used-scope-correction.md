# Where-used preflight correction (#1018)

The existing helper posted to `/usageReferences/scope` without `uri`, using the
wrong MIME type and root element. Its parser expected reference counts that the
native response does not contain. This prevented append discovery and added a
failed request to CDS guidance.

The reviewed fix removes that helper and its invented fixture. Both callers use
one ordinary where-used query. Structure discovery filters TABL candidates and
confirms `extend type <base> with` in each candidate source. CDS guidance retains
deduplication. Actual endpoint absence still produces a structure warning;
authorization failures still propagate. No new tool parameters are added.

## Live evidence, 17 October 2026

- 758: `/AIF/FHEAD` has append `/AIF/ECATT`. Main returned zero appends with a
  scope warning; the fix returns the append with no warning.
- 816: `SEPA_STR_MANDATE_ALV` has append `DDMA_APPEND_MNDT_ALV`. Main returned zero
  appends; the fix returns the append and its nested includes without a warning.
- 758, 816 and BTP: disposable base/consumer CDS views were created and activated.
  Guidance found the consumer using exactly one where-used request. All fixtures
  were deleted and the inactive list checked.
- 750: the disposable classic CDS pair activated, but SAP returned HTTP 200 with
  zero results and “Where-used is not supported at this position”. Cleanup passed.
  CDS consumer discovery is therefore unverified on 750; zero results are not proof
  that no consumer exists.
- Native scope requests work on 816 and BTP although the exact scope subpath is
  absent from discovery. They return selectable categories, grades and an opaque
  payload, not per-type counts. The scope endpoint returns 404 on 750 and 758.

#1018's package filtering and bounded position/snippet retrieval remain separate
research. Correcting request headers alone would not fix the callers' assumptions.
Roadmap checked: no existing item changed by this bug fix.
