/** Research only: compare review check scheduling without changing the production runner. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { defaultSafetyConfig } from '../../src/adt/safety.js';
import { textResult } from '../../src/handlers/shared.js';
import { DEFAULT_CONFIG } from '../../src/server/types.js';
import { callJson, type ToolInvoker } from '../../src/workflows/artifact.js';
import { mockResponse } from '../helpers/mock-fetch.js';
import { AdtClient, mockFetch } from '../unit/handlers/setup-undici-mock.js';
import { createWorld } from './diagnostic-value/world.js';

const { handleToolCall } = await import('../../src/handlers/dispatch.js');
const { collectTransportReview } = await import('../../src/workflows/transport-review.js');
const { resetCachedFeatures } = await import('../../src/handlers/feature-cache.js');
const identities = ['A', 'B', 'C', 'D'].map((suffix) => ({ type: 'PROG', name: `ZEVAL_${suffix}` }));
const part = {
  part: 'main',
  baselineStatus: 'prior-revision',
  selectionMethod: 'exact-transport',
  from: '00001',
  to: '00002',
  added: 1,
  removed: 1,
  diff: '-old\n+new',
  change: 'changed',
  statisticsComplete: true,
  sourceHashes: { before: 'a'.repeat(64), after: 'b'.repeat(64) },
  revisions: {
    before: { id: '00001', uri: '/v1', timestamp: '', author: '' },
    after: { id: '00002', uri: '/v2', timestamp: '', author: '' },
    skipped: [],
  },
};
const page = {
  schemaVersion: 1,
  resultFormat: 'structured',
  target: 'A4H/001',
  client: '001',
  transport: { id: 'A4HK900001', status: 'R' },
  reviewMode: 'released',
  inventoryFingerprint: 'hash',
  continuation: 'token',
  offset: 0,
  shown: 4,
  totalObjects: 4,
  objects: identities.map((identity) => ({ ...identity, taskIds: [], components: [], parts: [part] })),
};

type State = { sections: Array<{ section: string; active: { available: boolean; sha256?: string } }> };
type Check = { name: string; checked: boolean; hasErrors?: boolean };
// Same active-source reconciliation as the runner. This prototype deliberately uses the ordinary
// dispatcher; it does not establish a policy-safe hidden batching API or alter the public catalog.
async function batchPrototype(call: ToolInvoker) {
  await collectTransportReview(call, 'A4HK900001');
  const before = new Map<string, State>();
  for (const identity of identities)
    before.set(identity.name, (await callJson(call, 'SAPDiagnose', { action: 'object_state', ...identity })) as State);
  const batch = (await callJson(call, 'SAPDiagnose', { action: 'syntax', objects: identities, version: 'active' })) as {
    results: Check[];
    unexpectedReports: unknown[];
    unattributedMessages: unknown[];
  };
  const checks = [];
  for (const identity of identities) {
    const a = before.get(identity.name)!.sections;
    const b = ((await callJson(call, 'SAPDiagnose', { action: 'object_state', ...identity })) as State).sections;
    const result = batch.results.find((row) => row.name === identity.name);
    const status =
      JSON.stringify(a) !== JSON.stringify(b)
        ? 'stale'
        : !a.length ||
            !a.some((s) => s.active.available) ||
            a.some((s) => s.active.available && !s.active.sha256) ||
            batch.unexpectedReports.length ||
            batch.unattributedMessages.length
          ? 'incomplete'
          : !result?.checked
            ? 'not-run'
            : result.hasErrors
              ? 'failed'
              : 'passed';
    checks.push({ ...identity, status, historicalCorrelation: 'not established' });
  }
  return checks;
}

it('measures review batching while retaining drift and missing-report controls', async () => {
  const evidence = [];
  for (const scenario of ['stable', 'drift', 'missing'] as const) {
    for (const arm of ['current-runner', 'batch-prototype'] as const) {
      vi.restoreAllMocks();
      resetCachedFeatures();
      mockFetch.mockReset();
      const world = createWorld(scenario === 'missing' ? 'syntax-missing' : 'syntax-four');
      const activeReads = new Map<string, number>();
      const requests: Array<{ method: string; path: string; bytes: number }> = [];
      mockFetch.mockImplementation(async (url: string | URL, options?: RequestInit) => {
        const u = new URL(String(url));
        if (/\/source\/main$/.test(u.pathname)) {
          const active = u.searchParams.get('version') === 'active';
          const seen = (activeReads.get(u.pathname) ?? 0) + (active ? 1 : 0);
          activeReads.set(u.pathname, seen);
          const source =
            `REPORT ${u.pathname.split('/')[6]}.` +
            (/ZEVAL_B/i.test(u.pathname) ? ' WRITE totalx.' : " WRITE / 'Hello'.") +
            (scenario === 'drift' && active && seen > 1 && /ZEVAL_A/i.test(u.pathname) ? ' WRITE / 1.' : '');
          requests.push({ method: 'GET', path: u.pathname + u.search, bytes: Buffer.byteLength(source) });
          return mockResponse(200, source);
        }
        const response = await world.fetch(url, options);
        const request = world.requests.at(-1)!;
        requests.push({ method: request.method, path: request.path, bytes: Buffer.byteLength(request.response) });
        return response;
      });
      const client = new AdtClient({ baseUrl: 'https://offline.invalid', safety: defaultSafetyConfig() });
      const calls: Array<{ tool: string; action: unknown; bytes: number }> = [];
      const call: ToolInvoker = async (tool, args) => {
        const result =
          tool === 'SAPTransport'
            ? textResult(JSON.stringify(page))
            : await handleToolCall(client, { ...DEFAULT_CONFIG, systemType: 'onprem' }, tool, args, {
                token: 'offline',
                clientId: 'reader',
                scopes: ['read'],
              });
        calls.push({
          tool,
          action: args.action,
          bytes: Buffer.byteLength(result.content.map((c) => c.text ?? '').join('\n')),
        });
        return result;
      };
      const checks =
        arm === 'current-runner'
          ? (await collectTransportReview(call, 'A4HK900001', { syntax: true })).checks
          : await batchPrototype(call);
      expect(world.unsupported).toEqual([]);
      expect(checks.map((c) => c.status)).toEqual([
        scenario === 'drift' ? 'stale' : 'passed',
        'failed',
        'passed',
        scenario === 'missing' ? 'not-run' : 'passed',
      ]);
      expect(checks.every((c) => c.historicalCorrelation === 'not established')).toBe(true);
      expect(calls.filter((c) => c.action === 'object_state')).toHaveLength(8);
      expect(requests.filter((r) => r.path.includes('/source/main'))).toHaveLength(16);
      expect(calls).toHaveLength(arm === 'current-runner' ? 14 : 11);
      evidence.push({
        scenario,
        arm,
        statuses: checks.map((c) => c.status),
        calls,
        requests,
        checkPhaseCalls: calls.filter((c) => c.tool !== 'SAPTransport').length,
        checkPhaseResultBytes: calls.filter((c) => c.tool !== 'SAPTransport').reduce((n, c) => n + c.bytes, 0),
        backendCalls: requests.length,
        backendResponseBytes: requests.reduce((n, r) => n + r.bytes, 0),
      });
    }
  }
  mkdirSync('test-results/diagnostic-value/review-spike', { recursive: true });
  writeFileSync(
    'test-results/diagnostic-value/review-spike/result.json',
    JSON.stringify(
      {
        scope:
          'Synthetic four-program check phase. Transport pages are fixed; all diagnostic calls use real dispatch and parsers. No SAP timing claim.',
        evidence,
      },
      null,
      2,
    ),
  );
});
