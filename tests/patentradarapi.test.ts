import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
function mock(odp: (b: any) => Response) {
  const bodies: any[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
    if (url.includes('company_tickers.json')) return ok({ 0: { cik_str: 1, ticker: 'NVDA', title: 'NVIDIA CORP' } });
    if (url.includes('/submissions/')) return ok({ name: 'NVIDIA CORP', addresses: { business: {} }, filings: { recent: { form: [] } } });
    if (url.includes('api.uspto.gov')) { const b = JSON.parse(init.body); bodies.push(b); return odp(b); }
    return new Response('x', { status: 500 });
  }));
  return bodies;
}

describe('patent radar and watchlist endpoints', () => {
  const env = { ...process.env };
  beforeEach(() => { vi.resetModules(); process.env.USPTO_API_KEY = 'k'; process.env.SEC_USER_AGENT = 't t@example.com'; });
  afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); });

  it('picks the prefix form that finds results, then counts every theme with top filers', async () => {
    const bodies = mock((b) => (/cpcClassificationBag:"/.test(b.q) ? ok({ count: 0 }) : ok({ count: 10, facets: [{ field: 'f', values: [{ value: 'NVIDIA Corporation', count: 4 }] }] })));
    const { patentradar } = await import('../api/_lib/research/patents');
    const j = await (await patentradar()).json();
    expect(j.form).toBe('wild');
    expect(j.complete).toBe(true);
    expect(j.themes.length).toBe(25);
    expect(j.base).toEqual({ cur: { published: 10, granted: 10 }, prev: { published: 10, granted: 10 } });
    expect(j.themes[0]).toMatchObject({ id: 'ai', cur: { published: 10, granted: 10 }, prev: { published: 10, granted: 10 }, top: [{ name: 'NVIDIA Corporation', n: 4 }] });
    // quantum: every spelling returns as many as its parent class here, so it is left out instead of shown wrong
    expect(j.themes.find((t: any) => t.id === 'quantum')).toMatchObject({ unmatched: true, cur: { published: null } });
    expect(bodies.filter((b) => b.facets).length).toBe(24);
  });

  it('rejects a sub-category spelling that matches everything and keeps a plausible one', async () => {
    mock((b) => {
      if (/G06N\?\?10/.test(b.q)) return ok({ count: 122686 });         // a spelling that misfires         // read as "match anything" (live bug)
      if (/"G06N  10\/\*"/.test(b.q)) return ok({ count: 410 });          // right spelling
      if (/H10N/.test(b.q)) return ok({ count: 0 });
      return ok({ count: 6403 });
    });
    const { patentradar } = await import('../api/_lib/research/patents');
    const j = await (await patentradar()).json();
    const qt = j.themes.find((t: any) => t.id === 'quantum');
    expect(qt.unmatched).toBeUndefined();
    expect(qt.cur.published).toBe(410);
  });

  it('says the radar is unavailable when no prefix form works', async () => {
    mock(() => new Response('{"error":"bad syntax"}', { status: 400 }));
    const { patentradar } = await import('../api/_lib/research/patents');
    const j = await (await patentradar()).json();
    expect(j.unavailable).toBe(true);
    expect(j.why).toMatch(/400/);
  });

  it('counts granted patents for each watchlist name', async () => {
    mock((b) => ok({ count: b.rangeFilters[0].valueFrom.startsWith('2025-10') ? 30 : 20 }));
    const { patentwatch } = await import('../api/_lib/research/patents');
    const j = await (await patentwatch(new Request('https://x/?fn=patentwatch&symbols=nvda,BAD!!'))).json();
    expect(j.rows).toHaveLength(1);
    expect(j.rows[0]).toMatchObject({ sym: 'NVDA', name: 'Nvidia Corp', names: ['Nvidia', 'Mellanox Technologies'] });
    expect(typeof j.rows[0].last).toBe('number');
    expect(j.complete).toBe(true);
  });
});
