import { describe, expect, it, vi } from 'vitest';
import { runScenarioWithClaudeCode, scoreArcCalls as scoreClaudeCalls } from '../../evals/providers/claude-code.js';
import { unsupportedCliScenario } from '../../evals/providers/cli-scenario-support.js';
import { runScenarioWithCursor, scoreArcCalls as scoreCursorCalls } from '../../evals/providers/cursor.js';
import type { EvalScenario } from '../../evals/types.js';

const spawn = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('CLI must not start');
  }),
);
vi.mock('node:child_process', () => ({ spawn }));
const scenario: EvalScenario = {
  id: 'cli-contract',
  description: 'Check contract support',
  category: 'stored-text',
  prompt: 'Read a text.',
  optimal: [{ tool: 'SAPRead', requiredArgs: { type: 'LONG_TEXT' } }],
};

describe('CLI eval contract support', () => {
  it.each([
    { expectedTrace: [] },
    { expectedTrace: [[{ tool: 'SAPRead' }]] },
    { finalAnswer: { required: [/answer/] } },
    { noFirstCall: true },
  ])('refuses unobservable contracts before starting either CLI: %j', async (expectation) => {
    for (const run of [runScenarioWithClaudeCode, runScenarioWithCursor]) {
      const score = await run({ ...scenario, ...expectation }, { passThreshold: 0.5 });
      expect(score).toMatchObject({ passed: false, toolCallCount: 0, overallScore: 0 });
      expect(score.explanation).toContain('UNSUPPORTED_SCENARIO');
    }
    expect(spawn).not.toHaveBeenCalled();
  });

  it('retains legacy first-call scenarios without unsupported assertions', () => {
    expect(unsupportedCliScenario(scenario, 'test')).toBeUndefined();
  });

  it.each([scoreClaudeCalls, scoreCursorCalls])('rejects a forbidden tool after a valid first call', (score) => {
    const result = score(
      [
        { name: 'SAPRead', arguments: { type: 'LONG_TEXT' } },
        { name: 'SAPWrite', arguments: { action: 'delete' } },
      ],
      { ...scenario, forbidden: ['SAPWrite'] },
    );
    expect(result).toMatchObject({ toolSelectionScore: 0, parameterScore: 0 });
    expect(result.explanation).toContain('forbidden ARC-1 tool in trace: SAPWrite');
  });
});
