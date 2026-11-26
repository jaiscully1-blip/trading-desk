import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ok = (b: unknown) => new Response(typeof b === 'string' ? b : JSON.stringify(b), { status: 200 });
const TENK = '<html><body><p>Item 1. Business</p><p>Our mRNA platform uses lipid nanoparticles to deliver mRNA into cells. We sell Spikevax, our COVID-19 vaccine, in many countries. Our RSV vaccine candidate is in Phase 3 clinical trials.</p><p>Item 1A. Risk Factors</p></body></html>';
const ROWS = { patentFileWrapperDataBag: [
  { applicationNumberText: '1', applicationMetaData: { inventionTitle: 'Lipid nanoparticle delivery of mRNA', filingDate: '2026-01-01', applicationStatusDescriptionText: 'Docketed New Case' } },
  { applicationNumberText: '2', applicationMetaData: { inventionTitle: 'RSV vaccine formulations', filingDate: '2026-01-02', applicationStatusDescriptionText: 'Docketed New Case' } },
] };

function mock(ai: unknown) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('company_tickers.json')) return ok({ 0: { cik_str: 1682852, ticker: 'MRNA', title: 'Moderna, Inc.' } });
    if (url.includes('/submissions/')) return ok({ name: 'Moderna, Inc.', addresses: { business: {} }, filings: { recent: { form: ['10-K'], accessionNumber: ['0001682852-26-000010'], filingDate: ['2026-02-20'], primaryDocument: ['mrna-20251231.htm'] } } });
    if (url.endsWith('/index.json')) return ok({ directory: { item: [{ name: 'mrna-20251231.htm' }] } });
    if (url.includes('-index.htm')) return ok('<html></html>');
    if (url.includes('mrna-20251231.htm')) return ok(TENK);
    if (url.includes('api.uspto.gov')) return ok(ROWS);
    if (url.includes('generativelanguage')) return ok({ candidates: [{ content: { parts: [{ text: JSON.stringify(ai) }] } }] });
    if (url.includes('patents.google.com')) return ok('<meta name="description" content="A lipid nanoparticle carries mRNA into a cell so it can make a protein.">');
    return new Response('x', { status: 500 });
  }));
}

describe('rollout and abstract endpoints', () => {
  const env = { ...process.env };
  beforeEach(() => { vi.resetModules(); process.env.USPTO_API_KEY = 'k'; process.env.SEC_USER_AGENT = 't t@example.com'; process.env.GEMINI_API_KEY = 'g'; delete process.env.GROQ_API_KEY; delete process.env.OPENROUTER_API_KEY; });
  afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); });

  it('keeps a verdict whose quote is in the 10-K and discards an invented one', async () => {
    mock({ items: [
      { i: 0, verdict: 'in_products', quote: 'Our mRNA platform uses lipid nanoparticles to deliver mRNA into cells.' },
      { i: 1, verdict: 'in_products', quote: 'We sell our RSV vaccine in 40 countries.' },
    ] });
    const { patentrollout } = await import('../api/_lib/research/patents');
    const j = await (await patentrollout(new Request('https://x/?fn=patentrollout&symbol=MRNA'))).json();
    expect(j.error).toBeUndefined();
    expect(j.items[0]).toMatchObject({ app: '1', verdict: 'in_products' });
    expect(j.items[1]).toMatchObject({ app: '2', verdict: 'no_evidence', dropped: true });
    expect(j.filing.date).toBe('2026-02-20');
  });

  it('returns the abstract and an AI plain-English line', async () => {
    mock({ plain: 'A tiny fat bubble that carries mRNA into cells.' });
    const { patentabstract } = await import('../api/_lib/research/patents');
    const j = await (await patentabstract(new Request('https://x/?fn=patentabstract&id=US12345678&title=Lipid'))).json();
    expect(j.abstract).toBe('A lipid nanoparticle carries mRNA into a cell so it can make a protein.');
    expect(j.plain).toBe('A tiny fat bubble that carries mRNA into cells.');
    expect(j.url).toBe('https://patents.google.com/patent/US12345678/en');
  });

  it('rejects a bad patent id', async () => {
    mock({});
    const { patentabstract } = await import('../api/_lib/research/patents');
    expect((await patentabstract(new Request('https://x/?fn=patentabstract&id=../../etc'))).status).toBe(400);
  });
});
