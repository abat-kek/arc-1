import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { AdtClient } from '../adt/client.js';
import { checkGit, checkOperation, checkTransport, decidePackageAllowed, OperationType } from '../adt/safety.js';
import { getActionPolicy, hasRequiredScope, invocationPolicyKey } from '../authz/policy.js';
import { isActionDenied } from '../server/deny-actions.js';
import { isTargetGranted, parseTargetGrant } from '../server/multi-target-authorization.js';
import { multiTargetInvocationDecision } from '../server/multi-target-tools.js';
import type { ServerConfig } from '../server/types.js';
import { getCachedFeatures } from './feature-cache.js';
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
  const tool = String(input.proposedTool ?? '');
  const raw = input.proposedArgs as Record<string, unknown> | undefined;
  const schema = getToolSchema(tool, config.systemType === 'btp');
  if (!schema || !raw || tool === 'SAP') return errorResult('Propose one built-in intent tool and its arguments.');
  if (Buffer.byteLength(JSON.stringify(raw)) > 64 * 1024) return errorResult('Proposed arguments exceed 64 KiB.');
  const normalized = normalizeTypeArgsForValidation(tool, raw);
  const validated = schema.safeParse(normalized);
  const args = validated.success ? (validated.data as Record<string, unknown>) : normalized;
  const action = invocationPolicyKey(tool, normalized);
  const policy = getActionPolicy(tool, action);
  if (!policy) return errorResult('Unknown proposed operation.');
  const checks: Record<string, { status: Status; note?: string }> = {};
  checks.arguments = {
    status: validated.success ? 'allowed' : 'unresolved',
    note: validated.success
      ? 'Arguments pass the execution schema.'
      : `Invalid proposed fields: ${[...new Set(validated.error.issues.map((issue) => issue.path.join('.') || '(proposal)'))].slice(0, 6).join(', ')}.`,
  };
  checks.scope = {
    status: auth ? (hasRequiredScope(auth.scopes, policy.scope) ? 'allowed' : 'denied') : 'not-applicable',
    note: auth ? `Requires ${policy.scope}.` : 'Local/direct caller: no inbound scope gate.',
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
  if (policy.opType === OperationType.FreeSQL || policy.opType === OperationType.Query) {
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
