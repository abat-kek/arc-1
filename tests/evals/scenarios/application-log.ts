/** Synthetic tool-selection contracts; no SAP connection or model score is implied. */
import type { EvalScenario, ExpectedToolCall } from '../types.js';
import { storedTextFixtureExecutor } from './stored-text.js';

const logNumber = '00000000000000000001';
function readCall(offset?: number): ExpectedToolCall {
  return {
    tool: 'SAPQuery',
    requiredArgs: { action: 'application_log' },
    absentArgPaths: [['sql'], ['maxRows'], ['longText']],
    exactArgs: { applicationLog: { logNumber, ...(offset === undefined ? {} : { maxRows: 1, offset }) } },
  };
}
const denied = JSON.stringify({ error: 'HTTP 403: S_APPL_LOG authorization denied. No fallback is available.' });
const base = { status: 'ok', logNumber, snapshotGuaranteed: false };
const scenarios: Omit<EvalScenario, 'category'>[] = [
  {
    id: 'application-log-exact-number',
    description: 'Read saved SLG1 messages using the exact supplied log number.',
    prompt: `Read saved SLG1 application log ${logNumber} and summarize its messages.`,
    optimal: [readCall()],
    expectedTrace: [[readCall()]],
    mockResponses: {
      SAPQuery: JSON.stringify({ ...base, messages: [{ text: 'Invoice validation failed', type: 'E' }], more: false }),
    },
    finalAnswer: { required: [/Invoice validation failed/i], requireNonEmpty: true },
  },
  {
    id: 'application-log-ask-for-number',
    description: 'Ask for the exact log number instead of inventing a key or using SQL discovery.',
    prompt: 'Show the SLG1 application log for my failed invoice. I do not have its log number.',
    optimal: [],
    noFirstCall: true,
    expectedTrace: [],
    finalAnswer: { required: [/log number|logNumber/i, /provide|share|which|please/i], requireNonEmpty: true },
  },
  {
    id: 'application-log-authorization-no-fallback',
    description: 'Preserve native authorization denial without querying storage or executing helpers.',
    prompt: `Read SLG1 log ${logNumber}. If access fails, explain what is needed.`,
    optimal: [readCall()],
    expectedTrace: [[readCall()]],
    mockResponses: { SAPQuery: denied },
    finalAnswer: {
      required: [/403|denied|authorization/i, /permission|S_APPL_LOG|authorization/i],
      forbidden: [/retrieved|messages show/i],
      requireNonEmpty: true,
    },
  },
  {
    id: 'application-log-next-offset',
    description: 'Continue the exact log using the returned nextOffset and preserve page size.',
    prompt: `Read two pages of SLG1 log ${logNumber}, one message per page, then summarize both messages.`,
    optimal: [readCall(0)],
    expectedTrace: [[readCall(0)], [readCall(1)]],
    maxToolCalls: 3,
    mockToolExecutor: async (tool, args) => {
      if (tool !== 'SAPQuery' || args.action !== 'application_log') return denied;
      const offset = (args.applicationLog as { offset?: number } | undefined)?.offset ?? 0;
      return JSON.stringify({
        ...base,
        offset,
        messages: [{ text: offset === 0 ? 'Validation started' : 'Invoice validation failed' }],
        more: offset === 0,
        ...(offset === 0 ? { nextOffset: 1 } : {}),
      });
    },
    finalAnswer: { required: [/Validation started/i, /Invoice validation failed/i], requireNonEmpty: true },
  },
  {
    id: 'application-log-so10-distinction',
    description: 'A saved SO10 standard text uses long_text rather than the application log action.',
    prompt:
      'Read the SO10 standard text TEXT/Z_PAYMENT_NOTICE/ST/E. This is a stored text, not an SLG1 application log.',
    optimal: [
      {
        tool: 'SAPQuery',
        requiredArgs: { action: 'long_text' },
        exactArgs: {
          longText: { mode: 'read', keys: [{ object: 'TEXT', name: 'Z_PAYMENT_NOTICE', id: 'ST', language: 'E' }] },
        },
      },
    ],
    mockToolExecutor: storedTextFixtureExecutor,
    finalAnswer: { required: [/Payment within 30 days/i], requireNonEmpty: true },
  },
];
export const SCENARIOS: EvalScenario[] = scenarios.map((scenario) => ({
  category: 'application-log',
  tags: ['application-log', 'tool-selection'],
  forbidden: ['SAPWrite', 'SAPActivate', 'SAPManage'],
  requireFullParameters: true,
  maxToolCalls: 2,
  ...scenario,
  expectedTrace: scenario.expectedTrace ?? [scenario.optimal],
  mockOnly: true,
}));
