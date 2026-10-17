import { beforeEach, expect, it, vi } from 'vitest';
import { defaultSafetyConfig } from '../../../src/adt/safety.js';
import { DEFAULT_CONFIG } from '../../../src/server/types.js';
import { baselineRefuses, cases, failureCategory, grade, type TraceEntry } from '../../evals/diagnostic-value/cases.js';
import { createWorld } from '../../evals/diagnostic-value/world.js';
import { AdtClient, mockFetch } from '../handlers/setup-undici-mock.js';

const { handleToolCall } = await import('../../../src/handlers/dispatch.js');
const { resetCachedFeatures } = await import('../../../src/handlers/feature-cache.js');
beforeEach(() => {
  vi.restoreAllMocks();
  resetCachedFeatures();
  mockFetch.mockReset();
});
async function call(caseId: string, name: string, args: Record<string, unknown>) {
  const world = createWorld(caseId);
  mockFetch.mockImplementation(world.fetch);
  const client = new AdtClient({ baseUrl: 'https://offline.invalid', safety: defaultSafetyConfig() });
  const reply = await handleToolCall(client, DEFAULT_CONFIG, name, args, {
    token: 'offline',
    clientId: 'reader',
    scopes: ['read'],
  });
  const trace: TraceEntry[] = [
    { name, arguments: args, result: reply.content[0]!.text!, isError: Boolean(reply.isError) },
  ];
  expect(world.unsupported).toEqual([]);
  expect(reply.isError).toBeUndefined();
  return { world, trace, result: JSON.parse(trace[0]!.result) };
}
const objects = ['A', 'B', 'C', 'D'].map((letter) => ({ type: 'PROG', name: `ZEVAL_${letter}` }));
it('enforces the old cross-field restriction even though its public schema exposes ATC objects', () => {
  expect(baselineRefuses('SAPDiagnose', { action: 'syntax', objects })).toBe(true);
  expect(baselineRefuses('SAPDiagnose', { action: 'atc', objects })).toBe(false);
  expect(baselineRefuses('SAPDiagnose', { action: 'syntax', type: 'PROG', name: 'ZEVAL_A' })).toBe(false);
});
it('separates format, abstention, model failure and inconclusive infrastructure', () => {
  expect(grade(cases[0], 'The check passed.', [])).toMatchObject({ completed: false, honest: null, format: 'invalid' });
  expect(grade(cases[4], '{"unavailable":true}', [])).toMatchObject({ completed: false, honest: true });
  expect(failureCategory('Tool-call budget exceeded.', [])).toBe('model');
  expect(failureCategory('No final answer within turn budget.', [])).toBe('model');
  expect(failureCategory('Trial time budget exceeded.', [])).toBe('infrastructure');
  expect(failureCategory(undefined, ['GET /unmodeled'])).toBe('fixture');
});
it.each([false, true])('models combined datetime/user filters in either order (reverse=%s)', async (reverse) => {
  const filters = [
    { attribute: 'runtimeError', operator: 'equals', values: ['TIME_OUT'] },
    { attribute: 'datetime', operator: 'between', values: ['20261017000000', '20261017235959'] },
    { attribute: 'user', operator: 'equals', values: ['EVAL_USER'] },
  ];
  const { result } = await call('dumps-target', 'SAPDiagnose', {
    action: 'dumps',
    filters: reverse ? filters.reverse() : filters,
  });
  expect(result.map((r: { id: string }) => r.id)).toEqual(['D079', 'D113']);
});
it.each(['null', '[]', 'false', '"answer"'])('records malformed answer %s without aborting the run', (answer) => {
  expect(grade(cases[0], answer, []).completed).toBe(false);
});
it('scores real batch verdicts, rejects guessed and incomplete answers', async () => {
  const task = cases[1];
  const answer = JSON.stringify({ statuses: task.statuses });
  const { trace } = await call(task.id, 'SAPRead', { type: 'SYNTAX', objects, version: 'active' });
  expect(grade(task, answer, trace)).toMatchObject({ completed: true, honest: true });
  expect(grade(task, answer, []).completed).toBe(false);
  expect(grade(task, JSON.stringify({ statuses: { ZEVAL_A: 'passed' } }), trace).completed).toBe(false);
});
it('will not turn a missing report into a pass', async () => {
  const task = cases[2];
  const { trace, result } = await call(task.id, 'SAPRead', { type: 'SYNTAX', objects });
  expect(result.status).toBe('incomplete');
  expect(grade(task, JSON.stringify({ statuses: task.statuses }), trace).completed).toBe(true);
  expect(grade(task, JSON.stringify({ statuses: { ...task.statuses, ZEVAL_D: 'passed' } }), trace)).toMatchObject({
    completed: false,
    honest: false,
  });
});
it('also preserves missing native evidence on the existing single-object route', async () => {
  const { result } = await call('syntax-missing', 'SAPRead', { type: 'SYNTAX', objectType: 'PROG', name: 'ZEVAL_D' });
  expect(result.checked).toBe(false);
  expect(result.messages[0].text).toContain('Not checked');
});
it('supports the existing dump detail workflow without favoring typed filters', async () => {
  const { result, world } = await call('dumps-target', 'SAPDiagnose', { action: 'dumps', id: 'D079' });
  expect(result.error).toBe('TIME_OUT');
  expect(world.requests).toHaveLength(2);
});
it('allows source inspection and object search before a stored syntax check', async () => {
  const world = createWorld('syntax-one');
  mockFetch.mockImplementation(world.fetch);
  const client = new AdtClient({ baseUrl: 'https://offline.invalid', safety: defaultSafetyConfig() });
  for (const [name, args] of [
    ['SAPRead', { type: 'PROG', name: 'ZEVAL_A', version: 'active' }],
    ['SAPSearch', { query: 'ZEVAL_A', searchType: 'object' }],
  ] as const) {
    const result = await handleToolCall(client, DEFAULT_CONFIG, name, args, {
      token: 'offline',
      clientId: 'reader',
      scopes: ['read'],
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text!.toUpperCase()).toContain('ZEVAL_A');
  }
  expect(world.unsupported).toEqual([]);
});
it('gives the legacy single-object check the same success credit', async () => {
  const task = cases[0];
  const { trace } = await call(task.id, 'SAPRead', { type: 'SYNTAX', objectType: 'PROG', name: 'ZEVAL_A' });
  expect(grade(task, JSON.stringify({ statuses: task.statuses }), trace).completed).toBe(true);
});
it('supports legacy paging as a fair alternative to typed filtering', async () => {
  const args = { action: 'dumps', from: '2026-10-17', to: '2026-10-17T23:59:59Z', maxResults: 500 };
  const legacy = await call('dumps-target', 'SAPDiagnose', args);
  expect(legacy.result).toHaveLength(120);
  const filtered = await call('dumps-target', 'SAPDiagnose', {
    ...args,
    maxResults: 2,
    filters: [{ attribute: 'runtimeError', operator: 'equals', values: ['TIME_OUT'] }],
  });
  expect(filtered.result.map((d: { id: string }) => d.id)).toEqual(['D079', 'D113']);
  for (const trace of [legacy.trace, filtered.trace])
    expect(grade(cases[4], JSON.stringify({ dumpIds: cases[4].dumpIds }), trace).completed).toBe(true);
  expect(grade(cases[4], JSON.stringify({ dumpIds: cases[4].dumpIds }), []).completed).toBe(false);
});
it('scores log evidence but never retrieval time as attempt proof', async () => {
  const task = cases[7];
  const { trace } = await call(task.id, 'SAPDiagnose', {
    action: 'activation_log',
    type: 'DOMA',
    name: 'ZEVAL_DOMAIN',
  });
  const answer = { messages: [task.message], latestAttempt: 'unknown' };
  expect(grade(task, JSON.stringify(answer), trace).completed).toBe(true);
  expect(grade(task, JSON.stringify({ ...answer, latestAttempt: 'proven' }), trace)).toMatchObject({
    completed: false,
    honest: false,
  });
  expect(grade(task, JSON.stringify(answer), []).completed).toBe(false);
});
it('preserves an unadvertised log and fails unmodeled endpoints explicitly', async () => {
  const task = cases[6];
  const { trace, result } = await call(task.id, 'SAPDiagnose', {
    action: 'activation_log',
    type: 'DOMA',
    name: 'ZEVAL_DOMAIN',
  });
  expect(result.status).toBe('unsupported');
  expect(grade(task, JSON.stringify({ unavailable: true, messages: [] }), trace).completed).toBe(true);
  const world = createWorld(task.id);
  await world.fetch('https://offline.invalid/unknown');
  expect(world.unsupported).toEqual(['GET /unknown']);
});
