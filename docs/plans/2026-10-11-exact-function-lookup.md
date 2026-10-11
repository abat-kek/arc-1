# Exact function lookup on 7.50 (COMPAT-09)

Current main a0fc4cb8 returns found=false for BAPI_USER_GET_DETAIL and
/UI2/CATALOG_PFCG_CHANGE on 750 SP02: quickSearch decorates the display name,
while its FUGR/FF URI still contains the canonical name. Both succeed on
758 SP02 and 816 SP01. The #911 function-group resolver does not serve this lookup.

## Plan and review

1. For FUGR/FF only, extract the name from the verified function metadata URI.
2. Match that canonical identity exactly and return the canonical name, so
   type-free usages and duplicate filtering receive the same identity.
3. Keep other object families unchanged. Ignore malformed/unrecognized function
   URIs; never strip arbitrary display suffixes or accept an unrelated first hit.
4. Test decorated and namespaced functions, duplicate/conflicting labels, unrelated
   types and malformed URIs, then repeat public lookup/usages on 750/758/816.

Review: no new resolver framework, cache, schema or privilege is needed. Preserve
search authorization and ambiguity across different URIs/packages. BTP has no
classic function-module surface, so this compatibility case is on-prem only.

## Validation

The two canonical-name regressions failed before the change. All 8,356 unit tests,
typecheck, lint, policy validation, build and file/schema budgets pass afterward.
The final runtime was tested through local handleToolCall over HTTPS Basic on
750 SP02, 758 SP02 and 816 SP01: standard/namespaced SAPSearch tadir_lookup
returned canonical identities; SAPContext usages without a type resolved FUNC
and returned a capped native where-used result on all three. No SAP writes.

Final review checked ambiguity, malformed escapes, conflicting display labels,
and unaffected non-function matching. The implemented COMPAT-09 entry is removed.
