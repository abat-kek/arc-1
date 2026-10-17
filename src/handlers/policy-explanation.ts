import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { AdtClient } from '../adt/client.js';
import {
  checkGit,
  checkOperation,
  checkTransport,
  decidePackageAllowed,
  isOperationAllowed,
  OperationType,
} from '../adt/safety.js';
import { getActionPolicy, hasRequiredScope, invocationPolicyKey } from '../authz/policy.js';
import { isActionDenied } from '../server/deny-actions.js';
import { isTargetGranted, parseTargetGrant } from '../server/multi-target-authorization.js';
import { multiTargetInvocationDecision } from '../server/multi-target-tools.js';
import type { ServerConfig } from '../server/types.js';
import { getCachedFeatures } from './feature-cache.js';
import { expandHyperfocusedArgs, resolveHyperfocusedAction } from './hyperfocused.js';
import { normalizeTypeArgsForValidation, objectUrlForType } from './object-types.js';
import { getToolSchema } from './schemas.js';
import { errorResult, textResult, toolJson } from './shared.js';

type Status = 'allowed' | 'denied' | 'unresolved' | 'not-applicable';
/** Current caller only. Reuses enforcement evaluators; never invokes the proposed operation. */
export async function explainPolicy(
  client: AdtClient,
  config: ServerConfig,
  input: Record<string, unknown>,
  auth?: AuthInfo,
) {
  let tool = String(input.proposedTool ?? '');
  let raw = input.proposedArgs as Record<string, unknown> | undefined;
  if (!raw || Buffer.byteLength(JSON.stringify(raw)) > 64 * 1024)
    return errorResult('Propose arguments within the 64-KiB limit.');
  let delegator: string | undefined;
  if (tool === 'SAP') {
    const proposed = getToolSchema('SAP', config.systemType === 'btp')?.safeParse(
      normalizeTypeArgsForValidation('SAP', raw),
    );
    if (!proposed?.success) return errorResult('Invalid hyperfocused proposal fields.');
    const expanded = expandHyperfocusedArgs(proposed.data as Record<string, unknown>);
    if ('error' in expanded) return errorResult('Unknown hyperfocused operation.');
    delegator = String(raw.action);
    tool = expanded.toolName;
    raw = expanded.expandedArgs;
  } else if (config.toolMode === 'hyperfocused') delegator = resolveHyperfocusedAction(tool);
  const schema = getToolSchema(tool, config.systemType === 'btp');
  if (!schema) return errorResult('Propose one built-in tool and its arguments.');
  const normalized = normalizeTypeArgsForValidation(tool, raw);
  const validated = schema.safeParse(normalized);
  const args = validated.success ? (validated.data as Record<string, unknown>) : normalized;
  const action = invocationPolicyKey(tool, normalized);
  const policy = getActionPolicy(tool, action);
  if (!policy) return errorResult('Unknown proposed operation.');
  const checks: Record<string, { status: Status; note?: string }> = {};
  const requiredScope =
    delegator && auth && !hasRequiredScope(auth.scopes, getActionPolicy('SAP', delegator)!.scope)
      ? getActionPolicy('SAP', delegator)!.scope
      : policy.scope;
  checks.scope = {
    status: auth ? (hasRequiredScope(auth.scopes, requiredScope) ? 'allowed' : 'denied') : 'not-applicable',
    note: auth ? `Requires ${requiredScope}.` : 'Local/direct caller: no inbound scope gate.',
  };
  // Match dispatch's disclosure order: lacking scope reveals no later policy or metadata checks.
  if (checks.scope.status === 'denied') return report();
  checks.arguments = {
    status: validated.success ? 'allowed' : 'unresolved',
    note: validated.success
      ? 'Arguments pass the execution schema.'
      : `Invalid proposed fields: ${[...new Set(validated.error.issues.map((issue) => (issue.code === 'unrecognized_keys' ? issue.keys.join(', ') : issue.path.join('.') || '(proposal)')))].slice(0, 6).join(', ')}.`,
  };
  if (delegator)
    checks.delegatorDenyRule = {
      status: isActionDenied('SAP', delegator, config.denyActions ?? []) ? 'denied' : 'allowed',
    };
  checks.denyRule = { status: isActionDenied(tool, action, config.denyActions ?? []) ? 'denied' : 'allowed' };
  checks.targetGrant = {
    status: !config.targetId
      ? 'not-applicable'
      : config.multiTargetAuthorization !== 'xsuaa-attribute' ||
          isTargetGranted(parseTargetGrant(auth), config.targetId)
        ? 'allowed'
        : 'denied',
  };
  checks.targetCeiling = {
    status: !config.targetId
      ? 'not-applicable'
      : multiTargetInvocationDecision(tool, args, config) === 'allowed'
        ? 'allowed'
        : 'denied',
  };
  const mutation = [
    OperationType.Create,
    OperationType.Update,
    OperationType.Delete,
    OperationType.Activate,
    OperationType.Workflow,
    OperationType.Transport,
  ].some((op) => op === policy.opType);
  function safetyCheck(safety: typeof client.safety): { status: Status; note?: string } {
    try {
      checkOperation(safety, policy!.opType, 'Proposed operation');
    } catch (error) {
      // This evaluator reports only the operation and blocking flag, never an allowlist or SAP body.
      return { status: 'denied', note: error instanceof Error ? error.message : 'Operation safety gate denied.' };
    }
    try {
      if (tool === 'SAPTransport')
        checkTransport(safety, String(args.id ?? ''), 'Proposed transport operation', mutation);
      if (tool === 'SAPGit') checkGit(safety, 'Proposed Git operation', mutation);
      return { status: 'allowed' };
    } catch {
      return {
        status: 'denied',
        note:
          tool === 'SAPTransport'
            ? 'The transport ID or transport-write gates deny this operation.'
            : 'Git mutations require both allowWrites and allowGitWrites.',
      };
    }
  }
  checks.serverCeiling = safetyCheck(config);
  checks.effectiveSafety = safetyCheck(client.safety);
  // Mandatory handler-level data reads that are intentionally read-scoped in ACTION_POLICY.
  // Keep aligned with SAPRead SOBJ and SAPNavigate hierarchy; optional enrichments do not block reads.
  const dataOps =
    tool === 'SAPRead' && args.type === 'SOBJ'
      ? [OperationType.FreeSQL]
      : tool === 'SAPNavigate' && args.action === 'hierarchy'
        ? [OperationType.FreeSQL, OperationType.Query]
        : [];
  if (dataOps.length)
    checks.handlerData = {
      status:
        dataOps.some((op) => isOperationAllowed(config, op)) &&
        dataOps.some((op) => isOperationAllowed(client.safety, op))
          ? 'allowed'
          : 'denied',
      note: dataOps.length === 1 ? 'This read requires free SQL.' : 'This read requires free SQL or data preview.',
    };
  const features = getCachedFeatures(config.targetId ?? config.destinationName);
  const gate = policy.featureGate;
  const feature =
    gate === 'git' ? undefined : gate === 'ui5-repo' ? features?.ui5repo : gate ? features?.[gate] : undefined;
  checks.feature = {
    status: !gate ? 'not-applicable' : !feature ? 'unresolved' : feature.available ? 'allowed' : 'unresolved',
    note: gate
      ? 'Capability evidence is not SAP authorization; operation-specific discovery still runs at execution.'
      : undefined,
  };
  checks.package = {
    status: !mutation || client.safety.allowedPackages.length === 0 ? 'not-applicable' : 'unresolved',
  };
  if (
    checks.package.status === 'unresolved' &&
    validated.success &&
    !Object.values(checks).some((c) => c.status === 'denied') &&
    tool === 'SAPWrite' &&
    args.name &&
    ['update', 'delete'].includes(String(args.action)) &&
    ['PROG', 'CLAS', 'INTF', 'DDLS', 'DOMA', 'DTEL', 'TABL', 'TTYP'].includes(String(args.type)) &&
    !args.group &&
    !args.include &&
    !args.objectUrl
  ) {
    // Match simple existing-object ownership only. Creation and contained objects stay unresolved.
    try {
      const url = objectUrlForType(String(args.type), String(args.name).toUpperCase());
      const pkg = await client.resolveObjectPackage(url);
      if (pkg) {
        const decision = decidePackageAllowed(client.safety, pkg);
        checks.package = {
          status: decision === 'needs-hierarchy' ? 'unresolved' : decision,
          note:
            decision === 'needs-hierarchy'
              ? 'The real object package needs DEVCLASS hierarchy verification at execution.'
              : `Resolved object package ${pkg}.`,
        };
      } else checks.package.note = 'No actual package was returned; execution remains fail-closed.';
    } catch {
      checks.package.note = 'Actual package could not be resolved; execution remains fail-closed.';
    }
  }
  if (dataOps.length || policy.opType === OperationType.FreeSQL || policy.opType === OperationType.Query) {
    checks.dataSources = {
      status: 'unresolved',
      note: 'SQL validation and live lineage authorization run on execution; data gates remain enforced.',
    };
  }
  if (mutation)
    checks.operationPrerequisites = {
      status: 'unresolved',
      note: 'Action-specific ownership, transport, discovery and state checks remain execution-time requirements.',
    };
  return report();
  function report() {
    const statuses = Object.values(checks).map((c) => c.status);
    return textResult(
      toolJson({
        tool,
        action,
        target: config.targetId ?? 'single configured target',
        decision: statuses.includes('denied') ? 'denied' : statuses.includes('unresolved') ? 'unresolved' : 'allowed',
        checks,
        sapAuthorization: 'not verified; no permission-testing mutation was performed',
        evaluatedAt: new Date().toISOString(),
        executionEnforcement: 'All checks run again when the operation is executed.',
      }),
    );
  }
}
