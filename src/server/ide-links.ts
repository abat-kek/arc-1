/** Presentation-only links for SAP's ADT for VS Code 1.2 URI handler. No SAP or filesystem access. */
import { expandHyperfocusedArgs } from '../handlers/hyperfocused.js';
import {
  detectLocalHandlerInclude,
  normalizeObjectType,
  normalizeTypeArgsForValidation,
} from '../handlers/object-types.js';
import type { ToolResult } from '../handlers/shared.js';
import { isIdeDestination } from './ide-config.js';
import type { IdeLinkContext } from './ide-request.js';
import type { ServerConfig } from './types.js';

export const IDE_LINK_LIMIT = 8;
const MAX_RESULT_CHARS = 256 * 1024;
const MAX_CANDIDATES = 1000;
const SOURCE_SUFFIXES: Readonly<Record<string, string>> = {
  CLAS: 'clas.abap',
  INTF: 'intf.abap',
  PROG: 'prog.abap',
  DDLS: 'ddls.acds',
};
const CLASS_INCLUDES = new Set(['definitions', 'implementations', 'macros', 'testclasses']);

export interface IdeObject {
  type: string;
  name: string;
  include?: string;
}

/** SAP AFF uses (namespace)name, unlike abapGit's #namespace#name convention. */
export function buildVsCodeLink(destination: string, object: IdeObject): string | undefined {
  if (!isIdeDestination(destination)) return undefined;
  const type = normalizeObjectType(object.type);
  let suffix = SOURCE_SUFFIXES[type];
  if (!suffix || object.name.length > 80 || !/^(?:\/[A-Z0-9_]+\/)?[A-Z0-9_]+$/i.test(object.name)) {
    return undefined;
  }
  const include = object.include?.trim().toLowerCase();
  if (include && include !== 'main') {
    if (type !== 'CLAS' || !CLASS_INCLUDES.has(include)) return undefined;
    suffix = `clas.${include}.abap`;
  }
  const filename = `${object.name.toLowerCase().replace(/^\/([^/]+)\//, '($1)')}.${suffix}`;
  const uri = `abap:/flat/${encodeURIComponent(destination)}/${encodeURIComponent(filename)}`;
  return `vscode://sapse.adt-vscode/open?abapUri=${encodeURIComponent(uri).replace(/[()]/g, (char) => (char === '(' ? '%28' : '%29'))}`;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function identity(value: unknown): IdeObject | undefined {
  const row = asObject(value);
  if (!row || typeof row.type !== 'string' || typeof row.name !== 'string') return undefined;
  return { type: row.type, name: row.name, ...(typeof row.include === 'string' ? { include: row.include } : {}) };
}

/** Only known result envelopes; never mine arbitrary source, SQL rows, messages or plugin output for names. */
function candidates(tool: string, args: Record<string, unknown>, result: ToolResult): IdeObject[] {
  if (tool === 'SAPRead' && !args.action) {
    const object = identity(args);
    const type = object && normalizeObjectType(object.type);
    // These readers ignore filler include arguments; structured CLAS reads return the whole class.
    if (object && (type === 'PROG' || type === 'INTF' || (type === 'CLAS' && args.format === 'structured'))) {
      delete object.include;
    }
    // grep returns a successful explanatory result for a missing include. Do not promise it can open.
    if (type === 'CLAS' && args.grep && args.include) return [];
    if (
      object &&
      type === 'CLAS' &&
      args.format !== 'structured' &&
      args.include === undefined &&
      typeof args.method === 'string'
    ) {
      object.include = detectLocalHandlerInclude(args.method);
    }
    return object ? [object] : [];
  }
  if (tool !== 'SAPSearch' && !(tool === 'SAPNavigate' && args.action === 'references')) return [];
  if (tool === 'SAPSearch' && args.searchType === 'source_code') return [];
  const text = result.content[0]?.text;
  if (!text || text.length > MAX_RESULT_CHARS) return [];
  const payload: unknown = JSON.parse(text);
  const envelope = asObject(payload);
  let rows: unknown[] = [];
  if (tool === 'SAPSearch' && (!args.searchType || args.searchType === 'object')) {
    if (Array.isArray(payload)) rows = payload;
  } else if (tool === 'SAPSearch' && args.searchType === 'tadir_lookup') {
    // Only ADT-confirmed matches; database-only TADIR rows can be ghosts.
    if (Array.isArray(envelope?.lookups)) {
      for (const lookup of envelope.lookups.slice(0, MAX_CANDIDATES)) {
        const item = asObject(lookup);
        if (item?.found !== true || !Array.isArray(item.matches)) continue;
        for (const match of item.matches.slice(0, MAX_CANDIDATES - rows.length)) {
          if (asObject(match)?._origin === 'adt') rows.push(match);
        }
        if (rows.length >= MAX_CANDIDATES) break;
      }
    }
  } else if (tool === 'SAPNavigate' && Array.isArray(envelope?.references)) rows = envelope.references;
  return rows.slice(0, MAX_CANDIDATES).flatMap((row) => {
    const record = asObject(row);
    const object =
      tool === 'SAPNavigate' ? identity(row) : identity(record && { type: record.objectType, name: record.objectName });
    return object ? [object] : [];
  });
}

/** Keep the original payload block byte-identical, including valid JSON. Best-effort, bounded and synchronous. */
export function appendIdeLinks(
  result: ToolResult,
  tool: string,
  args: Record<string, unknown>,
  config: ServerConfig,
  requestContext?: IdeLinkContext,
): ToolResult {
  if (result.isError || config.ideLinks !== 'vscode') return result;
  // HTTP presentation comes exclusively from this request. A global stdio alias is never a fallback.
  const destination =
    config.transport === 'http-streamable'
      ? requestContext?.target === config.targetId && (!config.multiTargetEndpoints || !!config.targetId)
        ? requestContext?.destination
        : undefined
      : !config.multiTargetEndpoints && !config.targetId && !config.destinationName
        ? config.ideDestination
        : undefined;
  if (!destination || !isIdeDestination(destination)) return result;
  try {
    if (tool === 'SAP') {
      const expanded = expandHyperfocusedArgs(args);
      if ('error' in expanded) return result;
      tool = expanded.toolName;
      args = normalizeTypeArgsForValidation(tool, expanded.expandedArgs);
    }
    const links = new Map<string, string>();
    for (const object of candidates(tool, args, result)) {
      const link = buildVsCodeLink(destination, object);
      if (!link || links.has(link)) continue;
      links.set(link, `- [${object.name.toUpperCase()} (${normalizeObjectType(object.type)})](${link})`);
      if (links.size >= IDE_LINK_LIMIT) break;
    }
    if (!links.size) return result;
    return {
      ...result,
      content: [
        ...result.content,
        {
          type: 'text',
          text: `\nOpen current source in SAP ADT for VS Code (${config.targetId ? `target: ${config.targetId}; ` : ''}destination: ${destination}; up to ${IDE_LINK_LIMIT} links):\n${[...links.values()].join('\n')}`,
        },
      ],
    };
  } catch {
    // Optional presentation must not turn an otherwise successful research call into a failure.
    return result;
  }
}
