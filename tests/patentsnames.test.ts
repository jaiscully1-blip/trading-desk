// Nightly run 2026-11-26: SEC rate-limited the name lookup and the desk searched patents by the ticker ("AAPL"), saving
// zeros. Now: a 429 is retried, and if the name still cannot be found the answer is an error, never a ticker search.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
describe('patent lookups need the company name', () => {
  const env = { ...process.env };
  beforeEach(() => { vi.resetModules(); process.env.USPTO_API_KEY = 'k'; process.env.SEC_USER_AGENT = 't t@example.com'; delete process.env.FINNHUB_API_KEY; delete process.env.GITHUB_ACTIONS; });
  afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); });

  it('answers with an error, and never searches the USPTO by ticker, when SEC keeps refusing', async () => {
    const uspto: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      if (url.includes('api.uspto.gov')) { uspto.push(JSON.parse(init.body).q); return ok({ count: 0 }); }
      if (url.includes('sec.gov')) return new Response('slow down', { status: 429 });
      return new Response('x', { status: 404 });
    }));
    const { patents } = await import('../api/_lib/research/patents');
    const j = await (await patents(new Request('https://x/?fn=patents&symbol=AAPL&live=1'))).json();
    expect(j.error).toMatch(/Could not look up AAPL's company name/);
    expect(uspto).toEqual([]);
  }, 20000);

  it('retries an SEC 429 and then carries on', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('company_tickers.json')) { n++; return n === 1 ? new Response('slow down', { status: 429 }) : ok({ 0: { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' } }); }
      return new Response('x', { status: 404 });
    }));
    const { secJson } = await import('../api/_lib/adapters');
    const j = await secJson('https://www.sec.gov/files/company_tickers.json');
    expect(j[0].ticker).toBe('AAPL');
    expect(n).toBe(2);
  }, 20000);
});
