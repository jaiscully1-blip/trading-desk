import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
const file = (asOf: string) => ({ schema: 1, asOf, errors: {}, radar: { complete: true, themes: [], form: 'wild' },
  tickers: { NVDA: { sym: 'NVDA', name: 'Nvidia', names: ['Nvidia'], notes: ['This week (a to b): 14 applications made public.'], week: { published: 14, granted: 0, from: 'a', to: 'b' }, trendWord: 'steady', trendPct: 1, areasSeen: [] } },
  patents: { NVDA: { sym: 'NVDA', name: 'Nvidia', complete: true, quarters: [], latest: [] } } });

function mock(f: unknown) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(url);
    if (url.includes('published/patents.json')) return ok(f);
    if (url.includes('company_tickers.json')) return ok({ 0: { cik_str: 1, ticker: 'NVDA', title: 'NVIDIA CORP' } });
    if (url.includes('/submissions/')) return ok({ name: 'NVIDIA CORP', addresses: { business: {} }, filings: { recent: { form: [] } } });
    if (url.includes('api.uspto.gov')) return ok({ count: 5, patentFileWrapperDataBag: [] });
    return new Response('x', { status: 404 });
  }));
  return calls;
}

describe('nightly patent file', () => {
  const env = { ...process.env };
  beforeEach(() => { vi.resetModules(); process.env.USPTO_API_KEY = 'k'; process.env.SEC_USER_AGENT = 't t@example.com'; delete process.env.GITHUB_ACTIONS; });
  afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); });

  it('answers a listed ticker from a fresh nightly file without calling the USPTO', async () => {
    const calls = mock(file(new Date().toISOString()));
    const { patents } = await import('../api/_lib/research/patents');
    const j = await (await patents(new Request('https://x/?fn=patents&symbol=NVDA'))).json();
    expect(j.nightly).toBeTruthy();
    expect(j.notes).toEqual(['This week (a to b): 14 applications made public.']);
    expect(calls.some((u) => u.includes('api.uspto.gov'))).toBe(false);
  });

  it('asks the USPTO when the file is stale or live=1 is set', async () => {
    const calls = mock(file(new Date(Date.now() - 6 * 86400000).toISOString()));
    const { patents } = await import('../api/_lib/research/patents');
    const j = await (await patents(new Request('https://x/?fn=patents&symbol=NVDA'))).json();
    expect(j.nightly).toBeUndefined();
    expect(calls.some((u) => u.includes('api.uspto.gov'))).toBe(true);
    vi.resetModules(); const calls2 = mock(file(new Date().toISOString()));
    const m = await import('../api/_lib/research/patents');
    await (await m.patents(new Request('https://x/?fn=patents&symbol=NVDA&live=1'))).json();
    expect(calls2.some((u) => u.includes('api.uspto.gov'))).toBe(true);
  });

  it('serves the notes and says when the check has not run', async () => {
    mock(file(new Date().toISOString()));
    const { patentnotes } = await import('../api/_lib/research/patents');
    const j = await (await patentnotes()).json();
    expect(j.tickers.NVDA.notes).toHaveLength(1);
    expect(j.stale).toBe(false);
    vi.resetModules(); mock(null);
    const m = await import('../api/_lib/research/patents');
    expect(await (await m.patentnotes()).json()).toEqual({ notRunYet: true });
  });
});
