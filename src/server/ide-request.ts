/** Request-local presentation preferences. Never use these values for SAP routing or authorization. */
import { isIdeDestination } from './ide-config.js';
import { TARGET_ID_PATTERN } from './multi-target-identity.js';
import type { ServerConfig } from './types.js';

export const IDE_CLIENT_HEADER = 'arc1-ide-client';
export const IDE_DESTINATIONS_HEADER = 'arc1-ide-destinations-v1';
export const IDE_HEADER_LIMIT = 4096;
export const IDE_MAPPING_LIMIT = 32;
export interface IdeLinkContext {
  readonly destination: string;
  /** Server-selected public target, not a caller-supplied selector. */
  readonly target?: string;
}
type Headers = Record<string, string | string[] | undefined>;

/** Use the server-selected target configuration; only successful authorized results are decorated. No session state. */
export function resolveHttpIdeContext(config: ServerConfig, headers?: Headers): IdeLinkContext | undefined {
  if (config.transport !== 'http-streamable' || config.ideLinks !== 'vscode' || !headers) return undefined;
  // Explicit capability preference, not client authentication. Names/User-Agent/initialize are unreliable
  // on stateless HTTP. Configure these headers only in the desktop VS Code MCP server entry.
  if (headers[IDE_CLIENT_HEADER] !== 'vscode') return undefined;
  const raw = headers[IDE_DESTINATIONS_HEADER];
  if (typeof raw !== 'string' || raw.length > IDE_HEADER_LIMIT || !/^[\x20-\x7e]+$/.test(raw)) return undefined;
  const entries = raw.split(',');
  if (entries.length > IDE_MAPPING_LIMIT) return undefined;
  const aliases = new Map<string, string | undefined>();
  try {
    for (const entry of entries) {
      const pair = entry.trim().split('=');
      // @single is exclusively the traditional single-target /mcp connection.
      if (pair.length !== 2 || (pair[0] !== '@single' && !TARGET_ID_PATTERN.test(pair[0]))) return undefined;
      const alias = decodeURIComponent(pair[1]);
      if (!isIdeDestination(alias)) return undefined;
      if (aliases.has(pair[0]) && aliases.get(pair[0]) !== alias) aliases.set(pair[0], undefined);
      else if (!aliases.has(pair[0])) aliases.set(pair[0], alias);
    }
  } catch {
    return undefined;
  }
  // Never fall back from a pinned/aggregate target to the single-target preference.
  const key = config.targetId ?? (config.multiTargetEndpoints ? undefined : '@single');
  const destination = key ? aliases.get(key) : undefined;
  return destination ? { destination, target: config.targetId } : undefined;
}
