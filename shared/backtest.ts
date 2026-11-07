// Playbook backtest on daily bars. Each day, after the close, a ticker is graded against the playbook using ONLY bars
// up to that day. If it grades at or above the chosen score, buy the next day's open. Exit at the stop
// (entry - stopAtr x ATR14), the target (targetR x the risk), or the close after maxDays. Results in R.
// Rules that need data the past doesn't have (news catalyst, intraday VWAP) are skipped, and the score is
// computed over the rules that could be checked, exactly as the live grader does.
import type { Bar } from './types.js';
import { bullFlag, cupHandle } from './scan.js';

export type BtCrit = { type: string; weight: number; enabled: boolean; min?: number; max?: number };
export interface BtRules { minScore: number; stopAtr: number; targetR: number; maxDays: number }
export interface BtTrade { sym: string; signal: string; entryDay: string; exitDay: string; entry: number; exit: number; r: number; days: number; why: 'target' | 'stop' | 'time' | 'gap-stop' | 'end'; score: number }
export interface BtStats { n: number; wins: number; winRate: number; avgR: number; avgWinR: number; avgLossR: number; profitFactor: number | null; totalR: number; maxDdR: number; avgDays: number }
export interface BtResult { trades: BtTrade[]; stats: BtStats; bySym: { sym: string; stats: BtStats }[]; curve: { day: string; r: number }[]; skipped: string[]; from: string; to: string; signalsBlocked: number }

const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function atr14(b: Bar[], i: number): number | null {
  if (i < 15) return null;
  let s = 0;
  for (let k = i - 13; k <= i; k++) s += Math.max(b[k].high - b[k].low, Math.abs(b[k].high - b[k - 1].close), Math.abs(b[k].low - b[k - 1].close));
  return s / 14;
}
const sma = (b: Bar[], i: number, n: number) => (i + 1 >= n ? avg(b.slice(i + 1 - n, i + 1).map((x) => x.close)) : null);
const ret = (b: Bar[], i: number, n: number) => (i >= n ? b[i].close / b[i - n].close - 1 : null);

/** RS score per symbol per day (mean of 5/20/60-day excess return vs SPY), ranked to a 0-100 percentile across the universe. */
function rsRanks(data: Record<string, Bar[]>, spy: Bar[] | undefined): Map<string, Map<string, number>> {
  const spyAt = new Map((spy ?? []).map((b, i) => [day(b.time), i]));
  const scores = new Map<string, { sym: string; s: number }[]>();
  for (const [sym, b] of Object.entries(data)) {
    b.forEach((_, i) => {
      const d = day(b[i].time), j = spyAt.get(d);
      if (j == null || !spy) return;
      const parts = [5, 20, 60].map((n) => { const a = ret(b, i, n), m = ret(spy, j, n); return a == null || m == null ? null : a - m; }).filter((x): x is number => x != null);
      if (parts.length) scores.set(d, [...(scores.get(d) ?? []), { sym, s: avg(parts) }]);
    });
  }
  const out = new Map<string, Map<string, number>>();
  for (const [d, list] of scores) {
    if (list.length < 3) continue; // a rank needs a field
    const sorted = [...list].sort((a, b) => a.s - b.s);
    const m = new Map<string, number>();
    sorted.forEach((x, k) => m.set(x.sym, Math.round((k / (sorted.length - 1)) * 100)));
    out.set(d, m);
  }
  return out;
}

/** Score one ticker on one day: pass / fail / not checkable, per rule. */
export function scoreDay(b: Bar[], i: number, crits: BtCrit[], rsRank: number | null): { score: number; checked: number; total: number } {
  let total = 0, checked = 0, passed = 0;
  const last = b[i].close;
  const vol20 = i >= 20 ? avg(b.slice(i - 20, i).map((x) => x.volume)) : null;
  for (const c of crits) {
    if (!c.enabled || c.weight <= 0) continue;
    total += c.weight;
    const inR = (x: number) => (c.min == null || x >= c.min) && (c.max == null || x <= c.max);
    let v: boolean | null = null;
    switch (c.type) {
      case 'rvolMin': v = vol20 ? b[i].volume / vol20 >= (c.min ?? 0) : null; break;
      case 'aboveSma20': { const s = sma(b, i, 20); v = s == null ? null : last > s; break; }
      case 'aboveSma50': { const s = sma(b, i, 50); v = s == null ? null : last > s; break; }
      case 'gapRange': v = i ? inR((b[i].open / b[i - 1].close - 1) * 100) : null; break;
      case 'rsRankMin': v = rsRank == null ? null : rsRank >= (c.min ?? 0); break;
      case 'atrPctRange': { const a = atr14(b, i); v = a == null ? null : inR((a / last) * 100); break; }
      case 'breakout20': v = i >= 20 ? last > Math.max(...b.slice(i - 20, i).map((x) => x.high)) : null; break;
      case 'breakout52w': v = i >= 252 ? last > Math.max(...b.slice(i - 252, i).map((x) => x.high)) : null; break;
      case 'volTrendMin': v = vol20 ? avg(b.slice(i - 4, i + 1).map((x) => x.volume)) / vol20 >= (c.min ?? 0) : null; break;
      case 'bullFlag': v = i >= 30 ? bullFlag(b.slice(Math.max(0, i - 59), i + 1)).ok : null; break;
      case 'cupHandle': v = i >= 60 ? cupHandle(b.slice(Math.max(0, i - 199), i + 1)).ok : null; break;
      case 'priceRange': v = inR(last); break;
      default: v = null; // catalyst, aboveVwap: no history for these
    }
    if (v == null) continue;
    checked += c.weight;
    if (v) passed += c.weight;
  }
  return { score: checked ? (passed / checked) * 100 : 0, checked, total };
}

