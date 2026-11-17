// Journal discipline helpers (pure, tested): three rules from Jai's list.
//  #2 Waiting is a position: log the setups you passed on.
//  #9 If a loss hurts, the size is too big: compare your risk per trade with what a loss does to you; halve it when losses keep hurting.
//  #10 Track how far price ran after you exited, so you can see whether you cut winners early (and whether keeping 10% running would have helped).
// Real daily prices only; hypothetical figures are labelled ESTIMATE. Reminders for your own discipline, never advice. Nothing here can trade.
export interface DBar { day: string; high: number; low: number; close: number }
export interface PostExit { sessions: number; runPct: number; endPct: number; endClose: number; peak: number }
/** After an exit: the best move in your direction within `n` sessions (peak), and where price stood on the last of those sessions. */
export function postExit(side: 'long' | 'short', exitPx: number, exitDay: string, bars: DBar[], n = 10): PostExit | null {
  const after = bars.filter((b) => b.day > exitDay).slice(0, n);
  if (!after.length || !(exitPx > 0)) return null;
  const long = side === 'long';
  const peak = long ? Math.max(...after.map((b) => b.high)) : Math.min(...after.map((b) => b.low));
  const endClose = after[after.length - 1].close;
  const pct = (px: number) => (long ? px / exitPx - 1 : exitPx / px - 1) * 100;
  return { sessions: after.length, runPct: Math.max(0, pct(peak)), endPct: pct(endClose), endClose, peak };
}
export interface ExitRow { id: string; sym: string; side: 'long' | 'short'; exitPx: number; qty: number; realized: number; win: boolean; res: PostExit | null }
export interface LeftSummary { n: number; withData: number; avgRun: number | null; avgEnd: number | null; ranPast5: number; keptRunning: number | null }
/** keptRunning: ESTIMATE of what holding 10% of each position to the end of the window (instead of selling it at the exit) would have added or cost. */
export function leftSummary(rows: ExitRow[], keep = 0.1): LeftSummary {
  const d = rows.filter((r) => r.res);
  const avg = (f: (r: ExitRow) => number) => (d.length ? d.reduce((a, r) => a + f(r), 0) / d.length : null);
  return {
    n: rows.length, withData: d.length, avgRun: avg((r) => r.res!.runPct), avgEnd: avg((r) => r.res!.endPct), ranPast5: d.filter((r) => r.res!.runPct >= 5).length,
    keptRunning: d.length ? d.reduce((a, r) => a + keep * r.qty * (r.side === 'long' ? r.res!.endClose - r.exitPx : r.exitPx - r.res!.endClose), 0) : null,
  };
}
export type Feel = 'fine' | 'annoyed' | 'hurt';
/** newest first. Two or more of the last three losses that hurt means: cut size until losses feel routine (halve the risk per trade). */
export function sizeAdvice(feelsNewestFirst: Feel[], riskPct: number): { cut: boolean; suggestPct: number; text: string } {
  const last = feelsNewestFirst.slice(0, 3);
  const hurt = last.filter((f) => f === 'hurt').length;
  const cut = hurt >= 2 || (last[0] === 'hurt' && last[1] === 'hurt');
  const suggestPct = Math.round((riskPct / 2) * 1000) / 1000;
  return { cut, suggestPct, text: cut ? `${hurt} of your last ${last.length} losses hurt. The rule: size down until a loss feels routine. That would be ${suggestPct}% risk per trade instead of ${riskPct}%.` : last.length ? 'Your recent losses did not hurt much. That is the point of sizing small.' : 'Mark how each loss felt, and the rule will check your size for you.' };
}
/** Risk per trade in dollars against the loss that would bother you. */
export function painCheck(equity: number | null, riskPct: number, painUsd: number | null): { riskUsd: number | null; over: boolean | null } {
  if (equity == null || !(equity > 0)) return { riskUsd: null, over: null };
  const riskUsd = (equity * riskPct) / 100;
  return { riskUsd, over: painUsd != null && painUsd > 0 ? riskUsd > painUsd : null };
}
export interface Pass { t: number; why: string }
export const PASS_REASONS = ['Price not at my zone', 'Not obvious: had to talk myself into it', 'Outside my trading hours', 'Chasing: it already moved', 'Timeframes disagreed'];
export function passCounts(passes: Pass[], tradeTimes: number[], now: number, dayOf: (ms: number) => string) {
  const today = dayOf(now), week = now - 7 * 86400_000;
  return { passToday: passes.filter((p) => dayOf(p.t) === today).length, tradesToday: tradeTimes.filter((t) => dayOf(t) === today).length, passWeek: passes.filter((p) => p.t >= week).length, tradesWeek: tradeTimes.filter((t) => t >= week).length };
}
