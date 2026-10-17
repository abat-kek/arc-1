import { readFileSync } from 'node:fs';
import { mockResponse } from '../../helpers/mock-fetch.js';

const schema = readFileSync(new URL('../../fixtures/xml/dumps-schema-758.xml', import.meta.url), 'utf8');
const stamp = (value: string) => value.replace(/[-:T]/g, '').slice(0, 14);
const dumps = Array.from({ length: 120 }, (_, i) => ({
  id: `D${String(i).padStart(3, '0')}`,
  date: new Date(Date.UTC(2026, 9, 17, 12, 0, 0) - i * 60_000).toISOString(),
  error: [79, 113].includes(i) ? 'TIME_OUT' : 'RAISE_EXCEPTION',
}));

/** Offline at the fetch boundary: production dispatch, serialization, parsing and budgets still run. */
export function createWorld(caseId: string) {
  const requests: Array<{ method: string; path: string; body: string; status: number; response: string }> = [];
  const unsupported: string[] = [];
  async function fetch(url: string | URL, options?: RequestInit) {
    const u = new URL(String(url));
    const method = options?.method ?? 'GET';
    const body = String(options?.body ?? '');
    let response = '';
    let status = 200;
    if (new Headers(options?.headers).get('x-csrf-token')?.toLowerCase() === 'fetch') {
      response = '<service/>';
    } else if (u.pathname === '/sap/bc/adt/checkruns' && method === 'POST') {
      const uris = [...body.matchAll(/adtcore:uri="([^"]+)"/g)].map((match) => match[1]!);
      response = `<checkRunReports>${uris
        .map((uri) => {
          const name = uri.split('/').at(-1)!.toUpperCase();
          if (caseId === 'syntax-missing' && name === 'ZEVAL_D') return '';
          if (!/^ZEVAL_[ABCD]$/.test(name)) return '';
          const message = name === 'ZEVAL_B' ? '<checkMessage type="E" shortText="Unknown field TOTALX."/>' : '';
          return `<checkReport reporter="abapCheckRun" triggeringUri="${uri}" status="processed">${message}</checkReport>`;
        })
        .join('')}</checkRunReports>`;
    } else if (u.pathname === '/sap/bc/adt/feeds' && method === 'GET') {
      response = schema;
    } else if (u.pathname === '/sap/bc/adt/runtime/dumps' && method === 'GET') {
      const query = u.searchParams.get('$query') ?? '';
      // Implement only the values/grammar needed by the fixture; unfamiliar queries are inconclusive.
      if (query && !/^and\((equals\(runtimeError,TIME_OUT\)|contains\(runtimeError,TIME_OUT\))\)$/.test(query)) {
        unsupported.push(`${u.pathname}?${u.searchParams}`);
        status = 400;
      }
      const from = u.searchParams.get('from') ?? '';
      const to = u.searchParams.get('to') ?? '99999999999999';
      const rows = dumps
        .filter((d) => stamp(d.date) >= from && stamp(d.date) <= to && (!query || d.error === 'TIME_OUT'))
        .slice(0, Math.min(100, Number(u.searchParams.get('$top') ?? 50)));
      response = `<feed>${rows.map((d) => `<entry><id>/sap/bc/adt/runtime/dumps/${d.id}</id><published>${d.date}</published><author><name>EVAL_USER</name></author><category label="Runtime Error" term="${d.error}"/><category label="Program" term="ZEVAL_JOB"/></entry>`).join('')}</feed>`;
    } else if (/^\/sap\/bc\/adt\/runtime\/dump\/D\d{3}(\/formatted)?$/.test(u.pathname) && method === 'GET') {
      const id = u.pathname.match(/D\d{3}/)![0];
      const dump = dumps.find((d) => d.id === id);
      if (!dump) {
        status = 404;
        response = 'Dump does not exist.';
      } else
        response = u.pathname.endsWith('/formatted')
          ? `Runtime Error: ${dump.error}\nProgram: ZEVAL_JOB\nDate: ${dump.date}`
          : `<dump error="${dump.error}" author="EVAL_USER" terminatedProgram="ZEVAL_JOB" datetime="${stamp(dump.date)}"/>`;
    } else if (u.pathname.toLowerCase() === '/sap/bc/adt/ddic/domains/zeval_domain' && method === 'GET') {
      const link =
        caseId === 'log-unsupported'
          ? ''
          : '<link rel="http://www.sap.com/adt/relations/ddic/activationlog" type="application/vnd.sap.adt.logs+xml" href="/sap/bc/adt/ddic/logs/db/ACTDOMAZEVAL_DOMAIN"/>';
      response = `<domain name="ZEVAL_DOMAIN">${link}<description>Evaluation domain</description></domain>`;
    } else if (u.pathname === '/sap/bc/adt/ddic/logs/db/ACTDOMAZEVAL_DOMAIN' && method === 'GET') {
      response =
        '<log><name>ZEVAL_DOMAIN</name><type>DOMA</type><entry severity="error"><message><messageText>Fixed value range overlaps at value 42.</messageText></message></entry></log>';
    } else {
      unsupported.push(`${method} ${u.pathname}`);
      status = 404;
      response = 'Endpoint not modeled by this offline evaluation; do not infer SAP availability.';
    }
    requests.push({ method, path: `${u.pathname}${u.search}`, body, status, response });
    return mockResponse(status, response, { 'x-csrf-token': 'offline-token' });
  }
  return { fetch, requests, unsupported };
}
