// Multi-timeframe bars for the 4-chart page. Yahoo's public chart data (unofficial, about 15 minutes delayed for US stocks).
// Yahoo has no 3-minute or 4-hour bars, so 3m is built from 1m bars and 4h from 1h bars (4h sessions: 9:30-13:30, 13:30-16:00 ET).
import type { Bar } from './types.js';

export type MtfTF = '1m' | '3m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';
export const MTF_TFS: MtfTF[] = ['1m', '3m', '5m', '15m', '1h', '4h', '1d', '1w'];
export const MTF_LABEL: Record<MtfTF, string> = { '1m': '1 min', '3m': '3 min', '5m': '5 min', '15m': '15 min', '1h': '1 hour', '4h': '4 hour', '1d': 'Daily', '1w': 'Weekly' };

/** what to ask Yahoo for: interval, range, and how many source bars make one output bar */
export const YAHOO_REQ: Record<MtfTF, { interval: string; range: string; group?: 'min3' | 'h4' }> = {
  '1m': { interval: '1m', range: '5d' }, '3m': { interval: '1m', range: '5d', group: 'min3' }, '5m': { interval: '5m', range: '1mo' },
  '15m': { interval: '15m', range: '1mo' }, '1h': { interval: '60m', range: '6mo' }, '4h': { interval: '60m', range: '1y', group: 'h4' },
  '1d': { interval: '1d', range: '5y' }, '1w': { interval: '1wk', range: '10y' },
};
/** seconds a bar stays fresh in the cache (shorter for fast timeframes) */
export const MTF_TTL: Record<MtfTF, number> = { '1m': 30, '3m': 45, '5m': 60, '15m': 120, '1h': 300, '4h': 600, '1d': 900, '1w': 3600 };

/** Merge bars into buckets: key(bar) decides which bucket a bar belongs to. Bars must be oldest first. */
export function groupBars(bars: Bar[], key: (b: Bar) => number): Bar[] {
  const out: Bar[] = [];
  let cur: Bar | null = null, ck = NaN;
  for (const b of bars) {
    const k = key(b);
    if (cur && k === ck) {
      cur.high = Math.max(cur.high, b.high); cur.low = Math.min(cur.low, b.low); cur.close = b.close; cur.volume += b.volume;
    } else {
      if (cur) out.push(cur);
      cur = { ...b, time: k }; ck = k;
    }
  }
  if (cur) out.push(cur);
  return out;
}
/** Bar times here are exchange-local seconds (Yahoo time + gmtoffset), so day maths can use UTC functions directly. */
export function h4Key(b: Bar): number {
  const day = b.time - (b.time % 86400), sod = b.time % 86400;
  return day + (sod < 13.5 * 3600 ? 9.5 * 3600 : 13.5 * 3600);
}
export function shapeBars(bars: Bar[], tf: MtfTF): Bar[] {
  const g = YAHOO_REQ[tf].group;
  if (g === 'min3') {
    // align 3-minute buckets to the 9:30 open (exchange-local seconds of day)
    return groupBars(bars, (b) => { const day = b.time - (b.time % 86400), sod = b.time % 86400; return day + 34200 + Math.floor((sod - 34200) / 180) * 180; });
  }
  if (g === 'h4') return groupBars(bars, h4Key);
  return bars;
}
