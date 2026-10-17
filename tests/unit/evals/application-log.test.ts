import { describe, expect, it, vi } from 'vitest';
import { SAPQuerySchema } from '../../../src/handlers/query-input.js';
import { runScenario, scoreScenarioTrace } from '../../evals/harness.js';
import { SCENARIOS } from '../../evals/scenarios/application-log.js';
import { SCENARIO_FILES } from '../../evals/scenarios/index.js';
import type { LLMProvider, LLMResponse, LLMToolCall } from '../../evals/types.js';

const answers = [
  'Invoice validation failed.',
  'Please provide the exact log number.',
  'HTTP 403: authorization denied. S_APPL_LOG permission is required.',
  'Validation started; Invoice validation failed.',
  'Payment within 30 days.',
];
// Scripted providers check deterministic contracts only; these are not actual model scores.
describe('application-log eval contracts', () => {
  it('registers only synthetic scenarios and validates every expected query payload', () => {
    expect(SCENARIO_FILES['application-log']).toBe(SCENARIOS);
    for (const scenario of SCENARIOS) {
      expect(scenario.mockOnly).toBe(true);
      for (const turn of scenario.expectedTrace ?? [scenario.optimal]) {
        for (const call of turn) {
          expect(SAPQuerySchema.safeParse({ ...call.requiredArgs, ...call.exactArgs }).success).toBe(true);
        }
      }
    }
  });
  it.each(SCENARIOS.map((scenario, index) => ({ scenario, answer: answers[index]! })))(
    'replays $scenario.id without a model or SAP',
    async ({ scenario, answer }) => {
      const turns = scenario.expectedTrace ?? [scenario.optimal];
      const responses: LLMResponse[] = turns
        .filter((turn) => turn.length > 0)
        .map((turn) => ({
          done: false,
          toolCalls: turn.map((call) => ({ name: call.tool, arguments: { ...call.requiredArgs, ...call.exactArgs } })),
        }));
      responses.push({ done: true, content: answer });
      const chat = vi.fn();
      for (const response of responses) chat.mockResolvedValueOnce(response);
      const provider: LLMProvider = { name: 'scripted-contract', model: 'no-model', chat };
      expect((await runScenario(provider, scenario, [])).passed).toBe(true);
    },
  );
  it('rejects SQL fallback after denial and guessed continuation offsets', () => {
    const denied = SCENARIOS.find((scenario) => scenario.id === 'application-log-authorization-no-fallback')!;
    const first: LLMToolCall = {
      name: 'SAPQuery',
      arguments: { ...denied.optimal[0].requiredArgs, ...denied.optimal[0].exactArgs },
    };
    const sql = { name: 'SAPQuery', arguments: { sql: 'SELECT * FROM balhdr' } };
    expect(scoreScenarioTrace([first, sql], [[first], [sql]], denied).tracePassed).toBe(false);
    const paging = SCENARIOS.find((scenario) => scenario.id === 'application-log-next-offset')!;
    const page1 = paging.expectedTrace![0][0];
    const page2 = paging.expectedTrace![1][0];
    const calls = [page1, page2].map((call) => ({
      name: call.tool,
      arguments: { ...call.requiredArgs, ...call.exactArgs },
    }));
    calls[1].arguments.applicationLog = { logNumber: '00000000000000000001', maxRows: 1, offset: 2 };
    expect(
      scoreScenarioTrace(
        calls,
        calls.map((call) => [call]),
        paging,
      ).tracePassed,
    ).toBe(false);
  });
});
