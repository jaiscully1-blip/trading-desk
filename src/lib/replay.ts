// Ghost exit: where your exit rules would have taken you out, simulated bar by bar after the entry.
import type { Bar } from '../types';
import type { TradeView } from './journal';

export interface ExitRules {
  stop: boolean; // initial stop
  targetR: number | null; // take profit at +N R
  trail: { on: boolean; startR: number; distR: number }; // once +startR, trail best price by distR
  timeStopMin: number | null; // exit at the close of the bar N minutes after entry
  eod: boolean; // flat by the session close
}
export const DEFAULT_RULES: ExitRules = { stop: true, targetR: 2, trail: { on: true, startR: 1, distR: 1 }, timeStopMin: 90, eod: true };

export type GhostReason = 'stop' | 'trail' | 'target' | 'time' | 'end of day' | 'end of data';
export interface Ghost { time: number; price: number; reason: GhostReason; r: number; pnl: number; barIndex: number }

const dayOf = (t: number) => Math.floor(t / 86400);
const minOf = (t: number) => Math.floor((t % 86400) / 60);

/**
 * Bars and entryEnc use the ET wall-clock encoding. Evaluation starts on the bar after the entry bar (no look-ahead
 * inside the entry bar). If stop and target are both inside one bar, the stop wins (conservative).
 */
export function simulateGhost(bars: Bar[], v: TradeView, entryEnc: number, rules: ExitRules, period: number): Ghost | null {
  const t = v.t;
  if (v.avgEntry == null || t.initialStop == null || !bars.length) return null;
  const s = t.side === 'long' ? 1 : -1;
  const entry = v.avgEntry;
  const R = Math.abs(entry - t.initialStop);
  if (!(R > 0)) return null;
  const qty = v.maxQty;
  const target = rules.targetR ? entry + s * rules.targetR * R : null;
  const start = bars.findIndex((b) => b.time + period > entryEnc);
  if (start < 0) return null;
  let best = entry;
  const out = (i: number, price: number, reason: GhostReason): Ghost => ({ time: bars[i].time, price, reason, r: (s * (price - entry)) / R, pnl: s * (price - entry) * qty, barIndex: i });

  for (let i = start + 1; i < bars.length; i++) {
    const b = bars[i];
    const fav = s === 1 ? b.high : b.low, adv = s === 1 ? b.low : b.high;
    // effective stop: initial, raised by the trail once the trade has run startR
    let stop = rules.stop ? t.initialStop : null;
    let trailing = false;
    if (rules.trail.on && s * (best - entry) >= rules.trail.startR * R) {
      const tr = best - s * rules.trail.distR * R;
      if (stop == null || s * (tr - stop) > 0) { stop = tr; trailing = true; }
    }
    if (stop != null && s * (adv - stop) <= 0) {
      const px = s * (b.open - stop) < 0 ? b.open : stop; // gapped through the stop: filled at the open
      return out(i, px, trailing ? 'trail' : 'stop');
    }
    if (target != null && s * (fav - target) >= 0) {
      const px = s * (b.open - target) > 0 ? b.open : target;
      return out(i, px, 'target');
    }
    best = s === 1 ? Math.max(best, b.high) : Math.min(best, b.low);
    if (rules.timeStopMin != null && b.time + period - entryEnc >= rules.timeStopMin * 60) return out(i, b.close, 'time');
    const next = bars[i + 1];
    const lastOfDay = period < 86400 && (!next || dayOf(next.time) !== dayOf(b.time) || minOf(b.time) + period / 60 >= 960);
    if (rules.eod && lastOfDay && dayOf(b.time) >= dayOf(entryEnc)) return out(i, b.close, 'end of day');
  }
  return out(bars.length - 1, bars[bars.length - 1].close, 'end of data');
}

/** Pick the finest resolution whose series covers the entry: 5m (≈10 sessions on Twelve Data free), else 1H, else daily. */
export function pickResolution(entryMs: number, first5m: number | null, first1h: number | null): '5m' | '1H' | 'D' {
  if (first5m != null && entryMs >= first5m) return '5m';
  if (first1h != null && entryMs >= first1h) return '1H';
  return 'D';
}
