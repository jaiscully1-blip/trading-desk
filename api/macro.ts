// GET /api/macro -> fear strip inputs: VIX, 10Y, yield-curve spreads (FRED, end of day) and SPY put/call (Alpha Vantage)
import type { MacroResult } from '../shared/types';
import { alphaPutCall, fredLatest } from './_lib/adapters';
import { cached, hasKey, json, ttl } from './_lib/core';

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
    return json({ ...val, putCall }, { sMaxAge: 1800 });
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 503 });
  }
}
