# Quick-fix application (#993)

Reproduced on 8.16 with an active disposable class and an unsaved undefined variable.
Evaluation returned six proposals; applying the declaration proposal dumped in
`CL_ART_QUICKFIX_PROVIDER=>APPLY`. Its exact-URI lookup receives the complete request
URI from `CL_QUICKFIX_ADT_HELPER`, including ARC-1's added SAP query parameters.
Moving client/language to headers made the unchanged XML request return a delta.
The saved class stayed unchanged. A second defect trims leading newlines/indentation
from the returned replacement text.

Plan:
1. For proposal POSTs only, send configured SAP client/language in headers, retain
   the existing SAML-disable header, and leave the supplied proposal URI unchanged.
   CSRF bootstrap and other ADT calls keep their existing URL parameters.
2. Preserve XML whitespace for quick-fix evaluation state, affected source units,
   and returned deltas. Reuse the existing whitespace-preserving XML parser.
3. Cover wire URLs/headers, CSRF retry, configured client, and exact delta text with
   regression tests. Run declaration evaluation/application on available systems,
   verify no implicit save, and syntax-check a usable returned edit.
4. Correct the older blanket advice that all refactoring-provider proposals fail.
   SAP's proposals can still need review or additional input; do not invent a
   general interactive-refactoring engine or automatically save returned edits.

Plan review: keep the change in transport request construction and the existing
quick-fix XML consumers. No new public option, action, retry loop, or auth fallback.
The configured client remains explicit, using SAP's documented header alternative.
FEAT-05 still covers broader rename/extract workflows; update its evidence only.