export function stats(trades: BtTrade[]): BtStats {
  const rs = trades.map((t) => t.r), wins = rs.filter((r) => r > 0), losses = rs.filter((r) => r <= 0);
  let eq = 0, peak = 0, dd = 0;
  for (const r of rs) { eq += r; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
  const gw = wins.reduce((a, b) => a + b, 0), gl = -losses.reduce((a, b) => a + b, 0);
  return {
    n: rs.length, wins: wins.length, winRate: rs.length ? wins.length / rs.length : 0, avgR: rs.length ? avg(rs) : 0,
    avgWinR: wins.length ? avg(wins) : 0, avgLossR: losses.length ? avg(losses) : 0, profitFactor: gl > 0 ? gw / gl : null,
    totalR: eq, maxDdR: dd, avgDays: trades.length ? avg(trades.map((t) => t.days)) : 0,
  };
}

export function backtest(data: Record<string, Bar[]>, spy: Bar[] | undefined, crits: BtCrit[], rules: BtRules, warmup = 60): BtResult {
  const ranks = crits.some((c) => c.enabled && c.type === 'rsRankMin') ? rsRanks(data, spy) : new Map<string, Map<string, number>>();
  const trades: BtTrade[] = [];
  const skipped: string[] = [];
  let blocked = 0, from = '9999', to = '0000';
  for (const [sym, b] of Object.entries(data)) {
    if (b.length < warmup + 20) { skipped.push(sym); continue; }
    from = day(b[warmup].time) < from ? day(b[warmup].time) : from; to = day(b.at(-1)!.time) > to ? day(b.at(-1)!.time) : to;
    let busyUntil = -1;
    for (let i = warmup; i < b.length - 1; i++) {
      const sc = scoreDay(b, i, crits, ranks.get(day(b[i].time))?.get(sym) ?? null);
      if (sc.total === 0 || sc.checked / sc.total < 0.5 || sc.score < rules.minScore) continue;
      if (i < busyUntil) { blocked++; continue; } // already holding it
      const a = atr14(b, i);
      if (!a) continue;
      const entry = b[i + 1].open, risk = rules.stopAtr * a, stop = entry - risk, target = entry + rules.targetR * risk;
      let exit = NaN, why: BtTrade['why'] = 'end', k = i + 1;
      for (; k < b.length && k <= i + rules.maxDays; k++) {
        const x = b[k];
        if (k > i + 1 && x.open <= stop) { exit = x.open; why = 'gap-stop'; break; }
        if (x.low <= stop) { exit = stop; why = 'stop'; break; } // stop first when both are hit the same day (conservative)
        if (x.high >= target) { exit = k > i + 1 && x.open >= target ? x.open : target; why = 'target'; break; }
      }
      if (Number.isNaN(exit)) { k = Math.min(b.length - 1, i + rules.maxDays); exit = b[k].close; why = k === b.length - 1 && k < i + rules.maxDays ? 'end' : 'time'; }
      trades.push({ sym, signal: day(b[i].time), entryDay: day(b[i + 1].time), exitDay: day(b[k].time), entry, exit, r: (exit - entry) / risk, days: k - i, why, score: Math.round(sc.score) });
      busyUntil = k + 1;
    }
  }
  trades.sort((x, y) => (x.exitDay < y.exitDay ? -1 : x.exitDay > y.exitDay ? 1 : 0));
  let cum = 0;
  const curve = trades.map((t) => ({ day: t.exitDay, r: (cum += t.r) }));
  const syms = [...new Set(trades.map((t) => t.sym))];
  return { trades, stats: stats(trades), bySym: syms.map((s) => ({ sym: s, stats: stats(trades.filter((t) => t.sym === s)) })).sort((a, b) => b.stats.totalR - a.stats.totalR), curve, skipped, from, to, signalsBlocked: blocked };
}
