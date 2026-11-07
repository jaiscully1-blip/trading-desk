// GET /api/macro -> fear strip inputs: VIX, 10Y, yield-curve spreads (FRED, end of day) and SPY put/call (Alpha Vantage)
import type { MacroResult } from '../shared/types.js';
import { alphaPutCall, fredHistory, fredLatest } from './_lib/adapters.js';
import { fearGreed } from '../shared/feargreed.js';
import { cached, hasKey, json, ttl } from './_lib/core.js';

export async function GET(): Promise<Response> {
  try {
    const { val } = await cached<MacroResult>('macro', 3 * 3600, async () => {
      const [vix, tnx, c2, c3] = await Promise.allSettled([fredLatest('VIXCLS'), fredLatest('DGS10'), fredLatest('T10Y2Y'), fredLatest('T10Y3M')]);
      if (vix.status === 'rejected' && tnx.status === 'rejected') throw vix.reason;
      const v = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : null);
      return { vix: v(vix), tnx: v(tnx), t10y2y: v(c2), t10y3m: v(c3), source: 'FRED (VIXCLS, DGS10, T10Y2Y, T10Y3M)', freshness: 'eod', asOf: Date.now() };
    });
    // put/call refreshes on its own schedule: every 2h in session keeps Alpha Vantage under its 25/day
    let putCall: MacroResult['putCall'] = null;
    if (hasKey('alphavantage')) {
      try { const r = await cached('pcr:SPY', ttl(7200, 6 * 3600), async () => ({ ...(await alphaPutCall('SPY')), asOf: Date.now() })); putCall = { ratio: r.val.ratio, asOf: r.val.asOf }; } catch { /* unavailable */ }
    }
    // Desk Fear & Greed: VIX vs its average, S&P 500 vs its 125-day average, junk-bond spread (all FRED) + put/call
    let fg = null;
    try {
      const h = (await cached('fg:hist', 6 * 3600, async () => {
        const [vix, spx, hy] = await Promise.allSettled([fredHistory('VIXCLS', 80), fredHistory('SP500', 160), fredHistory('BAMLH0A0HYM2', 300)]);
        const v = (r: PromiseSettledResult<{ date: string; value: number }[]>) => (r.status === 'fulfilled' ? r.value : []);
        return { vix: v(vix), spx: v(spx), hy: v(hy) };
      })).val;
      fg = fearGreed({ vix: h.vix.map((x) => x.value), spx: h.spx.map((x) => x.value), hy: h.hy.map((x) => x.value), putCall: putCall?.ratio ?? null, date: h.spx.at(-1)?.date ?? h.vix.at(-1)?.date ?? '' });
    } catch { /* leave it out */ }
    return json({ ...val, putCall, fearGreed: fg }, { sMaxAge: 1800 });
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 503 });
  }
}
