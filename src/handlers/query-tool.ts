/** Action-aware SAPQuery definition; server flags establish its maximum visible surface. */
import type { ResolvedFeatures } from '../adt/types.js';
import type { ServerConfig } from '../server/types.js';
import { LONG_TEXT_DESCRIPTION, LONG_TEXT_PROPERTY } from './long-text-input.js';
import type { ToolDefinition } from './tools.js';

const QUERY_SQL_DIALECT_GUIDE =
  'ADT freestyle ABAP SQL: one read-only SELECT. Use AS aliases, alias~field/alias~*, ASCENDING/DESCENDING, single-quoted literals (no @/:/? parameters), and maxRows (not TOP/LIMIT/OFFSET/FETCH). JOINs, GROUP BY, aggregates, UNION and subqueries work. CTEs, FULL JOIN, derived/window tables, INTERSECT/EXCEPT, comments, semicolons and schema prefixes do not. ARC-1 auto-chunks long literal IN-lists in plain projection SELECTs. ';

export const QUERY_SQL_DESCRIPTION_ONPREM =
  'Query SAP tables with ABAP SQL; returns columns + rows. For reverse-engineering metadata: DD02L, DD03L, TADIR, TFDIR, SWOTLV. Unknown tables get suggestions. ' +
  QUERY_SQL_DIALECT_GUIDE +
  'For CDS consumers, do not scan DDDDLSRC/ACMDCLSRC/DDLXSRC_SRC; use SAPContext(action="impact", type="DDLS").';

export const QUERY_SQL_DESCRIPTION_BTP =
  'Query BTP ABAP Environment with ABAP SQL; returns columns + rows. ' +
  QUERY_SQL_DIALECT_GUIDE +
  'BTP permits custom Z/Y tables and released CDS entities; standard tables are blocked. ' +
  'Use released views such as I_LANGUAGE. Unknown tables get suggestions.';

export function queryDescription(actions: readonly string[], btp: boolean): string {
  return [
    ...(actions.includes('sql')
      ? [`sql (default when action omitted): ${btp ? QUERY_SQL_DESCRIPTION_BTP : QUERY_SQL_DESCRIPTION_ONPREM}`]
      : []),
    ...(actions.includes('long_text') ? [LONG_TEXT_DESCRIPTION] : []),
  ].join('\n');
}

export function createQueryDefinition(
  config: ServerConfig,
  resolvedFeatures?: Partial<ResolvedFeatures>,
): ToolDefinition | undefined {
  const btp = config.systemType === 'btp' || resolvedFeatures?.systemType === 'btp';
  const sql = config.allowFreeSQL;
  const longText = config.allowDataPreview && !btp;
  const actions = [...(sql ? ['sql'] : []), ...(longText ? ['long_text'] : [])];
  if (actions.length === 0) return undefined;
  return {
    name: 'SAPQuery',
    description: queryDescription(actions, btp),
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: actions },
        ...(sql
          ? {
              sql: { type: 'string', description: 'ABAP SQL SELECT statement' },
              maxRows: {
                type: 'number',
                description: 'Rows (default 100, max 10,000; byte limit may apply sooner).',
              },
            }
          : {}),
        ...(longText ? { longText: LONG_TEXT_PROPERTY } : {}),
      },
      required: sql ? (longText ? [] : ['sql']) : ['action', 'longText'],
      additionalProperties: false,
    },
  };
}
