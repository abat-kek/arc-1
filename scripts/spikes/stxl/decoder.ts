/**
 * Experimental STXL/TLINE decoder; no SAP installation, RFC, Python, or third-party runtime.
 * Container marker research: aamelin1/sap-long-texts, commit 19c8c272 (MIT; see NOTICE).
 * Verified profile: FF06, Unicode little-endian (4103), flat TLINE, CS_LZH or plain.
 * This is an opt-in research spike, not a universal IMPORT/READ_TEXT implementation.
 */
import { promisify } from 'node:util';
import { inflateRaw } from 'node:zlib';

const inflate = promisify(inflateRaw);
export interface TextLine {
  format: string;
  text: string;
}
export interface DecodeLimits {
  maxInputBytes: number;
  maxOutputBytes: number;
  maxLines: number;
}
export const DEFAULT_LIMITS: Readonly<DecodeLimits> = Object.freeze({
  maxInputBytes: 2 * 1024 * 1024,
  maxOutputBytes: 4 * 1024 * 1024,
  maxLines: 10_000,
});

function fail(message: string): never {
  throw new Error(`STXL: ${message}`);
}
function checkLimits(limits: DecodeLimits): void {
  for (const name of Object.keys(DEFAULT_LIMITS) as Array<keyof DecodeLimits>) {
    const value = limits?.[name];
    if (!Number.isSafeInteger(value) || value < 1 || value > DEFAULT_LIMITS[name as keyof DecodeLimits]) {
      fail(`invalid ${name}; limits may only narrow the hard ceiling`);
    }
  }
}
function range(data: Buffer, offset: number, size: number): Buffer {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(size) ||
    offset < 0 ||
    size < 0 ||
    offset + size > data.length
  ) {
    fail(`truncated container at byte ${offset}`);
  }
  return data.subarray(offset, offset + size);
}
function uint(data: Buffer, offset: number, size: number): number {
  return range(data, offset, size).readUIntBE(0, size);
}
function textBytes(bytes: Buffer, codePage: string): string {
  if (codePage !== '4103') fail(`unverified code page ${codePage}`);
  try {
    return new TextDecoder('utf-16le', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return fail(`invalid ${codePage} character sequence`);
  }
}

export async function unpackCluster(data: Buffer, limits: DecodeLimits = DEFAULT_LIMITS) {
  checkLimits(limits);
  if (data.length > limits.maxInputBytes) fail('compressed input limit exceeded');
  range(data, 0, 16);
  if (data[0] !== 0xff || data[1] !== 6 || data[2] !== 2) fail('unverified container signature/version/byte order');
  const version = data[1];
  const codePage = data.subarray(8, 12).toString('latin1');
  textBytes(Buffer.alloc(0), codePage); // Reject unknown code pages even for an empty table.
  const compression = data[4];
  let payload: Buffer;
  if (compression === 1) {
    payload = data.subarray(16);
    if (payload.length > limits.maxOutputBytes) fail('uncompressed output limit exceeded');
  } else if (compression === 2) {
    range(data, 16, 9);
    if (data[20] !== 0x12 || data[21] !== 0x1f || data[22] !== 0x9d) fail('unsupported compression header');
    const expected = data.readUInt32LE(16);
    if (expected < 1 || expected > limits.maxOutputBytes) fail('declared output limit exceeded');
    const source = data.subarray(24);
    const shift = 2 + (source[0] & 3);
    const reframed = Buffer.alloc(source.length);
    for (let i = 0; i < source.length; i++) {
      reframed[i] = (source[i] >>> shift) | ((source[i + 1] ?? 0) << (8 - shift));
    }
    try {
      payload = await inflate(reframed, { maxOutputLength: expected, windowBits: 14 });
    } catch {
      return fail('invalid, truncated, oversized, or unsupported LZH stream');
    }
    if (payload.length !== expected) fail('decompressed length mismatch');
  } else {
    return fail(`unsupported compression flag ${compression}`);
  }
  return { version, codePage, compressed: compression === 2, payload };
}

export async function decodeStxl(data: Buffer, limits: DecodeLimits = DEFAULT_LIMITS) {
  const { version, codePage, compressed, payload } = await unpackCluster(data, limits);
  const charBytes = codePage.startsWith('410') ? 2 : 1;
  const lines: TextLine[] = [];
  let p = 0;
  let descriptor = false;
  let ended = false;
  let rowBytes = 0;
  const fields: number[] = [];
  let declaredRows: number | undefined;
  let structureStarted = false;
  let structureEnded = false;
  let rowPending = false;
  let tableClosed = false;
  const emit = (offset: number, length: number) => {
    if (
      ended ||
      tableClosed ||
      rowPending ||
      !descriptor ||
      declaredRows === undefined ||
      length !== 134 * charBytes ||
      rowBytes !== length ||
      fields.length !== 2 ||
      fields[0] !== 2 * charBytes ||
      fields[1] !== 132 * charBytes
    )
      fail('unexpected TLINE row shape');
    if (lines.length >= limits.maxLines) fail('line limit exceeded');
    const row = range(payload, offset, length);
    lines.push({
      format: textBytes(row.subarray(0, 2 * charBytes), codePage).replace(/ +$/u, ''),
      text: textBytes(row.subarray(2 * charBytes), codePage).replace(/ +$/u, ''),
    });
    rowPending = true;
  };
  while (p < payload.length) {
    const marker = payload[p];
    if (ended) {
      if (marker !== 0) fail('non-padding bytes after container end');
      p++;
      continue;
    }
    switch (marker) {
      case 3: {
        if (descriptor) fail('multiple tables in TLINE container');
        const nameOffset = 32;
        const nameLength = uint(payload, p + 11, 1);
        const bytes = charBytes;
        const name = textBytes(range(payload, p + nameOffset, nameLength * bytes), codePage);
        if (name !== 'TLINE') fail('container does not hold TLINE');
        range(payload, p, nameOffset + nameLength * bytes);
        p += nameOffset + nameLength * bytes;
        descriptor = true;
        break;
      }
      case 0xad:
        if (!descriptor || structureStarted || fields.length || declaredRows !== undefined)
          fail('misplaced structure start');
        if (uint(payload, p + 3, 4) !== 268) fail('unexpected structure length');
        structureStarted = true;
        p += 7;
        break;
      case 0xae:
        if (!structureStarted || structureEnded || fields.length !== 2 || declaredRows !== undefined)
          fail('misplaced structure end');
        if (uint(payload, p + 3, 4) !== 268) fail('unexpected structure length');
        structureEnded = true;
        p += 7;
        break;
      case 0xaa: {
        if (!structureStarted || structureEnded || fields.length >= 2) fail('unexpected character descriptor');
        const length = uint(payload, p + 3, 4);
        if (length !== (fields.length === 0 ? 4 : 264)) fail('unexpected TLINE field length');
        fields.push(length);
        rowBytes += length;
        p += 7;
        break;
      }
      case 0xbe:
        if (!structureEnded || declaredRows !== undefined || lines.length) fail('misplaced table descriptor');
        if (uint(payload, p + 1, 4) !== rowBytes) fail('table row length mismatch');
        declaredRows = uint(payload, p + 5, 4);
        if (declaredRows > limits.maxLines) fail('declared line limit exceeded');
        p += 9;
        break;
      case 0xbc: {
        const length = uint(payload, p + 1, 4);
        emit(p + 5, length);
        p += 5 + length;
        break;
      }
      case 0xbb:
        emit(p + 1, rowBytes);
        p += 1 + rowBytes;
        break;
      case 0xbd:
        if (!rowPending || tableClosed) fail('misplaced row end');
        rowPending = false;
        p++;
        break;
      case 0xbf:
        if (declaredRows === undefined || tableClosed || rowPending || declaredRows !== lines.length)
          fail('misplaced table end');
        tableClosed = true;
        p++;
        break;
      case 4:
        if (!tableClosed) fail('container ended before table');
        ended = true;
        p++;
        break;
      default:
        return fail(`unsupported container marker ${marker} at ${p}`);
    }
  }
  if (!descriptor || !ended) fail('missing TLINE descriptor or end marker');
  if (declaredRows !== undefined && declaredRows !== lines.length) fail('declared line count mismatch');
  return { version, codePage, compressed, lines, outputBytes: payload.length };
}
