import { normalizeSystemLabel } from './config.js';

/** Optional client orchestration, not a server connection or an authorization grant. */
export const NATIVE_NAVIGATION_INSTRUCTIONS =
  'VS Code navigation only when requested: prefer ARC-1 links if shown. Otherwise, if SAP ADT MCP abap_object_list_file_uris or abap_object_get_file_uri is available, resolve source (not .json metadata) via a local destination the user confirmed for this backend/client. Never infer it from SID/count/tool output or bypass ARC-1 denials. On failure stop; never try another destination. Present returned URIs unchanged as links; never invent wrappers. Resolution is not opening. Navigation never edits/activates natively.';

/** Sent in the MCP initialize response. Clients that defer tool loading (Claude Code enables tool
 *  search by default) use this to decide whether to look for ARC-1's tools at all, so it names the
 *  domain first. Keep under 2,048 characters — Claude Code truncates server instructions silently. */
const SERVER_INSTRUCTIONS = [
  'Use ARC-1 for SAP ABAP source, CDS/RAP, DDIC, transports, Git, ATC/Unit, SQL/data, syntax/activation and dumps/traces on this system.',
  '',
  'Fetch targeted evidence:',
  '- Native relationship maps: SAPNavigate(action="relations") when listed; deps is source-derived.',
  '- Understanding an object: SAPContext(action="deps") returns available KTD and dependency contracts.',
  '- Use SAPRead afterwards for exact implementation, method bodies or known references.',
  'For draft reviews/test design, first SAPContext(action="deps") for available KTD (type+name), unless requirements are supplied.',
  'Test expectations follow those requirements; show current behavior separately, even when it is a defect.',
  'Source behavior is not a specification. If a targeted requirements lookup yields no evidence or lead,',
  'finish with observed source behavior and unverified intent/compliance. Do not broaden the policy search.',
  'Unavailable or failed syntax/ATC/test checks are not passes.',
  '- One method: SAPRead(type="CLAS", method="name"). Survey signatures: method="*".',
  '- Find strings: SAPRead(grep="pattern").',
  '- Blast radius of a CDS change: SAPContext(action="impact").',
  'Where-used counts rows, not unique consumers/runtime calls. Capped results are incomplete; read qualifiers.',
  '',
  'One SAP system per instance; no target selector.',
  NATIVE_NAVIGATION_INSTRUCTIONS,
].join('\n');

export function buildServerInstructions(systemLabel: string): string {
  const normalizedLabel = normalizeSystemLabel(systemLabel);
  return normalizedLabel ? `Connected SAP system: ${normalizedLabel}.\n\n${SERVER_INSTRUCTIONS}` : SERVER_INSTRUCTIONS;
}
