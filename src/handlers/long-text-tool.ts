/** Keep LONG_TEXT's schema and guidance aligned with its visible enum entry. */
import { LONG_TEXT_DESCRIPTION } from './long-text-input.js';
import type { ToolDefinition } from './tools.js';

export function pruneLongTextDefinition(tool: ToolDefinition, allowedTypes?: readonly string[]): ToolDefinition {
  if (tool.name !== 'SAPRead' || allowedTypes?.includes('LONG_TEXT')) return tool;
  const properties = (tool.inputSchema.properties as Record<string, unknown> | undefined) ?? {};
  const { longText: _longText, ...remaining } = properties;
  const type = properties.type as Record<string, unknown> | undefined;
  return {
    ...tool,
    description: tool.description.replace(LONG_TEXT_DESCRIPTION, '').replace(' or stored business long texts', ''),
    inputSchema: {
      ...tool.inputSchema,
      properties: {
        ...remaining,
        ...(type && Array.isArray(type.enum)
          ? {
              type: {
                ...type,
                enum: type.enum.filter((value) => value !== 'LONG_TEXT'),
                ...(typeof type.description === 'string'
                  ? { description: type.description.replace('LONG_TEXT uses longText, not name. ', '') }
                  : {}),
              },
            }
          : {}),
      },
    },
  };
}
