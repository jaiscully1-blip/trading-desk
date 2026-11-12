// After-hours / premarket move for a stock, from Yahoo's chart data with extended hours (unofficial, delayed).
// base = the last regular-session close; ext = the latest extended-hours trade; session says which window that trade was in.
// Also: which earnings to watch right now (tonight's after-close reports and the next morning's before-open reports).
import type { EarnItem } from './eventsCal.js';

export interface ExtMove { sym: string; base: number; ext: number | null; chgPct: number | null; session: 'pre' | 'post' | null; at: number | null; volume: number }

export function parseExtMove(sym: string, j: any): ExtMove | null {
  const r = j?.chart?.result?.[0];
  const m = r?.meta, tp = m?.currentTradingPeriod;
  const base = Number(m?.regularMarketPrice);
  if (!r || !Number.isFinite(base) || base <= 0) return null;
  const ts: number[] = r.timestamp ?? [], q = r.indicators?.quote?.[0] ?? {};
  const regStart = Number(tp?.regular?.start), regEnd = Number(tp?.regular?.end);
  let last: { t: number; c: number } | null = null, vol = 0;
  for (let i = ts.length - 1; i >= 0; i--) {
    const c = q.close?.[i];
    if (c == null || !Number.isFinite(c)) continue;
    const t = ts[i];
    const outside = t >= regEnd || (t < regStart && t >= regStart - 6 * 3600);
    if (!outside) break; // reached the regular session: no extended trades after it
    if (!last) last = { t, c };
    vol += Number(q.volume?.[i]) || 0;
  }
  if (!last) return { sym, base, ext: null, chgPct: null, session: null, at: null, volume: 0 };
  return { sym, base, ext: last.c, chgPct: (last.c / base - 1) * 100, session: last.t >= regEnd ? 'post' : 'pre', at: last.t * 1000, volume: vol };
}

/**
 * The reports that matter now. Before 9:30 ET: last session's after-close reports and this morning's before-open ones.
 * From 9:30 ET on: today's after-close reports and the next session's before-open ones. days = the calendar's trading days.
 */
export function earningsWindow(earn: EarnItem[], days: string[], todayET: string, minuteET: number): { tonight: { day: string; rows: EarnItem[] }; morning: { day: string; rows: EarnItem[] } } {
  const sorted = [...days].sort();
  const beforeOpen = minuteET < 9 * 60 + 30;
  const prev = sorted.filter((d) => d < todayET).pop() ?? todayET;
  const next = sorted.find((d) => d > todayET) ?? todayET;
  const isTrading = sorted.includes(todayET);
  const eveDay = beforeOpen || !isTrading ? (isTrading ? prev : sorted.filter((d) => d < todayET).pop() ?? prev) : todayET;
  const mornDay = beforeOpen && isTrading ? todayET : next;
  return {
    tonight: { day: eveDay, rows: earn.filter((e) => e.date === eveDay && e.when === 'amc') },
    morning: { day: mornDay, rows: earn.filter((e) => e.date === mornDay && e.when === 'bmo') },
  };
}
