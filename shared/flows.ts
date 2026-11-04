// Money flow globe: sector and asset-class rotation, approximated from ETF (and crypto) performance and volume.
// This is a PROXY: relative performance x relative dollar volume, not actual fund-flow data.
import type { Bar } from './types';

export interface Asset { sym: string; label: string; group: 'sector' | 'bonds' | 'gold' | 'dollar' | 'crypto' }
export const ASSETS: Asset[] = [
  { sym: 'XLK', label: 'Tech', group: 'sector' }, { sym: 'XLC', label: 'Comms', group: 'sector' }, { sym: 'XLY', label: 'Discretionary', group: 'sector' },
  { sym: 'XLF', label: 'Financials', group: 'sector' }, { sym: 'XLI', label: 'Industrials', group: 'sector' }, { sym: 'XLE', label: 'Energy', group: 'sector' },
  { sym: 'XLB', label: 'Materials', group: 'sector' }, { sym: 'XLV', label: 'Health care', group: 'sector' }, { sym: 'XLP', label: 'Staples', group: 'sector' },
  { sym: 'XLU', label: 'Utilities', group: 'sector' }, { sym: 'XLRE', label: 'Real estate', group: 'sector' },
  { sym: 'TLT', label: 'Long bonds', group: 'bonds' }, { sym: 'GLD', label: 'Gold', group: 'gold' }, { sym: 'UUP', label: 'Dollar', group: 'dollar' },
  { sym: 'BTC', label: 'Bitcoin', group: 'crypto' }, { sym: 'ETH', label: 'Ether', group: 'crypto' },
];

export type FlowWindow = '1D' | '5D' | '20D';
export const WINDOW_BARS: Record<FlowWindow, number> = { '1D': 1, '5D': 5, '20D': 20 };

export interface FlowRow { sym: string; label: string; group: Asset['group']; ret: number; rel: number; volRatio: number; dollarVol: number; flow: number }

/**
 * For each window: return vs SPY (relative strength), and recent average dollar volume vs the 20-day average.
 * flow = relative return x volume ratio (volume ratio floored at 0.5 so quiet days don't zero out a trend).
 * Crypto trades 7 days a week, so its window uses the same number of daily bars (≈ calendar days, not sessions).
 */
export function computeFlows(series: Record<string, Bar[]>, spy: Bar[], w: FlowWindow): FlowRow[] {
  const n = WINDOW_BARS[w];
  const ret = (bs: Bar[]) => (bs.length > n ? (bs[bs.length - 1].close / bs[bs.length - 1 - n].close - 1) * 100 : NaN);
  const spyRet = ret(spy);
  const out: FlowRow[] = [];
  for (const a of ASSETS) {
    const bs = series[a.sym];
    if (!bs || bs.length < 21 + n) continue;
    const dv = bs.map((b) => b.close * b.volume);
    const recent = dv.slice(-n).reduce((x, y) => x + y, 0) / n;
    const base = dv.slice(-(20 + n), -n).reduce((x, y) => x + y, 0) / 20; // the 20 sessions before the window
    const r = ret(bs);
    const rel = a.group === 'crypto' || !Number.isFinite(spyRet) ? r : r - spyRet;
    const volRatio = base > 0 ? recent / base : 1;
    if (!Number.isFinite(rel)) continue;
    out.push({ sym: a.sym, label: a.label, group: a.group, ret: r, rel, volRatio, dollarVol: recent, flow: rel * Math.max(0.5, volRatio) });
  }
  return out.sort((a, b) => b.flow - a.flow);
}

export interface Arc { from: string; to: string; weight: number }
/** Capital "moves" from the 3 strongest outflows to the 3 strongest inflows, weighted by both sides. */
export function flowArcs(rows: FlowRow[], k = 3): Arc[] {
  const ins = rows.filter((r) => r.flow > 0).slice(0, k);
  const outs = [...rows].filter((r) => r.flow < 0).sort((a, b) => a.flow - b.flow).slice(0, k);
  const max = Math.max(1e-9, ...rows.map((r) => Math.abs(r.flow)));
  return outs.flatMap((o) => ins.map((i) => ({ from: o.sym, to: i.sym, weight: Math.min(Math.abs(o.flow), i.flow) / max })));
}

/** Binance /api/v3/klines rows -> daily bars (time = UTC midnight seconds). Volume uses quote volume (USDT) / close so close*volume = $ volume. */
export function parseBinanceKlines(j: any): Bar[] {
  if (!Array.isArray(j)) throw new Error(String(j?.msg ?? 'unexpected klines response'));
  return j.map((k: any[]) => ({ time: Math.floor(+k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[7] / (+k[4] || 1) }))
    .filter((b) => Number.isFinite(b.close) && b.close > 0);
}

/** CoinGecko /coins/{id}/market_chart?days=40&interval=daily -> daily bars (close only; volume from total_volumes). */
export function parseGeckoChart(j: any): Bar[] {
  const p: [number, number][] = j?.prices ?? [], v: [number, number][] = j?.total_volumes ?? [];
  if (!p.length) throw new Error('unexpected CoinGecko response');
  return p.map(([t, c], i) => ({ time: Math.floor(t / 1000), open: c, high: c, low: c, close: c, volume: (v[i]?.[1] ?? 0) / (c || 1) }));
}
