/** Experimental stored-TLINE read. This deliberately does not promise READ_TEXT semantics. */
import type { AdtClient } from '../../../src/adt/client.js';
import { DEFAULT_LIMITS, decodeStxl } from './decoder.js';

export interface TextKey {
  TDOBJECT: string;
  TDNAME: string;
  TDID: string;
  TDSPRAS: string;
}
const keyLengths = { TDOBJECT: 10, TDNAME: 70, TDID: 4, TDSPRAS: 1 } as const;
export function keyFilters(key: TextKey) {
  return Object.entries(keyLengths).map(([name, length]) => {
    const value = key[name as keyof TextKey];
    if (
      typeof value !== 'string' ||
      !value.length ||
      value.length > length ||
      Array.from(value).some((char) => char.charCodeAt(0) < 32)
    ) {
      throw new Error(`STXL: invalid ${name}`);
    }
    return { field: name, op: '=', value };
  });
}

export function assembleChunks(rows: Record<string, string>[], key: TextKey, client: string): Buffer {
  keyFilters(key);
  if (!/^\d{3}$/.test(client)) throw new Error('STXL: invalid client');
  if (!rows.length || rows.length > 256) throw new Error('STXL: missing or excessive chunks');
  const chunks = rows
    .map((row) => {
      if (
        row.MANDT !== client ||
        row.RELID !== 'TX' ||
        Object.keys(keyLengths).some((name) => row[name] !== key[name as keyof TextKey])
      )
        throw new Error('STXL: chunk identity mismatch');
      if (!/^\d+ *$/.test(row.SRTF2) || !/^\d+ *$/.test(row.CLUSTR)) throw new Error('STXL: invalid chunk integer');
      const index = Number(row.SRTF2);
      const length = Number(row.CLUSTR);
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index > 255 ||
        length < 1 ||
        length > 7902 ||
        !/^[\da-f]{15804}$/iu.test(row.CLUSTD)
      )
        throw new Error('STXL: invalid or truncated binary chunk');
      return { index, data: Buffer.from(row.CLUSTD.slice(0, length * 2), 'hex') };
    })
    .sort((a, b) => a.index - b.index);
  let total = 0;
  for (const [index, chunk] of chunks.entries()) {
    if (chunk.index !== index) throw new Error('STXL: missing or duplicate chunk sequence');
    if (index < chunks.length - 1 && chunk.data.length !== 7902) throw new Error('STXL: short intermediate chunk');
    total += chunk.data.length;
    if (total > DEFAULT_LIMITS.maxInputBytes) throw new Error('STXL: compressed input limit exceeded');
  }
  return Buffer.concat(
    chunks.map((chunk) => chunk.data),
    total,
  );
}

export async function readStoredText(client: Pick<AdtClient, 'runTableQuery'>, key: TextKey, sapClient: string) {
  const filters = [{ field: 'RELID', op: '=', value: 'TX' }, ...keyFilters(key)];
  const chunks: Record<string, string>[] = [];
  // A bounded SRTF2 window avoids response truncation and dependence on database ordering.
  for (let start = 0; start < 256; start += 32) {
    const data = await client.runTableQuery('STXL', {
      columns: ['MANDT', 'RELID', 'TDOBJECT', 'TDNAME', 'TDID', 'TDSPRAS', 'SRTF2', 'CLUSTR', 'CLUSTD'],
      where: [
        ...filters,
        { field: 'SRTF2', op: '>=', value: String(start) },
        { field: 'SRTF2', op: '<', value: String(start + 32) },
      ],
      maxRows: 33,
    });
    if (data.rows.length > 32 || data.rows.some((row) => Number(row.SRTF2) < start || Number(row.SRTF2) >= start + 32))
      throw new Error('STXL: invalid chunk window');
    chunks.push(...data.rows);
    if (data.rows.length < 32 || start === 224) {
      const bytes = assembleChunks(chunks, key, sapClient);
      return { ...(await decodeStxl(bytes)), chunks: chunks.length, compressedBytes: bytes.length, bytes };
    }
  }
  throw new Error('STXL: chunk request limit exceeded');
}
