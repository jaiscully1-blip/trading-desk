// Earnings expected move and past reactions. Expected move = the at-the-money straddle (call + put) on the first
// expiry on or after the day the market reacts, as a share of the stock price: what options are pricing in. Past
// reactions: the close-to-close move on the reaction day, and the drift over the next 5 sessions. Pure (tested).
import type { Chain } from './gamma';

const mid = (bid?: number, ask?: number, last?: number) => (bid && ask && ask >= bid ? (bid + ask) / 2 : last || 0);
const addDays = (s: string, n: number) => new Date(Date.parse(`${s}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** The day the market trades on the news: the report day if before the open, the next weekday if after the close. */
export function reactionDay(date: string, when: string): string {
  if (!/amc|after|post/i.test(when)) return date;
  let d = addDays(date, 1); while ([0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())) d = addDays(d, 1);
  return d;
}

export function impliedMove(ch: Chain, reactDay: string): { pct: number; dollars: number; exp: string; strike: number } | null {
  if (!(ch.spot > 0)) return null;
  const exps = [...new Set(ch.contracts.map((c) => c.exp))].filter((e) => e >= reactDay).sort();
  for (const exp of exps.slice(0, 2)) {
    const cs = ch.contracts.filter((c) => c.exp === exp);
    const strikes = [...new Set(cs.map((c) => c.K))].sort((a, b) => Math.abs(a - ch.spot) - Math.abs(b - ch.spot));
    for (const K of strikes.slice(0, 3)) {
      const c = cs.find((x) => x.K === K && x.cp === 'C'), p = cs.find((x) => x.K === K && x.cp === 'P');
      const st = c && p ? mid(c.bid, c.ask, c.last) + mid(p.bid, p.ask, p.last) : 0;
      if (st > 0) return { pct: (st / ch.spot) * 100, dollars: st, exp, strike: K };
    }
  }
  return null;
}

export interface Reaction { date: string; day: string; move: number; drift5: number | null }
/** Past reactions from daily closes and report dates (newest first). */
export function pastReactions(closes: { d: string; c: number }[], reports: { date: string; time?: string }[], n = 8): Reaction[] {
  const idx = new Map(closes.map((x, i) => [x.d, i])), out: Reaction[] = [];
  for (const r of [...reports].sort((a, b) => b.date.localeCompare(a.date))) {
    const rd = reactionDay(r.date, r.time ?? '');
    let i = idx.get(rd); if (i == null) { const j = closes.findIndex((x) => x.d >= rd); i = j < 0 ? undefined : j; }
    if (i == null || i < 1) continue;
    const move = (closes[i].c / closes[i - 1].c - 1) * 100;
    const drift5 = i + 5 < closes.length ? (closes[i + 5].c / closes[i].c - 1) * 100 : null;
    out.push({ date: r.date, day: closes[i].d, move, drift5 });
    if (out.length >= n) break;
  }
  return out;
}
