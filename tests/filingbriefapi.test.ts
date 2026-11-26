import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ok = (b: unknown) => new Response(typeof b === 'string' ? b : JSON.stringify(b), { status: 200 });
const TENQ = `<html><body><p>Item 2. Management's Discussion and Analysis of Financial Condition</p><p>${'Background text about the business and its many products. '.repeat(40)}Revenue increased 12% to $4.1 billion compared with the prior year quarter. We expect revenue growth of about 8 percent next quarter on continued demand. Our cash was $9.0 billion at the end of the quarter.</p><p>Item 3. Quantitative and Qualitative Disclosures About Market Risk</p></body></html>`;
const facts = { facts: { 'us-gaap': { Revenues: { units: { USD: [
  { start: '2025-07-01', end: '2025-09-30', val: 3660, fp: 'Q3', form: '10-Q' },
  { start: '2026-04-01', end: '2026-06-30', val: 3900, fp: 'Q2', form: '10-Q' },
  { start: '2026-07-01', end: '2026-09-30', val: 4100, fp: 'Q3', form: '10-Q' },
] } } } } };

function mock(ai: unknown) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('company_tickers.json')) return ok({ 0: { cik_str: 9, ticker: 'ACME', title: 'Acme Corp' } });
    if (url.includes('/submissions/')) return ok({ filings: { recent: { form: ['10-Q', '4'], filingDate: ['2026-10-30', '2026-11-01'], accessionNumber: ['0000000009-26-000001', '0000000009-26-000002'], primaryDocument: ['acme-q3.htm', 'f4.xml'], items: ['', ''], reportDate: ['2026-09-30', ''] } } });
    if (url.includes('acme-q3.htm')) return ok(TENQ);
    if (url.includes('companyfacts')) return ok(facts);
    if (url.includes('generativelanguage')) return ok({ candidates: [{ content: { parts: [{ text: JSON.stringify(ai) }] } }] });
    return new Response('x', { status: 404 });
  }));
}

describe('filing brief endpoint', () => {
  const env = { ...process.env };
  beforeEach(() => { vi.resetModules(); process.env.SEC_USER_AGENT = 't t@example.com'; process.env.GEMINI_API_KEY = 'g'; delete process.env.GROQ_API_KEY; delete process.env.OPENROUTER_API_KEY; });
  afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); });

  it('briefs the latest 10-Q: numbers, checked points, insiders', async () => {
    mock({ headline: 'Revenue up 12%', points: [
      { topic: 'Results', text: 'Revenue rose 12% to $4.1B.', quote: 'Revenue increased 12% to $4.1 billion compared with the prior year quarter.' },
      { topic: 'Guidance', text: 'Raised full-year outlook.', quote: 'We raised our full-year outlook to $20 billion.' },
    ] });
    const { filingbrief } = await import('../api/_lib/research/filingbrief');
    const j = await (await filingbrief(new Request('https://x/?fn=filingbrief&symbol=ACME'))).json();
    expect(j.error).toBeUndefined();
    expect(j.filing).toMatchObject({ kind: '10-Q', date: '2026-10-30', period: '2026-09-30' });
    expect(j.brief.points).toHaveLength(1);
    expect(j.brief.dropped).toBe(1);
    expect(j.insiders.buys.n).toBe(0);
    expect(j.numbers).toMatchObject({ basis: "quarter", cur: { revenue: 4100 }, yearAgo: { revenue: 3660 }, prior: { revenue: 3900 } });
  });

  it('says so when the ticker is not an SEC filer', async () => {
    mock({});
    const { filingbrief } = await import('../api/_lib/research/filingbrief');
    const j = await (await filingbrief(new Request('https://x/?fn=filingbrief&symbol=ZZZZ'))).json();
    expect(j.error).toMatch(/isn't an SEC filer/);
  });
});
