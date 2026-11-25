// The Patents endpoint end to end with SEC and USPTO mocked: subsidiary names from Exhibit 21 are searched, USPTO calls never
// overlap (the key allows one at a time), a 404 counts as zero, and counting resumes across requests.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SEC_SUB = { name: 'Moderna, Inc.', addresses: { business: {} }, filings: { recent: { form: ['10-K'], accessionNumber: ['0001682852-26-000010'], filingDate: ['2026-02-20'], primaryDocument: ['mrna-20251231.htm'] } } };
const ok = (b: unknown) => new Response(typeof b === 'string' ? b : JSON.stringify(b), { status: 200 });

function mockNet(odp: (body: any) => Response | Promise<Response>) {
  let inFlight = 0, maxInFlight = 0;
  const bodies: any[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
    if (url.includes('company_tickers.json')) return ok({ 0: { cik_str: 1682852, ticker: 'MRNA', title: 'Moderna, Inc.' } });
    if (url.includes('/submissions/')) return ok(SEC_SUB);
    if (url.endsWith('/index.json')) return ok({ directory: { item: [{ name: 'mrna-20251231.htm' }, { name: 'mrna-ex21_1.htm' }] } });
    if (url.includes('ex21')) return ok('<table><tr><td>ModernaTX, Inc.</td><td>Delaware</td></tr><tr><td>Moderna Switzerland GmbH</td><td>Switzerland</td></tr></table>');
    if (url.includes('api.uspto.gov')) {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      const b = JSON.parse(init.body); bodies.push(b);
      try { return await odp(b); } finally { inFlight--; }
    }
    return new Response('not mocked', { status: 500 });
  }));
  return { bodies, max: () => maxInFlight };
}

describe('patents endpoint', () => {
  const env = { ...process.env };
  beforeEach(() => { vi.resetModules(); process.env.USPTO_API_KEY = 'k'; process.env.SEC_USER_AGENT = 'test test@example.com'; delete process.env.FINNHUB_API_KEY; });
  afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); });

  it('searches the company and its subsidiaries, one USPTO call at a time', async () => {
    const net = mockNet((b) => (b.pagination.limit === 1 ? ok({ count: 7 }) : ok({ count: 1, patentFileWrapperDataBag: [{ applicationNumberText: '18000001', applicationMetaData: { inventionTitle: 'Lipid nanoparticle', filingDate: '2026-01-05', applicationStatusDescriptionText: 'Docketed New Case', cpcClassificationBag: ['C12N 15/88'] } }] })));
    const { patents } = await import('../api/_lib/research/patents');
    const j = await (await patents(new Request('https://x/api/research?fn=patents&symbol=MRNA'))).json();
    expect(j.names).toEqual(['Moderna', 'ModernaTX', 'Moderna Switzerland GmbH']);
    expect(net.bodies[0].q).toContain('"ModernaTX"');
    expect(net.max()).toBe(1);
    expect(j.complete).toBe(true);
    expect(j.quarters).toHaveLength(20);
    expect(j.quarters.every((q: any) => q.filed === 7 && q.granted === 7)).toBe(true);
    expect(j.latest[0]).toMatchObject({ title: 'Lipid nanoparticle', areas: ['Biotech, genes, mRNA'] });
    expect(j.trend).toMatchObject({ pct: 0, word: 'steady' });
  });

  it('treats a USPTO 404 (no match) as zero', async () => {
    mockNet(() => new Response('{"error":"Not Found"}', { status: 404 }));
    const { patents } = await import('../api/_lib/research/patents');
    const j = await (await patents(new Request('https://x/api/research?fn=patents&symbol=MRNA'))).json();
    expect(j.latest).toEqual([]);
    expect(j.quarters[0].granted).toBe(0);
    expect(j.complete).toBe(true);
  });

  it('falls back to the simple query when the OR query is rejected', async () => {
    const net = mockNet((b) => (/ OR /.test(b.q) ? new Response('{"error":"bad query"}', { status: 400 }) : ok({ count: 3, patentFileWrapperDataBag: [] })));
    const { patents } = await import('../api/_lib/research/patents');
    const j = await (await patents(new Request('https://x/api/research?fn=patents&symbol=MRNA'))).json();
    expect(j.qForm).toBe('first applicant, company name only');
    expect(j.errors.latest).toBeUndefined();
    expect(j.quarters[19].granted).toBe(3);
    expect(net.bodies.at(-1).q).toBe('applicationMetaData.firstApplicantName:"Moderna"');
  });

  it('asks for a key when none is set', async () => {
    delete process.env.USPTO_API_KEY;
    const { patents } = await import('../api/_lib/research/patents');
    expect(await (await patents(new Request('https://x/api/research?fn=patents&symbol=MRNA'))).json()).toMatchObject({ needsKey: true });
  });
});
