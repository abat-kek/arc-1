import { afterEach, describe, expect, it, vi } from 'vitest';
import { main } from '../../../src/cli.js';
import { buildIdeConfigFragment } from '../../../src/cli-ide.js';
import { resolveHttpIdeContext } from '../../../src/server/ide-request.js';
import { DEFAULT_CONFIG } from '../../../src/server/types.js';

afterEach(() => vi.restoreAllMocks());

describe('offline IDE configuration helper', () => {
  it('defaults to the client editor and overrides inherited preferences only for this stdio entry', () => {
    expect(buildIdeConfigFragment({ client: 'vscode', destination: 'DEV' })).toEqual({
      env: { ARC1_IDE_LINKS: 'vscode', ARC1_IDE_DESTINATION: 'DEV', ARC1_IDE_SYSTEM_ID: '' },
    });
    expect(buildIdeConfigFragment({ client: 'eclipse', systemId: 'A4H' })).toEqual({
      env: { ARC1_IDE_LINKS: 'eclipse', ARC1_IDE_DESTINATION: '', ARC1_IDE_SYSTEM_ID: 'A4H' },
    });
    expect(buildIdeConfigFragment({ client: 'claude' })).toEqual({
      env: { ARC1_IDE_LINKS: 'off', ARC1_IDE_DESTINATION: '', ARC1_IDE_SYSTEM_ID: '' },
    });
  });
  it.each(['/A4H-2025/001/mcp', '/mcp'])('generates the exact mapping key from %s', (path) => {
    const fragment = buildIdeConfigFragment({
      client: 'vscode',
      endpoint: `https://arc.example${path}`,
      destination: 'DÉV (001)',
    });
    const targetId = path === '/mcp' ? undefined : 'A4H-2025/001';
    expect(
      resolveHttpIdeContext(
        {
          ...DEFAULT_CONFIG,
          transport: 'http-streamable',
          ideLinks: 'vscode',
          multiTargetEndpoints: !!targetId,
          targetId,
        },
        Object.fromEntries(
          Object.entries(fragment.headers as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]),
        ),
      ),
    ).toEqual({ style: 'vscode', destination: 'DÉV (001)', target: targetId });
  });
  it('round-trips aggregate mappings and uses Eclipse requestInit.headers', () => {
    const endpoint = 'https://arc.example/multi/mcp';
    const fragment = buildIdeConfigFragment({ client: 'vscode', endpoint, map: ['A4H/001=DEV', 'A4H-2025/001=NEXT'] });
    for (const [targetId, destination] of [
      ['A4H/001', 'DEV'],
      ['A4H-2025/001', 'NEXT'],
    ]) {
      expect(
        resolveHttpIdeContext(
          { ...DEFAULT_CONFIG, transport: 'http-streamable', ideLinks: 'on', multiTargetEndpoints: true, targetId },
          Object.fromEntries(
            Object.entries(fragment.headers as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]),
          ),
        ),
      ).toEqual({ style: 'vscode', destination, target: targetId });
    }
    expect(buildIdeConfigFragment({ client: 'eclipse', endpoint })).toEqual({
      requestInit: { headers: { 'Arc1-Ide-Client': 'eclipse' } },
    });
    expect(buildIdeConfigFragment({ client: 'claude', editor: 'eclipse', endpoint })).toEqual({
      headers: { 'Arc1-Ide-Client': 'eclipse' },
    });
  });
  it('rejects ambiguous, malformed, or mixed setup inputs', () => {
    for (const endpoint of [
      'https://user:pass@arc.example/mcp',
      'https://arc.example/mcp?token=secret',
      'https://arc.example/mcp#x',
      'file:///mcp',
      'https://arc.example/unknown',
      'bad',
    ]) {
      expect(() => buildIdeConfigFragment({ client: 'vscode', endpoint, destination: 'DEV' })).toThrow();
    }
    for (const map of [
      [],
      ['A4H/001=DEV', 'A4H/001=QA'],
      ['@single=DEV'],
      ['A4H/001=X?x'],
      Array.from({ length: 33 }, (_, i) => `A4H/${String(i).padStart(3, '0')}=DEV`),
    ]) {
      expect(() =>
        buildIdeConfigFragment({ client: 'vscode', endpoint: 'https://arc.example/multi/mcp', map }),
      ).toThrow();
    }
    expect(() => buildIdeConfigFragment({ client: 'eclipse' })).toThrow(/system-id/);
    expect(() => buildIdeConfigFragment({ client: 'vscode' })).toThrow(/destination/);
    expect(() => buildIdeConfigFragment({ client: 'eclipse', systemId: 'A4H', destination: 'DEV' })).toThrow();
  });
  it('runs through the CLI without resolving SAP config or creating a connection', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const forbidden = vi.fn(() => {
      throw new Error('Must stay offline');
    });
    const status = await main(
      ['config', 'ide', '--mcp-client', 'eclipse', '--endpoint', 'https://arc.example/A4H/001/mcp'],
      { resolveConfiguration: forbidden, createClient: forbidden, flushLogger: async () => {} },
    );
    expect(status).toBe(0);
    expect(forbidden).not.toHaveBeenCalled();
    expect(JSON.parse(log.mock.calls[0][0])).toEqual({ requestInit: { headers: { 'Arc1-Ide-Client': 'eclipse' } } });
  });
});
