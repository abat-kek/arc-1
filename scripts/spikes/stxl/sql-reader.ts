/** Explicit SQL-enabled research route for 816's SQL-line CONDENSE behavior. Never a fallback. */
import type { AdtClient } from '../../../src/adt/client.js';
import { readStoredText, type TextKey } from './reader.js';

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** SQL CONCAT trims operand padding; CONCAT_WITH_SPACE restores the exact requested gap. */
export function spacePreservingLiteral(value: string): string {
  if (!/ {2}/u.test(value)) return quote(value);
  const parts = value.split(/( +)/u);
  let result = quote(parts[0] || ' ');
  for (let index = 1; index < parts.length; index += 2) {
    result = `concat_with_space( ${result}, ${quote(parts[index + 1] || ' ')}, ${parts[index].length} )`;
  }
  return result;
}

export async function readStoredTextSql(client: Pick<AdtClient, 'runQuery'>, key: TextKey, sapClient: string) {
  // Reuse the bounded identity/sequence/decoder pipeline, changing only the explicit query route.
  return readStoredText(
    {
      async runTableQuery(table, opts = {}) {
        if (table !== 'STXL') throw new Error('STXL: unexpected SQL source');
        const allowed = new Set(['RELID', 'TDOBJECT', 'TDNAME', 'TDID', 'TDSPRAS', 'SRTF2']);
        const clauses = (opts.where ?? []).map(({ field, op, value = '' }) => {
          if (!allowed.has(field) || !['=', '>=', '<'].includes(op)) throw new Error('STXL: unexpected SQL predicate');
          return `${field} ${op} ${spacePreservingLiteral(value)}`;
        });
        return client.runQuery(
          `SELECT MANDT, RELID, TDOBJECT, TDNAME, TDID, TDSPRAS, SRTF2, CLUSTR, CLUSTD FROM STXL WHERE ${clauses.join(' AND ')}`,
          opts.maxRows,
        );
      },
    },
    key,
    sapClient,
  );
}
