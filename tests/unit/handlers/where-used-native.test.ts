import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../../../src/server/types.js';
import { mockResponse } from '../../helpers/mock-fetch.js';
import { createClient, mockFetch } from './setup-undici-mock.js';

const { handleToolCall } = await import('../../../src/handlers/dispatch.js');
const { loadNativeUsages, loadUsageSnippets } = await import('../../../src/adt/where-used-native.js');
const { expandUsageDetails } = await import('../../../src/handlers/where-used-details.js');
const { SAPNavigateSchema } = await import('../../../src/handlers/schemas.js');
const { parseWhereUsedResponse } = await import('../../../src/adt/codeintel.js');
const base = '/sap/bc/adt/repository/informationsystem/';
const discovery = (scope = true, snippets = true) =>
  `<service><workspace><collection href="/other"><templateLink rel="other"/></collection></workspace><workspace>${scope ? '<templateLink rel="http://www.sap.com/adt/relations/informationsystem/usageReferences/scope"/>' : ''}${snippets ? `<collection href="${base}usageSnippets"/>` : ''}</workspace></service>`;
const scope = `<usageScopeResult><objectIdentifier displayName="Root" globalType="CLAS/OC"/><grade definitions="false" elements="true" indirectReferences="true"/><objectTypes>${['CLAS/OC', 'PROG/1P', 'PROG/1F', 'PROG/1T', 'TABL/DS'].map((name) => `<type name="${name}" isSelected="false" isDefault="false"/>`).join('')}</objectTypes><payload>a&amp;b</payload></usageScopeResult>`;
const refs = `<usageReferenceResult resultDescription="References for ROOT" referencedObjectIdentifier=""><referencedObjects>
<referencedObject uri="/class" isResult="false"><adtObject name="ZCL_OWNER" type="CLAS/OC"><packageRef name="$TMP"/></adtObject></referencedObject>
<referencedObject uri="/method" parentUri="/class" isResult="false" canHaveChildren="true"><adtObject name="CALCULATE"><packageRef name="$TMP"/></adtObject><objectIdentifier>a&amp;b</objectIdentifier></referencedObject>
<referencedObject uri="/structure" isResult="true"><adtObject name="ZSTRUCT" type="TABL/DS"><packageRef name="ZOTHER"/></adtObject></referencedObject>
</referencedObjects></usageReferenceResult>`;
const snippet = (id = 'a&amp;b', count = 1, content = 'result = root=&gt;marker.') =>
  `<usageSnippetResult><codeSnippetObjects><codeSnippetObject><objectIdentifier>${id}</objectIdentifier><codeSnippets>${Array.from({ length: count }, () => `<codeSnippet uri="/class/source/main#type=CLAS%2FOM;name=CALCULATE;start=2" matches="10-30,accessRead,gradeDirect"><content>${content}</content></codeSnippet>`).join('')}</codeSnippets></codeSnippetObject></codeSnippetObjects></usageSnippetResult>`;
let requests: { url: string; body: string }[];
function setup({
  hasScope = true,
  hasSnippets = true,
  referenceXml = refs,
  snippetXml = snippet(),
  status = 200,
} = {}) {
  mockFetch.mockImplementation(async (url, options) => {
    const path = new URL(String(url)).pathname;
    requests.push({ url: path, body: String(options?.body ?? '') });
    if (path.endsWith('/discovery'))
      return mockResponse(200, discovery(hasScope, hasSnippets), { 'x-csrf-token': 'T' });
    if (path.endsWith('/scope')) return mockResponse(200, scope);
    if (path.includes('/usageSnippets')) return mockResponse(status, snippetXml);
    if (options?.method === 'POST') return mockResponse(200, referenceXml);
    return mockResponse(200, '', { 'x-csrf-token': 'T' });
  });
}
beforeEach(() => {
  mockFetch.mockReset();
  requests = [];
  setup();
});
afterEach(() => vi.restoreAllMocks());
const navigate = (args = {}) =>
  handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPNavigate', {
    action: 'references',
    type: 'CLAS',
    name: 'ZCL_ROOT',
    ...args,
  });

