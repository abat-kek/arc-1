import { describe, expect, it, vi } from 'vitest';
import { AdtClient } from '../../../src/adt/client.js';
import { defaultSafetyConfig, unrestrictedSafetyConfig } from '../../../src/adt/safety.js';
import { handleToolCall } from '../../../src/handlers/dispatch.js';
import { explainPolicy } from '../../../src/handlers/policy-explanation.js';
import { SAPDiagnoseSchema } from '../../../src/handlers/schemas.js';
import { DEFAULT_CONFIG } from '../../../src/server/types.js';

const auth = { token: 'test', clientId: 'test', scopes: ['read'] };
const parse = (result: Awaited<ReturnType<typeof explainPolicy>>) => JSON.parse(result.content[0]!.text);
describe('current caller policy explanations', () => {
  it('reports scope denial without revealing later gates or trying a mutation', async () => {
    const client = new AdtClient({ safety: defaultSafetyConfig() });
    const post = vi.spyOn(client.http, 'post');
    const put = vi.spyOn(client.http, 'put');
    const result = parse(
      await explainPolicy(
        client,
        DEFAULT_CONFIG,
        { proposedTool: 'SAPWrite', proposedArgs: { action: 'delete', type: 'PROG', name: 'ZEXISTING' } },
        auth,
      ),
    );
    expect(result).toMatchObject({
      decision: 'denied',
      checks: { scope: { status: 'denied' } },
    });
    expect(post).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
  it('uses canonical type normalization and the SQL/data gate', async () => {
    const result = parse(
      await explainPolicy(
        new AdtClient({ safety: defaultSafetyConfig() }),
        DEFAULT_CONFIG,
        { proposedTool: 'SAPRead', proposedArgs: { type: 'table_contents', name: 'T000' } },
        auth,
      ),
    );
    expect(result.decision).toBe('denied');
    expect(result.checks.scope.status).toBe('denied');
  });
  it('applies deny patterns and does not imply SAP authorization from an allowed read', async () => {
    const client = new AdtClient();
    const input = { proposedTool: 'SAPRead', proposedArgs: { type: 'PROG', name: 'ZREPORT' } };
    expect(
      parse(await explainPolicy(client, { ...DEFAULT_CONFIG, denyActions: ['SAPRead.PROG'] }, input, auth)).decision,
    ).toBe('denied');
    const allowed = parse(await explainPolicy(client, DEFAULT_CONFIG, input, auth));
    expect(allowed.decision).toBe('allowed');
    expect(allowed.sapAuthorization).toContain('not verified');
  });
  it('resolves actual package and retains action-specific uncertainty', async () => {
    const client = new AdtClient({ safety: { ...unrestrictedSafetyConfig(), allowedPackages: ['ZGOOD'] } });
    vi.spyOn(client, 'resolveObjectPackage').mockResolvedValue('ZBAD');
    const result = parse(
      await explainPolicy(
        client,
        { ...DEFAULT_CONFIG, allowWrites: true },
        { proposedTool: 'SAPWrite', proposedArgs: { action: 'delete', type: 'PROG', name: 'ZREPORT' } },
        { ...auth, scopes: ['write'] },
      ),
    );
    expect(result.decision).toBe('denied');
    expect(result.checks.package).toMatchObject({ status: 'denied' });
  });
  it('keeps the multi-target mutation ceiling even for admin', async () => {
    const result = parse(
      await explainPolicy(
        new AdtClient({ safety: unrestrictedSafetyConfig() }),
        { ...DEFAULT_CONFIG, targetId: 'A4H/001', multiTargetEndpoints: true },
        { proposedTool: 'SAPActivate', proposedArgs: { type: 'PROG', name: 'ZREPORT' } },
        { ...auth, scopes: ['admin'] },
      ),
    );
    expect(result.checks.targetCeiling.status).toBe('denied');
  });
});

describe('policy explanation regression spike', () => {
  const proposal = { proposedTool: 'SAPWrite', proposedArgs: { action: 'delete', type: 'PROG', name: 'ZREPORT' } };
  const writer = { ...auth, scopes: ['write'] };
  it('separates the configured ceiling from narrowed effective caller safety', async () => {
    const result = parse(
      await explainPolicy(
        new AdtClient({ safety: defaultSafetyConfig() }),
        { ...DEFAULT_CONFIG, allowWrites: true },
        proposal,
        writer,
      ),
    );
    expect(result.checks.serverCeiling.status).toBe('allowed');
    expect(result.checks.effectiveSafety.status).toBe('denied');
    expect(result.decision).toBe('denied');
  });
  it('does not traverse a package hierarchy just to explain a proposal', async () => {
    const client = new AdtClient({ safety: { ...unrestrictedSafetyConfig(), allowedPackages: ['ZROOT/**'] } });
    vi.spyOn(client, 'resolveObjectPackage').mockResolvedValue('ZCHILD');
    const hierarchy = vi
      .spyOn(client, 'getPackageHierarchyResolver')
      .mockReturnValue({ isDescendantOrSelf: vi.fn().mockResolvedValue(false), invalidate: vi.fn() });
    const result = parse(await explainPolicy(client, { ...DEFAULT_CONFIG, allowWrites: true }, proposal, writer));
    expect(result.checks.package.status).toBe('unresolved');
    expect(hierarchy).not.toHaveBeenCalled();
  });
  it('does not fetch object metadata when there is no package restriction', async () => {
    const client = new AdtClient({ safety: unrestrictedSafetyConfig() });
    const metadata = vi.spyOn(client, 'resolveObjectPackage').mockResolvedValue('ZANY');
    const result = parse(
      await explainPolicy(client, { ...DEFAULT_CONFIG, allowWrites: true, allowedPackages: [] }, proposal, writer),
    );
    expect(result.checks.package.status).toBe('not-applicable');
    expect(metadata).not.toHaveBeenCalled();
  });
  it('bounds a proposed argument payload before any metadata read', async () => {
    const client = new AdtClient({ safety: unrestrictedSafetyConfig() });
    const metadata = vi.spyOn(client, 'resolveObjectPackage').mockResolvedValue('ZANY');
    const result = await explainPolicy(
      client,
      { ...DEFAULT_CONFIG, allowWrites: true },
      {
        proposedTool: 'SAPWrite',
        proposedArgs: { action: 'update', type: 'PROG', name: 'ZREPORT', source: 'x'.repeat(65537) },
      },
      writer,
    );
    expect(result.isError).toBe(true);
    expect(metadata).not.toHaveBeenCalled();
  });
});

describe('dispatcher and uncertainty boundaries', () => {
  it.each([
    ['SAPRead', { type: 'table_contents', name: 'T000' }, ['read']],
    ['SAPRead', { type: 'tabl/dt', name: 'ZANY' }, ['read']],
    ['SAPSearch', { searchType: 'tadir_lookup', source: 'db', query: 'Z*' }, ['read']],
    ['SAPWrite', { action: 'delete', type: 'PROG', name: 'ZANY' }, ['read']],
  ] as const)('matches dispatch scope/deny for %s', async (tool, args, scopes) => {
    const config = { ...DEFAULT_CONFIG, denyActions: ['SAPRead.TABL'] };
    const client = new AdtClient({ safety: defaultSafetyConfig() });
    const caller = { ...auth, scopes: [...scopes] };
    const metadata = vi.spyOn(client, 'resolveObjectPackage');
    const result = parse(await explainPolicy(client, config, { proposedTool: tool, proposedArgs: args }, caller));
    const actual = await handleToolCall(client, config, tool, args, caller);
    expect(result.decision).toBe('denied');
    expect(actual.isError).toBe(true);
    expect(actual.content[0]!.text).toMatch(/Insufficient scope|denied by server policy/);
    expect(metadata).not.toHaveBeenCalled();
  });
  it('dispatches the explanation with the real caller and enforces its own deny/scope gates', async () => {
    const client = new AdtClient({ safety: defaultSafetyConfig() });
    const args = {
      action: 'explain_policy',
      proposedTool: 'SAPWrite',
      proposedArgs: { action: 'delete', type: 'PROG', name: 'ZANY' },
    };
    const result = parse(await handleToolCall(client, DEFAULT_CONFIG, 'SAPDiagnose', args, auth));
    expect(result.checks.scope.status).toBe('denied');
    for (const [config, caller] of [
      [DEFAULT_CONFIG, { ...auth, scopes: [] }],
      [{ ...DEFAULT_CONFIG, denyActions: ['SAPDiagnose.explain_policy'] }, auth],
    ] satisfies Array<[typeof DEFAULT_CONFIG, typeof auth]>) {
      expect((await handleToolCall(client, config, 'SAPDiagnose', args, caller)).isError).toBe(true);
    }
  });
  it('does not fetch metadata or expose grants when selected-target authorization denies', async () => {
    const client = new AdtClient({ safety: unrestrictedSafetyConfig() });
    const metadata = vi.spyOn(client, 'resolveObjectPackage');
    const caller = {
      ...auth,
      scopes: ['admin'],
      extra: {
        xsuaaUserAttributes: { arc1_targets: ['SECRET/001'] },
        xsuaaUserAttributeStatus: { arc1_targets: 'valid' },
      },
    };
    const result = parse(
      await explainPolicy(
        client,
        {
          ...DEFAULT_CONFIG,
          targetId: 'A4H/001',
          multiTargetEndpoints: true,
          multiTargetAuthorization: 'xsuaa-attribute',
        },
        { proposedTool: 'SAPWrite', proposedArgs: { action: 'delete', type: 'PROG', name: 'ZANY' } },
        caller,
      ),
    );
    expect(result.checks.targetGrant.status).toBe('denied');
    expect(result.checks.targetCeiling.status).toBe('denied');
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(metadata).not.toHaveBeenCalled();
  });
  it.each(['', new Error('PRIVATE_BACKEND_BODY')])(
    'keeps absent or failed package evidence unresolved',
    async (outcome) => {
      const client = new AdtClient({ safety: { ...unrestrictedSafetyConfig(), allowedPackages: ['ZGOOD'] } });
      const metadata = vi.spyOn(client, 'resolveObjectPackage');
      if (outcome instanceof Error) metadata.mockRejectedValue(outcome);
      else metadata.mockResolvedValue(outcome);
      const result = parse(
        await explainPolicy(
          client,
          { ...DEFAULT_CONFIG, allowWrites: true },
          {
            proposedTool: 'SAPWrite',
            proposedArgs: { action: 'delete', type: 'PROG', name: 'ZANY', package: 'ZGOOD' },
          },
          { ...auth, scopes: ['write'] },
        ),
      );
      expect(result.checks.package.status).toBe('unresolved');
      expect(result.decision).toBe('unresolved');
      expect(JSON.stringify(result)).not.toContain('PRIVATE_BACKEND_BODY');
    },
  );
  it('keeps creation and SQL lineage unresolved and rejects unknown actions through the execution schema', async () => {
    const client = new AdtClient({ safety: unrestrictedSafetyConfig() });
    const metadata = vi.spyOn(client, 'resolveObjectPackage');
    const config = { ...DEFAULT_CONFIG, allowWrites: true, allowFreeSQL: true };
    const caller = { ...auth, scopes: ['admin'] };
    for (const [tool, proposedArgs] of [
      ['SAPWrite', { action: 'create', type: 'PROG', name: 'ZNEW', package: '$TMP', source: 'REPORT znew.' }],
      ['SAPQuery', { sql: 'SELECT * FROM T000' }],
      ['SAPRead', { type: 'UNKNOWN', name: 'ZANY' }],
    ] as const)
      expect(parse(await explainPolicy(client, config, { proposedTool: tool, proposedArgs }, caller)).decision).toBe(
        'unresolved',
      );
    expect(metadata).not.toHaveBeenCalled();
  });
  it('retains transport allowlist and Git mutation gates without publishing allowlists', async () => {
    const safety = { ...unrestrictedSafetyConfig(), allowGitWrites: false, allowedTransports: ['SECRET_REQUEST'] };
    const client = new AdtClient({ safety });
    const config = { ...DEFAULT_CONFIG, ...safety };
    for (const [tool, proposedArgs] of [
      ['SAPTransport', { action: 'get', id: 'A4HK900001' }],
      ['SAPGit', { action: 'push', repoId: 'ZREPO' }],
    ] as const) {
      const result = parse(
        await explainPolicy(client, config, { proposedTool: tool, proposedArgs }, { ...auth, scopes: ['admin'] }),
      );
      expect(result.decision).toBe('denied');
      expect(JSON.stringify(result)).not.toContain('SECRET_REQUEST');
    }
  });
  it.each([
    { action: 'explain_policy' },
    { action: 'syntax', proposedTool: 'SAPRead', proposedArgs: {} },
    { action: 'explain_policy', proposedTool: 'SAPRead', proposedArgs: {}, user: 'OTHER_USER' },
  ])('rejects incomplete or irrelevant explanation inputs', (input) => {
    expect(SAPDiagnoseSchema.safeParse(input).success).toBe(false);
  });
});

describe('independent review regressions', () => {
  it.each([
    ['SAPRead', { type: 'SOBJ', name: 'BUS2032' }],
    ['SAPNavigate', { action: 'hierarchy', name: 'ZCL_DEMO' }],
  ] as const)('matches handler-level data refusal for %s', async (tool, args) => {
    const client = new AdtClient({ safety: defaultSafetyConfig() });
    const get = vi.spyOn(client.http, 'get');
    const post = vi.spyOn(client.http, 'post');
    const explained = parse(
      await explainPolicy(client, DEFAULT_CONFIG, { proposedTool: tool, proposedArgs: args }, auth),
    );
    const executed = await handleToolCall(client, DEFAULT_CONFIG, tool, args, auth);
    expect(executed.isError).toBe(true);
    expect(explained.decision).toBe('denied');
    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
  it.each(['SAPRead', 'SAP'])('includes hyperfocused delegator denial for %s proposals', async (tool) => {
    const client = new AdtClient({ safety: defaultSafetyConfig() });
    const config = { ...DEFAULT_CONFIG, toolMode: 'hyperfocused' as const, denyActions: ['SAP.read'] };
    const proposedArgs =
      tool === 'SAP' ? { action: 'read', type: 'PROG', name: 'ZREPORT' } : { type: 'PROG', name: 'ZREPORT' };
    const result = await handleToolCall(
      client,
      config,
      'SAP',
      { action: 'diagnose', params: { action: 'explain_policy', proposedTool: tool, proposedArgs } },
      auth,
    );
    expect(result.isError).toBeUndefined();
    expect(parse(result).decision).toBe('denied');
  });
  it('does not disclose later gates to an under-scoped caller', async () => {
    const client = new AdtClient({ safety: unrestrictedSafetyConfig() });
    const metadata = vi.spyOn(client, 'resolveObjectPackage');
    const result = parse(
      await explainPolicy(
        client,
        { ...DEFAULT_CONFIG, allowWrites: true, denyActions: ['SAPWrite.delete'] },
        { proposedTool: 'SAPWrite', proposedArgs: { action: 'delete', type: 'PROG', name: 'ZREPORT' } },
        auth,
      ),
    );
    expect(result.decision).toBe('denied');
    expect(result.checks).toEqual({ scope: { status: 'denied', note: 'Requires write.' } });
    expect(metadata).not.toHaveBeenCalled();
  });
  it.each([{ allowFreeSQL: true }, { allowDataPreview: true }])(
    'leaves allowed hierarchy lineage unresolved for %j',
    async (flags) => {
      const client = new AdtClient({ safety: { ...defaultSafetyConfig(), ...flags } });
      const result = parse(
        await explainPolicy(
          client,
          { ...DEFAULT_CONFIG, ...flags },
          { proposedTool: 'SAPNavigate', proposedArgs: { action: 'hierarchy', name: 'ZCL_DEMO' } },
          auth,
        ),
      );
      expect(result.decision).toBe('unresolved');
      expect(result.checks.dataSources.status).toBe('unresolved');
    },
  );
});
