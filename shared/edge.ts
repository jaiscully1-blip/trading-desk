// Poker math for trades: every setup is a bet. "Equity" = how often this stock's own history hit the target before the stop
// in the same trend state; "pot odds" = the win rate the reward:risk needs to break even; edge = equity − pot odds.
import type { Bar } from './types.js';

export interface BetOdds {
  side: 'long' | 'short'; state: string; n: number; wins: number; winPct: number; lowPct: number; requiredPct: number;
  evR: number; rr: number; entry: number; stop: number; target: number; call: 'raise' | 'call' | 'fold' | 'too few hands'; halfKellyPct: number;
}

function atr(bars: Bar[], i: number, n = 14) {
  let s = 0, c = 0;
  for (let k = Math.max(1, i - n + 1); k <= i; k++) { const b = bars[k], p = bars[k - 1]; s += Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close)); c++; }
  return c ? s / c : NaN;
}
const sma = (bars: Bar[], i: number, n: number) => { if (i + 1 < n) return NaN; let s = 0; for (let k = i - n + 1; k <= i; k++) s += bars[k].close; return s / n; };
/** Trend state of a bar: which side of the 20- and 50-day averages it closed on. */
export function stateAt(bars: Bar[], i: number): string {
  const c = bars[i].close, a = sma(bars, i, 20), b = sma(bars, i, 50);
  if (!Number.isFinite(b)) return 'unknown';
  return `${c >= a ? 'above' : 'below'} 20-day, ${c >= b ? 'above' : 'below'} 50-day`;
}
/** Wilson score lower bound (90%) for a win rate: a cautious estimate given the sample size. */
export function wilsonLow(wins: number, n: number, z = 1.645): number {
  if (!n) return 0;
  const p = wins / n, d = 1 + (z * z) / n;
  return ((p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d) * 100;
}

/** Replay every past day in today's trend state: enter at the close, stop 1.5 ATR away, target `rr`× that, give it `maxDays`.
 *  Same-day stop and target counts as a loss (the cautious read). Unfinished bets are marked to market in R. */
export function historicalOdds(bars: Bar[], side: 'long' | 'short', rr = 2, stopAtr = 1.5, maxDays = 20): BetOdds | null {
  const n = bars.length;
  if (n < 80) return null;
  const now = n - 1, state = stateAt(bars, now);
  const dir = side === 'long' ? 1 : -1;
  let count = 0, wins = 0, sumR = 0;
  for (let i = 50; i < n - 1 - 1; i++) {
    if (stateAt(bars, i) !== state) continue;
    const a = atr(bars, i);
    if (!(a > 0)) continue;
    const e = bars[i].close, risk = stopAtr * a, stop = e - dir * risk, tgt = e + dir * rr * risk;
    let r: number | null = null;
    for (let k = i + 1; k <= Math.min(n - 1, i + maxDays); k++) {
      const b = bars[k];
      const hitStop = dir > 0 ? b.low <= stop : b.high >= stop, hitTgt = dir > 0 ? b.high >= tgt : b.low <= tgt;
      if (hitStop) { r = -1; break; }
      if (hitTgt) { r = rr; break; }
    }
    if (r == null) { const k = Math.min(n - 1, i + maxDays); if (k - i < maxDays) continue; r = (dir * (bars[k].close - e)) / risk; }
    count++; sumR += r; if (r >= rr) wins++;
  }
  const a = atr(bars, now), e = bars[now].close, risk = stopAtr * a;
  const winPct = count ? (wins / count) * 100 : 0, requiredPct = 100 / (1 + rr), evR = count ? sumR / count : 0, lowPct = wilsonLow(wins, count);
  const p = winPct / 100, kellyFull = p - (1 - p) / rr;
  const call: BetOdds['call'] = count < 25 ? 'too few hands' : evR > 0.25 && lowPct > requiredPct ? 'raise' : evR > 0 ? 'call' : 'fold';
  return { side, state, n: count, wins, winPct, lowPct, requiredPct, evR, rr, entry: e, stop: e - dir * risk, target: e + dir * rr * risk, call, halfKellyPct: Math.max(0, kellyFull * 50) };
}

/** Best of long vs short for a stock (higher EV in R), so the board can rank every ticker on one scale. */
export function bestBet(bars: Bar[], rr = 2): BetOdds | null {
  const l = historicalOdds(bars, 'long', rr), s = historicalOdds(bars, 'short', rr);
  if (!l) return s; if (!s) return l;
  return l.evR >= s.evR ? l : s;
}
