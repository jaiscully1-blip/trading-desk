// How often you traded each ticker, from your journal (the broker CSV import fills it). Options count under their
// underlying (an NVDA call counts as NVDA). Used to put the tickers you trade most at the top of the watchlist.
import type { Trade } from './journal';

export interface TradedCount { n: number; last: number }

/** Trades per ticker in the last `days` days (all time when that window has none). */
export function mostTraded(trades: Trade[], days = 90, now = Date.now()): Record<string, TradedCount> {
  const real = trades.filter((t) => !t.deleted && !t.demo && t.fills.some((f) => f.action === 'buy' || t.side === 'short'));
  const count = (xs: Trade[]) => {
    const m: Record<string, TradedCount> = {};
    for (const t of xs) {
      const s = (t.opt?.root ?? t.sym).toUpperCase(), at = t.fills[0]?.t ?? t.created;
      const c = (m[s] ??= { n: 0, last: 0 }); c.n++; c.last = Math.max(c.last, at);
    }
    return m;
  };
  const recent = count(real.filter((t) => (t.fills[0]?.t ?? t.created) >= now - days * 86400_000));
  return Object.keys(recent).length ? recent : count(real);
}

/** The top tickers, most traded first (ties: the more recent one first). */
export const topTraded = (m: Record<string, TradedCount>, k = 8) =>
  Object.entries(m).sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last).slice(0, k).map(([s]) => s);
