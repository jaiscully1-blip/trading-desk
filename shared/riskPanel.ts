// Risk-on / risk-off panel: one list of signals, each read both ways ("stressing", "easing" or "normal") from its own
// change against its own recent history. Hedging (banks buying protection, CDS index trading surges), credit spreads,
// bank stress and leverage. Facts with simple, stated rules; no forecast and no buy/sell call. Pure + tested.
import type { CdsTrade } from './cds.js';

export type Read = 'stress' | 'ease' | 'normal';
export interface Signal { id: string; group: 'Hedging' | 'Credit' | 'Banks' | 'Leverage'; label: string; value: string; change: string; read: Read; rule: string; src: string }

const sign = (v: number, dp = 0) => `${v >= 0 ? '+' : ''}${v.toFixed(dp)}`;
/** A move against a threshold: up = stress unless `upIsEase`. */
export function readMove(chg: number | null | undefined, threshold: number, upIsEase = false): Read {
  if (chg == null || !Number.isFinite(chg) || Math.abs(chg) < threshold) return 'normal';
  const up = chg > 0;
  return up !== upIsEase ? 'stress' : 'ease';
}

/** A spread series (percentage points) from the Credit page's stats: one-month change of 0.25 pp or more. */
export function spreadSignal(id: string, label: string, stats: { last: number; chg1m: number; pctile?: number } | null | undefined, threshold = 0.25): Signal | null {
  if (!stats) return null;
  return { id, group: 'Credit', label, value: `${stats.last.toFixed(2)} pp${stats.pctile != null ? ` (${Math.round(stats.pctile)}th pct.)` : ''}`, change: `${sign(stats.chg1m, 2)} pp in a month`, read: readMove(stats.chg1m, threshold), rule: `Stressing if the spread widened ${threshold} pp or more in a month; easing if it tightened as much.`, src: 'FRED (ICE BofA indices)' };
}

/** A CDS index over the tape's last days: spread change of 8% or more (first to last quote). */
export function cdsIndexSignal(name: string, label: string, first: number | null, last: number | null, group: Signal['group'] = 'Credit'): Signal | null {
  if (first == null || last == null || first <= 0) return null;
  const pct = ((last - first) / first) * 100;
  return { id: `cds:${name}`, group, label, value: `${last.toFixed(0)} bp`, change: `${sign(last - first)} bp over the last 5 trading days`, read: readMove(pct, 8), rule: 'Stressing if the 5-year spread rose 8% or more over the last 5 trading days; easing if it fell as much.', src: 'DTCC public CDS tape' };
}

/** Main-index CDS trades (CDX IG / HY, iTraxx) in one day's DTCC file. Count per file, not by trade time: files also carry
 *  late-reported older trades, which would make thin fake days. */
export const indexTradeCount = (trades: CdsTrade[]) => trades.filter((t) => t.kind === 'index' && /^(CDX\.NA\.(IG|HY)|ITRAXX EUROPE)/.test(t.name)).length;
/** Trades per day for the main index families, from tape trades (by trade time). */
export function indexTradesByDay(trades: CdsTrade[], etDay: (ms: number) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of trades) if (t.kind === 'index' && /^(CDX\.NA\.(IG|HY)|ITRAXX EUROPE)/.test(t.name)) { const d = etDay(t.t); m.set(d, (m.get(d) ?? 0) + 1); }
  return m;
}
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
/** Latest full day's index-CDS trades vs the median of the days before it: 1.8x or more = a hedging surge. */
export function surgeSignal(byDay: Map<string, number>, latestDay: string): Signal | null {
  const days = [...byDay.keys()].sort();
  const prior = days.filter((d) => d < latestDay).map((d) => byDay.get(d)!);
  const cur = byDay.get(latestDay), norm = median(prior);
  if (cur == null || norm == null || prior.length < 5 || norm === 0) return null;
  const x = cur / norm;
  return { id: 'cds:surge', group: 'Hedging', label: 'Index CDS trading (CDX, iTraxx)', value: `${cur.toLocaleString('en-US')} trades on ${latestDay}`, change: `${x.toFixed(1)}x the normal day (median of ${prior.length} days: ${Math.round(norm).toLocaleString('en-US')})`, read: x >= 1.8 ? 'stress' : x <= 0.6 ? 'ease' : 'normal', rule: 'Stressing if a day has 1.8x or more the normal number of index CDS trades (a rush to hedge); easing if it is 0.6x or less.', src: 'DTCC public CDS tape' };
}

/** All US banks' credit protection bought, quarter on quarter (FDIC). */
export function bankProtectionSignal(cur: number | null | undefined, prev: number | null | undefined, quarter: string): Signal | null {
  if (cur == null || prev == null || prev <= 0) return null;
  const pct = ((cur - prev) / prev) * 100;
  return { id: 'fdic:bought', group: 'Hedging', label: 'US banks: credit protection bought', value: `$${(cur / 1e12).toFixed(2)}T (quarter ended ${quarter})`, change: `${sign(pct)}% vs last quarter`, read: readMove(pct, 15), rule: 'Stressing if banks bought 15% or more protection than the quarter before; easing if 15% less. Quarterly, about 2 months behind.', src: 'FDIC call reports' };
}

/** A weekly / monthly index where higher = more stress (St. Louis Fed stress index, Chicago Fed conditions). */
export function levelSignal(id: string, label: string, stats: { last: number; chg1m: number } | null | undefined, threshold: number, src: string): Signal | null {
  if (!stats) return null;
  const read: Read = stats.chg1m >= threshold ? 'stress' : stats.chg1m <= -threshold ? 'ease' : 'normal';
  return { id, group: 'Credit', label, value: stats.last.toFixed(2), change: `${sign(stats.chg1m, 2)} in a month`, read, rule: `Stressing if it rose ${threshold} or more in a month (higher = more stress); easing if it fell as much.`, src };
}

/** FINRA margin debt, month on month: rising borrowing to buy stocks = risk appetite. */
export function marginSignal(rows: { month: string; debit: number }[] | null | undefined): Signal | null {
  if (!rows || rows.length < 2) return null;
  const [cur, prev] = rows;
  const pct = ((cur.debit - prev.debit) / prev.debit) * 100;
  return { id: 'finra:margin', group: 'Leverage', label: 'Margin debt (borrowing to buy stocks)', value: `$${(cur.debit / 1e6).toFixed(2)}T (${cur.month})`, change: `${sign(pct, 1)}% vs the month before`, read: pct >= 3 ? 'ease' : pct <= -3 ? 'stress' : 'normal', rule: 'Easing (risk-on) if margin debt rose 3% or more in a month; stressing (deleveraging) if it fell 3% or more.', src: 'FINRA margin statistics' };
}

/** Counts by read, and a plain one-line summary. */
export function tally(sigs: Signal[]) {
  const n = { stress: 0, ease: 0, normal: 0 } as Record<Read, number>;
  for (const s of sigs) n[s.read]++;
  const line = n.stress > n.ease ? `${n.stress} of ${sigs.length} signals are stressing` : n.ease > n.stress ? `${n.ease} of ${sigs.length} signals are easing` : `Mixed: ${n.stress} stressing, ${n.ease} easing`;
  return { ...n, line };
}
/** Quiet notes for the signals that are not normal. */
export const riskNotes = (sigs: Signal[]) => sigs.filter((s) => s.read !== 'normal').map((s) => `${s.label}: ${s.read === 'stress' ? 'stressing' : 'easing'} (${s.change}).`);
