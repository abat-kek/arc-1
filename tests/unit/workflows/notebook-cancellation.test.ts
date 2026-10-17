import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import { AdtClient } from '../../../src/adt/client.js';
import { defaultSafetyConfig } from '../../../src/adt/safety.js';
import { textResult } from '../../../src/handlers/shared.js';
import { runNotebook } from '../../../src/workflows/sql-notebook.js';

it('aborts an in-flight SAPQuery socket and never starts the next cell', async () => {
  const abort = new AbortController();
  let posts = 0;
  let closed!: () => void;
  const socketClosed = new Promise<void>((resolve) => {
    closed = resolve;
  });
  const server = createServer((req, res) => {
    if (req.method === 'HEAD') {
      res.setHeader('x-csrf-token', 'TEST');
      res.end();
      return;
    }
    posts++;
    res.once('close', closed);
    res.writeHead(200, { 'content-type': 'application/xml' });
    res.write('<tableData>'); // Never finish the body; abort must reach the streaming read.
    abort.abort();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP listener');
    const client = new AdtClient({
      baseUrl: `http://127.0.0.1:${address.port}`,
      safety: { ...defaultSafetyConfig(), allowFreeSQL: true },
    });
    const sql = { id: 'one', kind: 'sql', value: 'SELECT * FROM ztest', target: 'dev', maxRows: 2 };
    const run = await runNotebook(
      { schemaVersion: 1, title: 'Cancellation', cells: [sql, { ...sql, id: 'two' }] },
      {
        dev: {
          identity: 'loopback',
          client: '001',
          call: async (_tool, args) =>
            textResult(JSON.stringify(await client.runQueryWithMetrics(String(args.sql), Number(args.maxRows)))),
        },
      },
      { signal: abort.signal },
    );
    await socketClosed;
    expect(posts).toBe(1);
    expect(run.cells.map((cell) => cell.status)).toEqual(['incomplete', 'not-run']);
    expect(run.status).toBe('partial');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
