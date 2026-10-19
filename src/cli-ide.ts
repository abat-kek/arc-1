/** Offline presentation-config generator. Never inspects credentials, writes settings, or contacts SAP. */
import { type Command, Option } from 'commander';
import { isIdeDestination, isIdeSystemId } from './server/ide-config.js';
import { IDE_HEADER_LIMIT, IDE_MAPPING_LIMIT } from './server/ide-request.js';
import { TARGET_ID_PATTERN, targetFromPinnedMcpPath } from './server/multi-target-identity.js';

export interface IdeSetupOptions {
  client: 'vscode' | 'eclipse' | 'claude';
  editor?: 'off' | 'vscode' | 'eclipse';
  endpoint?: string;
  destination?: string;
  systemId?: string;
  map?: string[];
}

export function buildIdeConfigFragment(options: IdeSetupOptions): Record<string, unknown> {
  const editor = options.editor ?? (options.client === 'claude' ? 'off' : options.client);
  const maps = options.map ?? [];
  if (!['vscode', 'eclipse', 'claude'].includes(options.client) || !['off', 'vscode', 'eclipse'].includes(editor)) {
    throw new Error('Choose a supported client and editor.');
  }
  if (editor !== 'vscode' && (options.destination || maps.length)) {
    throw new Error('Destination aliases and maps are only for VS Code links.');
  }
  if (editor !== 'eclipse' && options.systemId) throw new Error('--system-id is only for Eclipse links.');
  if (!options.endpoint) {
    if (maps.length) throw new Error('Local stdio uses --destination, not --map.');
    if (editor === 'vscode' && !isIdeDestination(options.destination ?? '')) {
      throw new Error('Provide --destination with the exact local SAP ADT alias.');
    }
    if (editor === 'eclipse' && !isIdeSystemId(options.systemId ?? '')) {
      throw new Error('Provide --system-id with the real three-character SAP SID.');
    }
    return {
      env: {
        ARC1_IDE_LINKS: editor,
        ARC1_IDE_DESTINATION: editor === 'vscode' ? options.destination : '',
        ARC1_IDE_SYSTEM_ID: editor === 'eclipse' ? options.systemId : '',
      },
    };
  }
  if (editor === 'off') {
    throw new Error(
      'HTTP links are off when the MCP entry sends no Arc1-Ide-* headers; remove them if present. To enable links, pass --editor vscode|eclipse.',
    );
  }
  if (options.systemId) throw new Error('For HTTP, the server supplies the SAP SID; do not set --system-id here.');
  let endpoint: URL;
  try {
    endpoint = new URL(options.endpoint);
  } catch {
    throw new Error('Provide an absolute HTTP(S) MCP endpoint.');
  }
  if (
    !['https:', 'http:'].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new Error('Use an HTTP(S) MCP endpoint without credentials, query, or fragment.');
  }
  const target = targetFromPinnedMcpPath(endpoint.pathname);
  if (!target && endpoint.pathname !== '/mcp' && endpoint.pathname !== '/multi/mcp') {
    throw new Error('Expected /mcp, /<target>/<client>/mcp, or /multi/mcp.');
  }
  const headers: Record<string, string> = { 'Arc1-Ide-Client': editor };
  if (editor === 'vscode') {
    const entries = new Map<string, string>();
    if (endpoint.pathname === '/multi/mcp') {
      if (options.destination || !maps.length || maps.length > IDE_MAPPING_LIMIT) {
        throw new Error(`Aggregate HTTP needs 1–${IDE_MAPPING_LIMIT} --map TARGET/CLIENT=ALIAS entries.`);
      }
      for (const mapping of maps) {
        const [key, alias, extra] = mapping.split('=');
        if (!TARGET_ID_PATTERN.test(key) || !isIdeDestination(alias ?? '') || extra !== undefined || entries.has(key)) {
          throw new Error('Each --map must have a unique TARGET/CLIENT and a valid local ADT alias.');
        }
        entries.set(key, alias);
      }
    } else {
      if (maps.length || !isIdeDestination(options.destination ?? '')) {
        throw new Error('Single/pinned HTTP needs one --destination with the exact local ADT alias.');
      }
      entries.set(target ?? '@single', options.destination!);
    }
    const mapping = [...entries].map(([key, alias]) => `${key}=${encodeURIComponent(alias)}`).join(',');
    if (mapping.length > IDE_HEADER_LIMIT) throw new Error('Encoded IDE mapping exceeds the HTTP header limit.');
    headers['Arc1-Ide-Destinations-V1'] = mapping;
  }
  return options.client === 'eclipse' ? { requestInit: { headers } } : { headers };
}

export function registerIdeConfigCommand(parent: Command): void {
  parent
    .command('ide')
    .description('Print an IDE preference fragment to merge into one existing MCP server entry (offline)')
    .addOption(
      new Option('--mcp-client <client>', 'MCP client configuration format')
        .choices(['vscode', 'eclipse', 'claude'])
        .default('vscode'),
    )
    .addOption(
      new Option('--editor <editor>', 'Link style (default: client editor; Claude: off)').choices([
        'off',
        'vscode',
        'eclipse',
      ]),
    )
    .option('--endpoint <url>', 'Existing HTTP MCP URL; omit for local stdio')
    .option('--destination <alias>', 'Exact local SAP ADT for VS Code destination alias')
    .option('--system-id <sid>', 'Real SAP SID for local Eclipse navigation')
    .option(
      '--map <target=alias>',
      'Aggregate target mapping; repeatable',
      (value: string, previous: string[]) => [...previous, value],
      [],
    )
    .action((options: Omit<IdeSetupOptions, 'client'> & { mcpClient: IdeSetupOptions['client'] }, command: Command) => {
      if (command.optsWithGlobals().client !== undefined) {
        throw new Error('--client is the SAP logon client; use --mcp-client to select the MCP client format.');
      }
      const fragment = buildIdeConfigFragment({ ...options, client: options.mcpClient });
      console.error(
        'Merge this fragment into that client’s existing MCP server entry; preserve its connection and authentication settings.',
      );
      if (options.endpoint)
        console.error(
          'Server prerequisite: ARC1_IDE_LINKS=on (or the requested editor). Eclipse also needs the configured SAP SID; multi-target destinations already supply it. /mcp requires traditional single-target mode.',
        );
      console.log(JSON.stringify(fragment, null, 2));
    });
}