it('keeps default lookups to the legacy request and does not expose expansion tokens', async () => {
  const output = JSON.parse((await navigate()).content[0]!.text!);
  expect(requests.filter((r) => r.body).length).toBe(1);
  expect(requests.some((r) => r.url.includes('usageSnippets'))).toBe(false);
  expect(output.references).toHaveLength(3);
  expect(JSON.stringify(output)).not.toContain('objectIdentifier');
  expect(output.searchedFor).toBe('References for ROOT');
});
it('uses advertised native types and exact packages, then filters objects locally', async () => {
  const output = JSON.parse((await navigate({ objectType: 'CLAS', packages: ['$TMP'] })).content[0]!.text!);
  const request = requests.find((r) => r.url.endsWith('/usageReferences'))!;
  expect(request.body).toContain('name="CLAS/OC" isSelected="true"');
  expect(request.body).toContain('name="TABL/DS" isSelected="false"');
  expect(request.body).toContain('indirectReferences="true"');
  expect(request.body).toContain('package:$TMP');
  expect(request.body).toContain('<payload>a&amp;b</payload>');
  expect(output).toMatchObject({ total: 1, scopeFiltering: 'server' });
});
it.each([undefined, 'UNADVERTISED'])(
  'does not silently narrow types for a package-only or unknown-type filter (%s)',
  async (objectType) => {
    await loadNativeUsages(createClient(), '/root', objectType, { packages: ['$TMP'] });
    expect(requests.find((r) => r.url.endsWith('/usageReferences'))!.body.match(/isSelected="true"/g)).toHaveLength(5);
  },
);
it('maps the result PROG/P alias to all three advertised program types', async () => {
  await loadNativeUsages(createClient(), '/root', 'PROG/P', {});
  const body = requests.find((r) => r.url.endsWith('/usageReferences'))!.body;
  for (const type of ['PROG/1P', 'PROG/1F', 'PROG/1T']) expect(body).toContain(`name="${type}" isSelected="true"`);
});
it('uses local package/type filters on systems without scope', async () => {
  setup({ hasScope: false });
  const output = JSON.parse((await navigate({ objectType: 'TABL/DS', packages: ['ZOTHER'] })).content[0]!.text!);
  expect(output).toMatchObject({ total: 1, scopeFiltering: 'client' });
  expect(requests.some((r) => r.url.includes('/scope?'))).toBe(false);
});
it.each(['positions', 'snippets'])(
  'expands typeless method nodes for %s, including 750 coordinates',
  async (detail) => {
    setup({ hasScope: false });
    const output = JSON.parse((await navigate({ detail, objectType: 'CLAS', packages: ['$TMP'] })).content[0]!.text!);
    expect(output.usageDetails).toMatchObject({
      identifiersAvailable: 1,
      identifiersExpanded: 1,
      shown: 1,
      truncated: false,
    });
    expect(output.usageDetails.usages[0]).toMatchObject({
      object: 'ZCL_OWNER',
      component: 'CALCULATE',
      line: 2,
      column: 10,
      matches: '10-30,accessRead,gradeDirect',
    });
    expect(output.usageDetails.usages[0].snippet).toBe(detail === 'snippets' ? 'result = root=>marker.' : undefined);
    expect(requests.find((r) => r.url.includes('/usageSnippets'))!.body).toContain('a&amp;b');
    expect(JSON.stringify(output)).not.toContain('objectIdentifier');
  },
);
it('reports nonexpandable entries and absent snippet capability without guessing source matches', async () => {
  setup({ hasSnippets: false });
  const output = JSON.parse((await navigate({ detail: 'snippets' })).content[0]!.text!);
  expect(output.usageDetails).toMatchObject({
    identifiersAvailable: 1,
    identifiersExpanded: 0,
    unexpandedEntries: 1,
    truncated: true,
  });
  expect(output.usageDetails.warning).toContain('does not advertise');
  expect(requests.some((r) => r.url.includes('usageSnippets'))).toBe(false);
});
it('enforces the 10-identifier and output caps, and truncates long snippet lines explicitly', async () => {
  const rows = Array.from({ length: 11 }, (_, i) => ({
    ...parseWhereUsedResponse(refs, true).results[1]!,
    uri: `/m${i}`,
    type: 'CLAS/OC',
    objectIdentifier: String(i),
  }));
  setup({ snippetXml: snippet('0', 3, 'x'.repeat(1100)) });
  const output = await expandUsageDetails(
    createClient(),
    rows,
    undefined,
    { detail: 'snippets' },
    2,
    true,
    Date.now() + 30000,
  );
  expect(output).toMatchObject({ identifiersAvailable: 11, identifiersExpanded: 10, shown: 2, truncated: true });
  expect(output.usages[0]).toMatchObject({ snippet: 'x'.repeat(1000), snippetTruncated: true });
  expect(requests.find((r) => r.url.includes('usageSnippets'))!.body.match(/optional="false"/g)).toHaveLength(10);
});
it('does not expose snippets for an identifier outside the selected set', async () => {
  setup({ snippetXml: snippet('unexpected') });
  const result = await navigate({ detail: 'snippets' });
  expect(result.isError).toBe(true);
  expect(result.content[0]!.text).toContain('unrequested');
});
it('handles cyclic parent links without looping or guessing the result type', async () => {
  const rows = parseWhereUsedResponse(refs, true).results;
  rows[0]!.type = '';
  rows[0]!.parentUri = '/method';
  const output = await expandUsageDetails(
    createClient(),
    rows,
    'CLAS',
    { detail: 'positions' },
    10,
    true,
    Date.now() + 30000,
  );
  expect(output.identifiersExpanded).toBe(0);
});
it.each([401, 403, 500])('propagates snippet HTTP %s without pretending that no usages exist', async (status) => {
  setup({ status });
  expect((await navigate({ detail: 'snippets' })).isError).toBe(true);
});
it('bounds the actual streamed snippet response', async () => {
  setup({ snippetXml: 'x'.repeat(2 * 1024 * 1024 + 1) });
  await expect(loadUsageSnippets(createClient(), ['id'], Date.now() + 30000)).rejects.toThrow(/limit/i);
});
it('does not send a snippet request after its deadline', async () => {
  await expect(loadUsageSnippets(createClient(), ['id'], Date.now() - 1)).rejects.toThrow();
  expect(requests).toHaveLength(0);
});
it.each([['Z*'], [], Array(21).fill('ZPKG'), ['ZPKG,OTHER'], ['Z&X']].map((packages) => ({ packages })))(
  'rejects invalid package filters %j',
  ({ packages }) => {
    expect(SAPNavigateSchema.safeParse({ action: 'references', packages }).success).toBe(false);
  },
);
it('normalizes exact packages and rejects detail arguments on unrelated actions', () => {
  expect(SAPNavigateSchema.parse({ action: 'references', packages: [' zpkg '] }).packages).toEqual(['ZPKG']);
  expect(SAPNavigateSchema.safeParse({ action: 'completion', detail: 'snippets' }).success).toBe(false);
});

