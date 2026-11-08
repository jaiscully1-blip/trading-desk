// GET /api/flows -> sector rotation: each sector / theme / country / haven / crypto vs SPY over 1, 5, 20 and 60 days,
// rotation-map coordinates, and a risk-on / risk-off reading. Daily closes only; not fund-flow data.
// Daily bars come from Yahoo's public chart API (no key, one fast call per ticker), else Twelve Data / Binance.
import type { Bar } from '../shared/types.js';
import { ROT_ASSETS, parseYahooChart, riskAppetite, rotationRows } from '../shared/rotation.js';
import { cryptoDaily } from './_lib/adapters.js';
import { cached, getJson, json } from './_lib/core.js';
import { loadSeries } from './_lib/series.js';

export const maxDuration = 30;

async function yahoo(sym: string): Promise<Bar[]> {
  const y = sym === 'BTC' || sym === 'ETH' ? `${sym}-USD` : sym;
  const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?range=1y&interval=1d`, 'yahoo', 8000, { headers: { 'user-agent': 'Mozilla/5.0 (trading-desk; personal use)' } });
  const bars = parseYahooChart(j);
  if (bars.length < 30) throw new Error('short history');
  return bars;
}

async function load(sym: string): Promise<{ bars: Bar[]; source: string } | null> {
  try { return { bars: (await cached(`yh:${sym}`, 6 * 3600, () => yahoo(sym))).val, source: 'Yahoo Finance' }; } catch { /* fall back */ }
  if (sym === 'BTC' || sym === 'ETH') {
    try { const { val } = await cached(`crypto:${sym}`, 900, () => cryptoDaily(sym)); return { bars: val.bars, source: val.source }; } catch { return null; }
  }
  const r = await loadSeries(sym, 'D', { fallback: false, reserve: 2 });
  return r.ok ? { bars: r.val.bars, source: r.val.source } : null;
}

export async function GET(): Promise<Response> {
  try {
    const { val } = await cached('rotation', 3 * 3600, async () => {
      const syms = ['SPY', ...ROT_ASSETS.map((a) => a.sym)];
      const got: Record<string, Bar[]> = {};
      const sources = new Set<string>();
      const pending: string[] = [];
      for (let i = 0; i < syms.length; i += 8) {
        await Promise.all(syms.slice(i, i + 8).map(async (s) => { const r = await load(s); if (r) { got[s] = r.bars; sources.add(r.source); } else pending.push(s); }));
      }
      if (!got.SPY) throw new Error('could not load SPY');
      const spy = got.SPY;
      const rows = rotationRows(got, spy);
      const risk = riskAppetite(got, spy);
      const r = { rows, risk, pending, sources: [...sources], asOfDay: rows[0]?.asOf ?? null, asOf: Date.now() };
      if (pending.length) throw Object.assign(new Error('partial'), { partial: r }); // don't cache a half-loaded page for 3 hours
      return r;
    });
    return json(val, { sMaxAge: 1800 });
  } catch (e) {
    const partial = (e as { partial?: unknown }).partial;
    if (partial) return json(partial, { sMaxAge: 60 });
    return json({ error: (e as Error).message }, { status: 502 });
  }
}
