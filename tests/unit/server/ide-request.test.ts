import { describe, expect, it } from 'vitest';
import { textResult } from '../../../src/handlers/shared.js';
import { appendIdeLinks } from '../../../src/server/ide-links.js';
import { IDE_CLIENT_HEADER, IDE_DESTINATIONS_HEADER, resolveHttpIdeContext } from '../../../src/server/ide-request.js';
import { DEFAULT_CONFIG } from '../../../src/server/types.js';

const config = {
  ...DEFAULT_CONFIG,
  transport: 'http-streamable' as const,
  ideLinks: 'vscode' as const,
  targetId: 'A4H/001',
  multiTargetEndpoints: true,
};
const headers = (map: string, client = 'vscode') => ({ [IDE_CLIENT_HEADER]: client, [IDE_DESTINATIONS_HEADER]: map });
const source = textResult('CLASS zcl_test DEFINITION.');
const args = { type: 'CLAS', name: 'ZCL_TEST' };

describe('per-request IDE mapping', () => {
  it('selects the exact authorized target/client, including route aliases', () => {
    const map = 'A4H/001=DEV,A4H/100=QA,A4H-2025/001=NEW';
    for (const [targetId, destination] of [
      ['A4H/001', 'DEV'],
      ['A4H/100', 'QA'],
      ['A4H-2025/001', 'NEW'],
    ]) {
      expect(resolveHttpIdeContext({ ...config, targetId }, headers(map))).toEqual({
        style: 'vscode',
        destination,
        target: targetId,
      });
    }
    expect(resolveHttpIdeContext({ ...config, targetId: 'A4H/002' }, headers(map))).toBeUndefined();
  });
  it('requires both the administrator ceiling and the client opt-in', () => {
    for (const client of ['', 'claude', 'copilot', 'VSCode', 'vscode,vscode']) {
      expect(resolveHttpIdeContext(config, headers('A4H/001=DEV', client))).toBeUndefined();
    }
    expect(resolveHttpIdeContext(config, { [IDE_DESTINATIONS_HEADER]: 'A4H/001=DEV' })).toBeUndefined();
    expect(resolveHttpIdeContext({ ...config, ideLinks: 'off' }, headers('A4H/001=DEV'))).toBeUndefined();
    expect(resolveHttpIdeContext(config)).toBeUndefined();
    expect(
      resolveHttpIdeContext(config, { [IDE_CLIENT_HEADER]: 'vscode', 'arc1-ide-destinations-v2': 'A4H/001=DEV' }),
    ).toBeUndefined();
  });
  it('uses @single only for traditional single-target HTTP, never a multi-target fallback', () => {
    const single = {
      ...config,
      targetId: undefined,
      multiTargetEndpoints: false,
      destinationName: 'BTP_DESTINATION',
      ideDestination: 'STALE',
    };
    expect(resolveHttpIdeContext(single, headers('@single=LOCAL'))).toEqual({
      style: 'vscode',
      destination: 'LOCAL',
      target: undefined,
    });
    expect(resolveHttpIdeContext(config, headers('@single=WRONG'))).toBeUndefined();
    expect(resolveHttpIdeContext({ ...config, targetId: undefined }, headers('@single=WRONG'))).toBeUndefined();
    expect(appendIdeLinks(source, 'SAPRead', args, single)).toBe(source);
  });
  it('round-trips Unicode and spaces exactly once', () => {
    const destination = 'DÉV 系統 (001)';
    const context = resolveHttpIdeContext(config, headers(`A4H/001=${encodeURIComponent(destination)}`));
    expect(context?.style === 'vscode' && context.destination).toBe(destination);
    const result = appendIdeLinks(source, 'SAPRead', args, config, context);
    expect(result.content[0]).toEqual(source.content[0]);
    expect(result.content[1].text).toContain('target: A4H/001; destination: DÉV 系統 (001)');
    const link = result.content[1].text.match(/vscode:\/\/[^\s]+/)![0].replace(/\)$/, '');
    const abap = new URL(new URL(link).searchParams.get('abapUri')!);
    expect(decodeURIComponent(abap.pathname.split('/')[2])).toBe(destination);
  });
  it('collapses identical duplicates and suppresses conflicting keys permanently', () => {
    expect(resolveHttpIdeContext(config, headers('A4H/001=DEV, A4H/001=DEV'))).toMatchObject({
      style: 'vscode',
      destination: 'DEV',
    });
    expect(resolveHttpIdeContext(config, headers('A4H/001=DEV,A4H/001=QA,A4H/001=DEV'))).toBeUndefined();
    expect(resolveHttpIdeContext(config, headers('A4H/100=DEV,A4H/100=QA,A4H/001=RIGHT'))).toMatchObject({
      style: 'vscode',
      destination: 'RIGHT',
    });
  });
  it.each([
    '',
    'DEV',
    'A4H/1=DEV',
    'a4h/001=DEV',
    'A4H/001=DEV,',
    'A4H/001=',
    'A4H/001=../escape',
    'A4H/001=%2Fescape',
    'A4H/001=%252Fescape',
    'A4H/001=%ZZ',
    'A4H/001=%C0%AF',
    'A4H/001=%20DEV',
    'A4H/001=DEV%0A',
    'A4H/001=DEV=evil',
    'A4H/001=DÉV',
    `A4H/001=${'a'.repeat(129)}`,
    ' '.repeat(4097),
    Array(33).fill('A4H/001=DEV').join(','),
  ])('silently ignores malformed or oversized presentation: %s', (value) => {
    expect(resolveHttpIdeContext(config, headers(value))).toBeUndefined();
  });
  it('refuses ambiguous non-normalized header arrays', () => {
    expect(
      resolveHttpIdeContext(config, {
        ...headers('A4H/001=DEV'),
        [IDE_DESTINATIONS_HEADER]: ['A4H/001=DEV', 'A4H/001=QA'],
      }),
    ).toBeUndefined();
  });
  it('refuses presentation context from a different selected target at the sink', () => {
    expect(
      appendIdeLinks(source, 'SAPRead', args, config, { style: 'vscode', destination: 'DEV', target: 'A4H/100' }),
    ).toBe(source);
    expect(appendIdeLinks(source, 'SAPRead', args, config, { style: 'vscode', destination: 'DEV' })).toBe(source);
    expect(
      appendIdeLinks({ ...source, isError: true }, 'SAPRead', args, config, {
        style: 'vscode',
        destination: 'DEV',
        target: 'A4H/001',
      }).content,
    ).toEqual(source.content);
  });
});
