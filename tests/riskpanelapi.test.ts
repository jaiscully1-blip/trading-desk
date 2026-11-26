// The panel must still answer when most sources fail: show what loaded, list what did not.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
const fin = (rows: Record<string, unknown>[]) => ok({ meta: { total: rows.length }, data: rows.map((data) => ({ data })) });

describe('risk panel endpoint', () => {
  const env = { ...process.env };
  beforeEach(() => { vi.resetModules(); delete process.env.FRED_API_KEY; });
  afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); });

  it('shows the bank hedging signal even when other sources fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = decodeURIComponent(url.replace(/\+/g, ' '));
      if (u.includes('api.fdic.gov')) {
        if (u.includes('fields=REPDTE&')) return fin([{ REPDTE: '20260930' }]);
        if (u.includes('CTDERBEN:[1 TO *]') && u.includes('fields=CERT&')) return fin([]);
        if (u.includes('/institutions?')) return fin([]);
        if (u.includes('CTDERBEN:[1 TO *]')) return fin(u.includes('REPDTE:20260930') ? [{ CTDERBEN: 4.2e9, CTDERGTY: 3.9e9 }] : [{ CTDERBEN: 3.24e9, CTDERGTY: 3e9 }]);
      }
      return new Response('nope', { status: 404 });
    }));
    const { riskpanel } = await import('../api/_lib/research/riskpanel');
    const j = await (await riskpanel()).json();
    expect(j.signals.find((s: any) => s.id === 'fdic:bought')).toMatchObject({ read: 'stress', change: '+30% vs last quarter' });
    expect(j.notes).toContain('US banks: credit protection bought: stressing (+30% vs last quarter).');
    expect(Object.keys(j.errors).length).toBeGreaterThan(0);
  });
});
