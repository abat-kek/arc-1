# Quick-fix application: exact URI and replacement whitespace (#993)

On SAP_BASIS 816, an active disposable class plus an unsaved
`APPEND ls_undefined_var TO gt_message_buffer` reproduced the report: syntax check
identified the unknown variable, evaluation offered six proposals, and applying
`declare_local_variable` returned HTTP 500 / `OBJECTS_OBJREF_NOT_ASSIGNED`.

The dump points to `CL_ART_QUICKFIX_PROVIDER=>APPLY`: `CE_ART_QFIX=>FIND_BY_URI`
returns no proposal. `CL_QUICKFIX_ADT_HELPER=>CREATE_EVALUATION_RESULT` takes the
complete request URI; ARC-1 appended `sap-client` and `sap-language`, breaking the
exact lookup. The XML body and empty `userContent` were not the cause.

Sending the configured client/language as headers, without adding query parameters
to proposal POSTs, returned a declaration delta. The source in SAP stayed unchanged.
SAP documents the [sap-client header alternative](https://help.sap.com/doc/saphelp_nw74/7.4.16/en-US/b2/86b4512ea4414fb36f17b0568a86ac/content.htm).
CSRF bootstrap still selects the configured client through its original URL.

The raw delta began with a newline and indentation, which the shared XML parser
trimmed. Quick-fix responses now use its existing whitespace-preserving mode,
including opaque evaluation state and affected source units. A unit with absent
or empty content stays empty; formatting between XML elements is not replacement text.

A second probe, `lv_missing = 1`, returned `DATA: lv_missing TYPE i`. Inserting the
exact delta into the unsaved buffer passed SAP syntax checking. SAP's inferred
types are not universally usable: the APPEND probe suggested `TYPE TABLE OF
gt_message_buffer`. Proposals need review and syntax checking; ARC-1 returns them
unchanged and does not save them. A CRLF probe still yielded invalid types, so no
automatic newline conversion is included.

This supersedes the blanket conclusion in the [June quick-fix research](2026-06-03-atc-quickfix-surface-a4h.md)
that `/providers/refactoring/` proposals require a separate protocol. Some proposals
can require interactive input; declaration-delta success does not qualify every
rename, extract, RAP-generation, or multi-object refactoring.

Validation on 2026-10-13: direct HTTPS Basic on 750, 758 SP02 and 816, plus named-user
OAuth on BTP ABAP 920 SP05 after startup. Candidate code: `72dfd5bf` (subsequent
`778fb679` changes one documentation link). All four current-handler flows returned
deltas, passed the literal-assignment syntax check, and left saved source unchanged.
Disposable classes were deleted; BTP used package `ZARC1_PRSP_260916`. No deployed
CF/API-key or principal-propagation route was used; proxy forwarding is unit-tested.
