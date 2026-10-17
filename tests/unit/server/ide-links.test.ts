import { describe, expect, it } from 'vitest';
import { textResult } from '../../../src/handlers/shared.js';
import { appendIdeLinks, buildVsCodeLink, IDE_LINK_LIMIT } from '../../../src/server/ide-links.js';
import { DEFAULT_CONFIG } from '../../../src/server/types.js';

const config = { ...DEFAULT_CONFIG, ideLinks: 'vscode' as const, ideDestination: 'DEV 2023 (001)' };
const source = textResult('CLASS zcl_test DEFINITION.\nENDCLASS.');
const args = { type: 'CLAS', name: 'ZCL_TEST' };

function inner(link: string | undefined): URL {
  expect(link).toBeDefined();
  expect(link).not.toMatch(/[()]/); // Markdown must not close a link at a namespace/destination parenthesis.
  const url = new URL(link!);
  expect(url.protocol).toBe('vscode:');
  expect(url.host).toBe('sapse.adt-vscode');
  expect(url.pathname).toBe('/open');
  expect([...url.searchParams.keys()]).toEqual(['abapUri']);
  return new URL(url.searchParams.get('abapUri')!);
}

describe('SAP ADT 1.2 native links', () => {
  it.each([
    ['CLAS', 'ZCL_TEST', 'zcl_test.clas.abap'],
    ['CLAS/OC', 'CL_ABAP_TYPEDESCR', 'cl_abap_typedescr.clas.abap'],
    ['INTF', 'IF_SERIALIZABLE_OBJECT', 'if_serializable_object.intf.abap'],
    ['PROG/P', 'SAPMSSY0', 'sapmssy0.prog.abap'],
    ['DDLS', '/DMO/I_FLIGHT', '(dmo)i_flight.ddls.acds'],
  ])('round-trips destination and %s object identity through both encoding layers', (type, name, filename) => {
    const uri = inner(buildVsCodeLink(config.ideDestination, { type, name }));
    expect(uri.protocol).toBe('abap:');
    expect(uri.host).toBe('');
    expect(uri.pathname).toBe(`/flat/DEV%202023%20(001)/${filename}`);
    expect(uri.search).toBe('');
    expect(uri.hash).toBe('');
  });

  it.each(['definitions', 'implementations', 'macros', 'testclasses'])('preserves class include %s', (include) => {
    const uri = inner(buildVsCodeLink('DEV', { ...args, include }));
    expect(uri.pathname).toBe(`/flat/DEV/zcl_test.clas.${include}.abap`);
  });

  it.each(['../evil', 'X?abapUri=command:evil', 'X#frag', 'X\\Y', '', '.', 'A\nB', 'DEV ', 'a'.repeat(129)])(
    'refuses invalid destinations %j',
    (destination) => expect(buildVsCodeLink(destination, args)).toBeUndefined(),
  );
  it.each(['Z*', 'X,Y', 'Z[A](command:x)', '../X', 'X?x=1', 'X#Y', 'X%2F..', 'X\nY', 'A'.repeat(81)])(
    'refuses invalid object names %j',
    (name) => expect(buildVsCodeLink('DEV', { type: 'CLAS', name })).toBeUndefined(),
  );
  it.each(['FUNC', 'TABL', 'DTEL', 'DOMA', 'DEVC', 'VERSIONS', 'DUMPS', 'BDEF', 'UNKNOWN'])(
    'does not guess unsupported %s filenames',
    (type) => expect(buildVsCodeLink('DEV', { type, name: 'X' })).toBeUndefined(),
  );
  it('refuses unverified include shapes', () => {
    expect(buildVsCodeLink('DEV', { ...args, include: '../main' })).toBeUndefined();
    expect(buildVsCodeLink('DEV', { type: 'PROG', name: 'X', include: 'definitions' })).toBeUndefined();
  });
  it('follows the read handler local-method include inference and explicit main override', () => {
    for (const [method, include] of [
      ['lhc_task~read', 'implementations'],
      ['ltc_task~test', 'testclasses'],
    ]) {
      const linked = appendIdeLinks(source, 'SAPRead', { ...args, method }, config);
      expect(linked.content[1].text).toContain(`zcl_test.clas.${include}.abap`);
      const main = appendIdeLinks(source, 'SAPRead', { ...args, method, include: 'main' }, config);
      expect(main.content[1].text).toContain('zcl_test.clas.abap');
    }
    expect(inner(buildVsCodeLink('DEV', { ...args, include: 'DEFINITIONS' })).pathname).toContain('.definitions.abap');
  });
  it('follows ignored include arguments and skips class-include grep placeholders', () => {
    for (const type of ['PROG', 'INTF']) {
      const linked = appendIdeLinks(source, 'SAPRead', { type, name: 'ZTEST', include: 'definitions' }, config);
      expect(linked.content[1].text).toContain(`ztest.${type.toLowerCase()}.abap`);
    }
    const structured = appendIdeLinks(
      source,
      'SAPRead',
      { ...args, format: 'structured', method: 'lhc_x~read', include: 'testclasses' },
      config,
    );
    expect(structured.content[1].text).toContain('zcl_test.clas.abap');
    expect(appendIdeLinks(source, 'SAPRead', { ...args, grep: 'x', include: 'testclasses' }, config)).toBe(source);
    expect(appendIdeLinks(source, 'SAPRead', { type: 'DDLS', name: 'ZI_TEST', include: 'elements' }, config)).toBe(
      source,
    );
  });
  it('leaves transliteration-prefixed search output intact without guessing its JSON boundary', () => {
    const result = textResult(
      'Note: Query contained non-ASCII characters.\n\n[{"objectType":"CLAS","objectName":"ZCL_TEST"}]',
    );
    expect(appendIdeLinks(result, 'SAPSearch', { query: 'ZÜ*' }, config)).toBe(result);
  });
  it('keeps source and JSON byte-identical in the first block without mutating the result', () => {
    const original = textResult('{"value":"original\\ntext"}');
    const before = structuredClone(original);
    const linked = appendIdeLinks(original, 'SAPRead', args, config);
    expect(linked.content).toHaveLength(2);
    expect(linked.content[0]).toEqual(before.content[0]);
    expect(JSON.parse(linked.content[0].text)).toEqual({ value: 'original\ntext' });
    expect(linked.content[1].text).toMatch(/^\nOpen current source/);
    expect(linked.content[1].text).toContain('[ZCL_TEST (CLAS)](vscode://sapse.adt-vscode/');
    expect(original).toEqual(before);
  });
  it('is inert by default, for HTTP and for every multi-target configuration', () => {
    for (const override of [
      DEFAULT_CONFIG,
      { ...config, transport: 'http-streamable' as const },
      { ...config, multiTargetEndpoints: true },
      { ...config, targetId: 'DEV/001' },
      { ...config, destinationName: 'BTP_ALIAS' },
      { ...config, ideDestination: '' },
    ]) {
      expect(appendIdeLinks(source, 'SAPRead', args, override)).toBe(source);
    }
  });
  it('does not decorate failures, destructive calls, plugins, SQL rows, or historical comparisons', () => {
    const error = { ...source, isError: true };
    expect(appendIdeLinks(error, 'SAPRead', args, config)).toBe(error);
    for (const tool of ['SAPWrite', 'SAPQuery', 'SAPTransport', 'Custom_Source', 'SAP']) {
      expect(appendIdeLinks(source, tool, args, config)).toBe(source);
    }
    expect(appendIdeLinks(source, 'SAPRead', { ...args, action: 'diff' }, config)).toBe(source);
  });
  it('uses actual object-search rows and deduplicates/caps the additional links', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      objectType: 'CLAS/OC',
      objectName: `ZCL_${i}`,
      uri: '/sap/bc/adt/x',
    }));
    const result = textResult(JSON.stringify([rows[0], ...rows]));
    const linked = appendIdeLinks(result, 'SAPSearch', { query: 'Z*' }, config);
    expect(linked.content[0]).toEqual(result.content[0]);
    expect(linked.content[1].text.match(/vscode:\/\//g)).toHaveLength(IDE_LINK_LIMIT);
    expect(linked.content[1].text).not.toContain('ZCL_8');
  });
  it('only links ADT-confirmed lookup matches', () => {
    const result = textResult(
      JSON.stringify({
        lookups: [
          {
            found: true,
            matches: [
              { objectType: 'CLAS', objectName: 'Z_GHOST', _origin: 'db' },
              { objectType: 'CLAS', objectName: 'Z_REAL', _origin: 'adt' },
            ],
          },
        ],
      }),
    );
    const linked = appendIdeLinks(result, 'SAPSearch', { searchType: 'tadir_lookup' }, config);
    expect(linked.content[1].text).toContain('Z_REAL');
    expect(linked.content[1].text).not.toContain('Z_GHOST');
  });
  it('uses reference identities, never a supplied or backend-provided arbitrary URI', () => {
    const result = textResult(
      JSON.stringify({ references: [{ type: 'CLAS/OC', name: 'ZCL_TEST', uri: 'command:evil' }] }),
    );
    const linked = appendIdeLinks(result, 'SAPNavigate', { action: 'references' }, config);
    expect(linked.content[1].text).toContain('ZCL_TEST');
    expect(linked.content[1].text).not.toContain('evil');
  });
  it.each(['not JSON', '{}', 'null', '"text"', '[null,{},42]', ' '.repeat(262145)])(
    'silently preserves unexpected/oversized result envelopes',
    (text) => {
      const result = textResult(text);
      expect(appendIdeLinks(result, 'SAPSearch', {}, config)).toBe(result);
    },
  );
  it('never recursively extracts identities from source-search text', () => {
    const result = textResult(JSON.stringify([{ objectType: 'CLAS', objectName: 'ZCL_TEST' }]));
    expect(appendIdeLinks(result, 'SAPSearch', { searchType: 'source_code' }, config)).toBe(result);
  });
});
