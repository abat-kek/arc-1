# Exact object lookup on 7.50 (COMPAT-09)

Main a0fc4cb8 returns found=false on 750 SP02 because quickSearch decorates
object names (for example `T000 (Database Table)`). Review reproduced this for
classes, tables and programs as well as functions. 758 SP02 and 816 SP01 return
plain names. The #911 function-group resolver does not serve this lookup.

## Plan and review

1. Preserve existing exact-name matches.
2. For a decorated result, require both a display label beginning with `NAME (`
   and a relative ADT URI whose final segment decodes to the requested name.
3. Return the canonical name and preserve ambiguity across types, packages and
   distinct URIs. Ignore malformed, unrelated and non-object URI suffixes.
4. Test standard/namespaced functions, classes, tables, programs, conflicting
   labels, malformed URIs and ambiguity; repeat public lookup/usages live.

Review: this replaces the function-only branch with one type-independent rule.
No resolver framework, cache, schema or permission change is needed. The label
and URI must agree for decorated results; exact-name behavior stays unchanged.
The reproduced decoration is specific to 7.50; no BTP live coverage is claimed.

## Validation

Initial function regressions failed before the first change. Independent review
then reproduced missing T000, SAPMSSY0 and CL_ABAP_TYPEDESCR on 750, including
class usages without a type. The revised tests cover those object families,
namespaces, malformed escapes, misleading labels and ambiguous identities.
The completed COMPAT-09 entry is removed from the roadmap.

Review follow-up validation: 8,363 tests, typecheck, lint, policy, build,
file/schema budgets and strict MkDocs pass. Public tadir_lookup for T000,
SAPMSSY0 and CL_ABAP_TYPEDESCR, plus type-free class usages, now succeeds on
750 SP02, 758 SP02 and 816 SP01 through local handleToolCall over HTTPS Basic.
