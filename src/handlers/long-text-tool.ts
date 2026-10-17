/** Keep SAPQuery's fields, requirements and guidance aligned with its visible actions. */
import { QUERY_SQL_DESCRIPTION_BTP, queryDescription } from './query-tool.js';
import type { ToolDefinition } from './tools.js';

export function pruneQueryDefinition(tool: ToolDefinition, allowedActions: readonly string[]): ToolDefinition {
  if (tool.name !== 'SAPQuery') return tool;
  const properties = (tool.inputSchema.properties as Record<string, unknown> | undefined) ?? {};
  const action = (properties.action as Record<string, unknown> | undefined) ?? {};
  const existingActions = Array.isArray(action.enum) ? action.enum : [];
  const actions = existingActions.filter(
    (value): value is string =>
      typeof value === 'string' && ['sql', 'long_text'].includes(value) && allowedActions.includes(value),
  );
  const sql = actions.includes('sql');
  const longText = actions.includes('long_text');
  const remaining = Object.fromEntries(
    Object.entries(properties).filter(([name]) =>
      name === 'sql' || name === 'maxRows' ? sql : name === 'longText' ? longText : true,
    ),
  );
  // Preserve unrelated requirements such as an injected multi-target selector.
  const required = (Array.isArray(tool.inputSchema.required) ? tool.inputSchema.required.map(String) : []).filter(
    (name) => !['sql', 'action', 'longText'].includes(name),
  );
  if (sql && !longText) required.push('sql');
  if (longText && !sql) required.push('action', 'longText');
  return {
    ...tool,
    description: queryDescription(actions, tool.description.includes(QUERY_SQL_DESCRIPTION_BTP)),
    inputSchema: {
      ...tool.inputSchema,
      properties: {
        ...remaining,
        action: { ...action, enum: actions },
      },
      required,
    },
  };
}
