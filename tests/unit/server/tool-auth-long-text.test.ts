import { describe, expect, it } from 'vitest';
import { getToolDefinitions } from '../../../src/handlers/tools.js';
import { filterToolsByAuthScope } from '../../../src/server/tool-auth.js';
import { DEFAULT_CONFIG } from '../../../src/server/types.js';

describe('LONG_TEXT scope visibility', () => {
  const tools = () => getToolDefinitions({ ...DEFAULT_CONFIG, allowDataPreview: true });
  it('omits the contract after BTP discovery in auto mode', () => {
    const discovered = getToolDefinitions({ ...DEFAULT_CONFIG, systemType: 'auto', allowDataPreview: true }, false, {
      systemType: 'btp',
    });
    expect(JSON.stringify(discovered.find((tool) => tool.name === 'SAPRead'))).not.toMatch(
      /LONG_TEXT|longText|saved SO10|stored business long texts/u,
    );
  });
  it.each([['read'], ['write']])('omits the complete data-only contract for %j scopes', (...scopes) => {
    const original = tools();
    const read = filterToolsByAuthScope(original, scopes).find((tool) => tool.name === 'SAPRead')!;
    expect(JSON.stringify(read)).not.toMatch(/LONG_TEXT|longText|saved SO10|stored business long texts/u);
    expect(original.find((tool) => tool.name === 'SAPRead')!.inputSchema.properties).toHaveProperty('longText');
  });

  it.each([['data'], ['sql'], ['admin']])('keeps the contract for %j scopes', (...scopes) => {
    const read = filterToolsByAuthScope(tools(), scopes).find((tool) => tool.name === 'SAPRead')!;
    expect(read.inputSchema.properties).toHaveProperty('longText');
    expect(JSON.stringify(read)).toContain('LONG_TEXT');
  });

  it('omits the contract when a server deny action overrides data scope', () => {
    const read = filterToolsByAuthScope(tools(), ['data'], ['SAPRead.LONG_TEXT']).find(
      (tool) => tool.name === 'SAPRead',
    )!;
    expect(JSON.stringify(read)).not.toMatch(/LONG_TEXT|longText|saved SO10|stored business long texts/u);
  });
});
