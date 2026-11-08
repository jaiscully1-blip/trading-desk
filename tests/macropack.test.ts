import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as research } from '../api/research';
import { _clearCache, _resetLimits } from '../api/_lib/core';

const obs = (n: number, v: (i: number) => number, weekly = false) => ({ observations: Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse('2026-11-04T12:00:00Z') - (n - 1 - i) * (weekly ? 7 : 1) * 86400_000).toISOString().slice(0, 10), value: String(v(i)) })).reverse() });
const calls: string[] = [];

beforeEach(() => {
  _clearCache(); _resetLimits(); calls.length = 0;
  process.env.FRED_API_KEY = 'fred-key';
  vi.stubGlobal('fetch', async (input: string) => {
    const u = new URL(input);
    calls.push(u.pathname + u.search);
    if (u.pathname === '/fred/releases') return Response.json({ releases: [{ id: 10, name: 'Consumer Price Index' }, { id: 50, name: 'Employment Situation' }] });
    if (u.pathname === '/fred/release/dates') return Response.json({ release_dates: [{ date: '2026-09-10' }, { date: '2026-10-14' }, { date: '2030-01-01' }] });
    if (u.pathname === '/fred/series/observations') {
      const id = u.searchParams.get('series_id');
      if (id === 'NFCI') return Response.json({ error_message: 'Bad Request. Series does not exist.' });
      if (id === 'WALCL') return Response.json(obs(6, (i) => 6_400_000 + i * 10_000, true));
      if (id === 'WTREGEN') return Response.json(obs(6, () => 800_000, true));
      if (id === 'RRPONTSYD') return Response.json(obs(30, () => 100));
      if (id === 'VIXCLS') return Response.json(obs(60, (i) => 15 + (i % 7)));
      return Response.json(obs(30, (i) => 3 + i / 100));
    }
    return new Response('not found', { status: 404 });
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('/api/research?fn=macropack', () => {
  it('returns liquidity rows, VIX history and past event dates, and reports a series that failed', async () => {
    const r = await research(new Request('http://x/api/research?fn=macropack'));
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.liquidity.find((x: { id: string }) => x.id === 'NET')).toBeTruthy();
    expect(j.vix).toHaveLength(60);
    expect(j.events.cpi).toEqual(['2026-09-10', '2026-10-14']); // the 2030 date is in the future and dropped
    expect(j.events.fomc.length).toBeGreaterThan(5);
    expect(j.errors.NFCI).toMatch(/does not exist/);
    expect(JSON.stringify(j)).not.toContain('fred-key');
  });
  it('asks for a key instead of failing when FRED_API_KEY is missing', async () => {
    delete process.env.FRED_API_KEY;
    const r = await research(new Request('http://x/api/research?fn=macropack'));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/FRED_API_KEY/);
  });
});
