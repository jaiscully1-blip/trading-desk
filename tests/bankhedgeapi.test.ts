import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
const fin = (rows: Record<string, unknown>[]) => ok({ meta: { total: rows.length }, data: rows.map((data) => ({ data })) });
const series = (cert: number, name: string, ben: [number, number]) => fin([
  { REPDTE: '20260930', NAME: name, CERT: cert, ASSET: 4e9, CTDERBEN: ben[1], CTDERGTY: 700e6, RBC1AAJ: 7.2, RBCT1JR: 15, UC: 1.9e9 },
  { REPDTE: '20260630', NAME: name, CERT: cert, ASSET: 4e9, CTDERBEN: ben[0], CTDERGTY: 700e6, RBC1AAJ: 7.3, RBCT1JR: 15, UC: 1.9e9 },
]);

describe('bank hedging endpoint', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('builds banks, industry totals and notes from FDIC answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = decodeURIComponent(url.replace(/\+/g, ' '));
      if (u.includes('fields=REPDTE&')) return fin([{ REPDTE: '20260930' }]);
      if (u.includes('CTDERBEN:[1 TO *]') && u.includes('fields=CERT&')) return fin([{ CERT: 628 }]);
      if (u.includes('/institutions?') && u.includes('ACTIVE:1')) return fin([{ CERT: 628 }, { CERT: 3510 }]);
      if (u.includes('filters=CERT:628')) return series(628, 'JPMORGAN CHASE BANK NA', [873e6, 1156e6]);
      if (u.includes('filters=CERT:3510')) return series(3510, 'BANK OF AMERICA NA', [440e6, 442e6]);
      if (u.includes('CTDERBEN:[1 TO *]')) return fin(u.includes('REPDTE:20260930') ? [{ CTDERBEN: 4.2e9, CTDERGTY: 3.9e9 }] : [{ CTDERBEN: 3.24e9, CTDERGTY: 3.0e9 }]);
      return new Response('x', { status: 404 });
    }));
    const { bankhedge } = await import('../api/_lib/research/banks');
    const j = await (await bankhedge(new Request('https://x/?fn=bankhedge'))).json();
    expect(j.error).toBeUndefined();
    expect(j.latest).toBe('2026-09-30');
    expect(j.banks.map((b: any) => b.cert)).toEqual([628, 3510]);
    expect(j.industry).toHaveLength(20);
    expect(j.industry.at(-1)).toMatchObject({ bought: 4.2e12, banks: 1 });
    expect(j.notes[0]).toBe('All US banks: credit protection bought up 30% in a quarter.');
    expect(j.notes).toContain('JPMorgan Chase Bank N.A.: credit protection bought up 32% in a quarter, to $1.16T.');
  });

  it('returns an empty list for a too-short search', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { banksearch } = await import('../api/_lib/research/banks');
    expect(await (await banksearch(new Request('https://x/?fn=banksearch&q=a'))).json()).toEqual({ results: [] });
  });
});