it.each(['<html>Unexpected page</html>', ''])(
  'rejects malformed native responses instead of returning an empty inventory',
  async (referenceXml) => {
    setup({ referenceXml });
    expect((await navigate({ detail: 'positions' })).isError).toBe(true);
  },
);
it('keeps unsupported empty cursor searches native-only', async () => {
  setup({
    referenceXml: '<usageReferenceResult resultDescription="Unsupported position" referencedObjectIdentifier=""/>',
  });
  const client = createClient();
  const query = vi.spyOn(client, 'runQuery');
  const result = await handleToolCall(client, DEFAULT_CONFIG, 'SAPNavigate', {
    action: 'references',
    uri: '/sap/bc/adt/oo/interfaces/zif_root#start=1,0',
  });
  expect(JSON.parse(result.content[0]!.text!)).toMatchObject({ total: 0, searchedFor: 'Unsupported position' });
  expect(query).not.toHaveBeenCalled();
});
it.each([403, 404])('does not broaden a failed advertised scope request (%s)', async (status) => {
  const client = createClient();
  const original = client.http.post.bind(client.http);
  const { AdtApiError } = await import('../../../src/adt/errors.js');
  vi.spyOn(client.http, 'post').mockImplementation((...args) => {
    if (args[0].includes('/scope?')) throw new AdtApiError('scope failed', status, args[0]);
    return original(...args);
  });
  const result = await handleToolCall(client, DEFAULT_CONFIG, 'SAPNavigate', {
    action: 'references',
    type: 'CLAS',
    name: 'ZCL_ROOT',
    packages: ['$TMP'],
  });
  expect(result.isError).toBe(true);
  expect(requests.some((r) => r.url.endsWith('/usageReferences'))).toBe(false);
});

it.each(['impact', 'usages'])('preserves the unsupported-position explanation in SAPContext.%s', async (action) => {
  setup({
    referenceXml: '<usageReferenceResult resultDescription="Unsupported position" referencedObjectIdentifier=""/>',
  });
  const client = createClient();
  vi.spyOn(client, 'getDdls').mockResolvedValue({
    source: 'define view zi_root as select from t000 { key mandt }',
    statusCode: 200,
  });
  const result = await handleToolCall(client, DEFAULT_CONFIG, 'SAPContext', {
    action,
    type: 'DDLS',
    name: 'ZI_ROOT',
    siblingCheck: false,
  });
  expect(result.isError).toBeUndefined();
  expect(result.content[0]!.text).toContain('Unsupported position');
});
