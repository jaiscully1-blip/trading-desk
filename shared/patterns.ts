// Pattern lookup engine: candlestick signals + chart patterns, each with a plain-English, rule-written description.
// Pure functions over bars (daily or hourly). No AI, no network: $0.
import type { Bar } from './types.js';
import { bullFlag, cupHandle } from './scan.js';

export type Bias = 'bull' | 'bear' | 'neutral';

export interface CandleHit {
  kind: 'candle';
  id: string;
  name: string;
  bias: Bias;
  /** index of the last bar of the pattern */
  index: number;
  /** number of bars in the pattern (1-3) */
  span: number;
  text: string;
}

export interface PatternLine { a: [number, number]; b: [number, number]; role: 'support' | 'resistance' | 'neckline' | 'trend' | 'outline' }

export interface ChartHit {
  kind: 'chart';
  id: string;
  name: string;
  bias: Bias;
  start: number;
  end: number;
  lines: PatternLine[];
  status: 'forming' | 'confirmed' | 'failed';
  trigger?: number;
  stop?: number;
  target?: number;
  text: string;
}

export type Hit = CandleHit | ChartHit;

export interface PatternReport {
  candles: CandleHit[];
  charts: ChartHit[];
  summary: string;
  trend: Bias;
}

/* ---------------- helpers ---------------- */
const body = (b: Bar) => Math.abs(b.close - b.open);
const range = (b: Bar) => b.high - b.low;
const upper = (b: Bar) => b.high - Math.max(b.open, b.close);
const lower = (b: Bar) => Math.min(b.open, b.close) - b.low;
const isUp = (b: Bar) => b.close > b.open;
const isDown = (b: Bar) => b.close < b.open;
const mid = (b: Bar) => (b.open + b.close) / 2;
const $ = (v: number) => (v >= 1000 ? v.toFixed(0) : v >= 100 ? v.toFixed(2) : v.toFixed(2));

/** Average true range at index i (simple average of the last n true ranges). */
export function atrAt(bars: Bar[], i: number, n = 14): number {
  let s = 0, c = 0;
  for (let k = Math.max(1, i - n + 1); k <= i; k++) {
    const b = bars[k], p = bars[k - 1];
    s += Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close));
    c++;
  }
  return c ? s / c : range(bars[i]) || bars[i].close * 0.01;
}

/** Short-term trend into bar i: change over the prior 6 bars, measured in ATRs. */
function trendInto(bars: Bar[], i: number): Bias {
  if (i < 7) return 'neutral';
  const ch = bars[i - 1].close - bars[i - 7].close;
  const a = atrAt(bars, i - 1);
  return ch > 1.2 * a ? 'bull' : ch < -1.2 * a ? 'bear' : 'neutral';
}

/** Date label: daily bars are UTC midnight of the ET date; intraday bars are ET wall clock encoded as UTC. */
export function barLabel(t: number, intraday: boolean): string {
  const d = new Date(t * 1000);
  const md = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return intraday ? `${md} ${d.toISOString().slice(11, 16)}` : md;
}

/* ---------------- candlestick signals ---------------- */

const CANDLE_TEXT: Record<string, string> = {
  hammer: 'A hammer: after a pullback, sellers pushed price well down during the bar but buyers drove it back up to close near the high. It hints the selling is drying up. It is stronger if the next bar closes above the hammer’s high.',
  hangingMan: 'A hanging man: same shape as a hammer, but after a run-up. The long lower wick shows sellers tested lower; it is a warning, not a sell signal, until a later bar closes below its low.',
  invHammer: 'An inverted hammer: after a decline, buyers pushed price up during the bar but could not hold it. It is an early sign of buying interest that needs a follow-through close above its high.',
  shootingStar: 'A shooting star: after a run-up, price spiked higher then sold off to close near the low. Buyers got rejected at the top; a close below its low next bar confirms the stall.',
  doji: 'A doji: open and close almost equal. Buyers and sellers are in balance; after a strong move it often marks indecision before a pause or turn.',
  bullEngulf: 'A bullish engulfing: a green bar whose body swallows the prior red body. Buyers took control for the whole session; it is one of the more reliable reversal signals after a pullback.',
  bearEngulf: 'A bearish engulfing: a red bar whose body swallows the prior green body. Sellers took over the whole session; after a run-up it often starts a pullback.',
  morningStar: 'A morning star: a big red bar, a small indecision bar, then a strong green bar closing into the first bar’s body. A three-bar bottoming signal after a decline.',
  eveningStar: 'An evening star: a big green bar, a small indecision bar, then a strong red bar closing into the first bar’s body. A three-bar topping signal after a rally.',
  piercing: 'A piercing line: after a red bar, price opened lower but closed above the middle of that red bar. Buyers stepped in hard; watch for follow-through.',
  darkCloud: 'A dark cloud cover: after a green bar, price opened higher but closed below the middle of that green bar. Sellers stepped in; watch for follow-through lower.',
  soldiers: 'Three white soldiers: three strong green bars in a row, each closing higher. Steady buying pressure; often seen at the start of a new leg up.',
  crows: 'Three black crows: three strong red bars in a row, each closing lower. Steady selling pressure; often seen at the start of a new leg down.',
  bullHarami: 'A bullish harami: a small green body tucked inside the prior big red body. The selling momentum has stalled; it needs confirmation.',
  bearHarami: 'A bearish harami: a small red body tucked inside the prior big green body. The buying momentum has stalled; it needs confirmation.',
  bullMarubozu: 'A bullish marubozu: a big green bar with almost no wicks. Buyers were in control from open to close.',
  bearMarubozu: 'A bearish marubozu: a big red bar with almost no wicks. Sellers were in control from open to close.',
};

const CANDLE_NAME: Record<string, string> = {
  hammer: 'Hammer', hangingMan: 'Hanging man', invHammer: 'Inverted hammer', shootingStar: 'Shooting star', doji: 'Doji',
  bullEngulf: 'Bullish engulfing', bearEngulf: 'Bearish engulfing', morningStar: 'Morning star', eveningStar: 'Evening star',
  piercing: 'Piercing line', darkCloud: 'Dark cloud cover', soldiers: 'Three white soldiers', crows: 'Three black crows',
  bullHarami: 'Bullish harami', bearHarami: 'Bearish harami', bullMarubozu: 'Bullish marubozu', bearMarubozu: 'Bearish marubozu',
};
const CANDLE_BIAS: Record<string, Bias> = {
  hammer: 'bull', hangingMan: 'bear', invHammer: 'bull', shootingStar: 'bear', doji: 'neutral', bullEngulf: 'bull', bearEngulf: 'bear',
  morningStar: 'bull', eveningStar: 'bear', piercing: 'bull', darkCloud: 'bear', soldiers: 'bull', crows: 'bear',
  bullHarami: 'bull', bearHarami: 'bear', bullMarubozu: 'bull', bearMarubozu: 'bear',
};

/** Which candlestick signal (if any) completes at bar i. Multi-bar patterns win over single-bar ones. */
export function candleAt(bars: Bar[], i: number): string | null {
  if (i < 2) return null;
  const b = bars[i], p = bars[i - 1], pp = bars[i - 2];
  const a = atrAt(bars, i);
  const tr = trendInto(bars, i);
  const big = (x: Bar) => body(x) >= 0.6 * a;
  const small = (x: Bar) => body(x) <= 0.3 * a;

  // three-bar
  if (i >= 3) {
    const tr3 = trendInto(bars, i - 2);
    if (tr3 === 'bear' && isDown(pp) && big(pp) && small(p) && isUp(b) && b.close > mid(pp) && Math.max(p.open, p.close) < pp.open) return 'morningStar';
    if (tr3 === 'bull' && isUp(pp) && big(pp) && small(p) && isDown(b) && b.close < mid(pp) && Math.min(p.open, p.close) > pp.open) return 'eveningStar';
    const three = [pp, p, b];
    const q = bars[i - 3]; // only the first three bars of a run count (not every bar of a long trend)
    if (three.every((x) => isUp(x) && body(x) >= 0.5 * a && upper(x) <= 0.35 * body(x)) && p.close > pp.close && b.close > p.close && p.open > pp.open && b.open > p.open && p.open <= pp.close && b.open <= p.close && !(isUp(q) && body(q) >= 0.5 * a && q.close < pp.close)) return 'soldiers';
    if (three.every((x) => isDown(x) && body(x) >= 0.5 * a && lower(x) <= 0.35 * body(x)) && p.close < pp.close && b.close < p.close && p.open < pp.open && b.open < p.open && p.open >= pp.close && b.open >= p.close && !(isDown(q) && body(q) >= 0.5 * a && q.close > pp.close)) return 'crows';
  }
  // two-bar
  if (isDown(p) && isUp(b) && b.open <= p.close && b.close >= p.open && body(b) > body(p) && body(b) >= 0.4 * a && tr !== 'bull') return 'bullEngulf';
  if (isUp(p) && isDown(b) && b.open >= p.close && b.close <= p.open && body(b) > body(p) && body(b) >= 0.4 * a && tr !== 'bear') return 'bearEngulf';
  if (tr === 'bear' && isDown(p) && big(p) && isUp(b) && b.open < p.low && b.close > mid(p) && b.close < p.open) return 'piercing';
  if (tr === 'bull' && isUp(p) && big(p) && isDown(b) && b.open > p.high && b.close < mid(p) && b.close > p.open) return 'darkCloud';
  if (tr === 'bear' && isDown(p) && big(p) && isUp(b) && body(b) <= 0.5 * body(p) && b.open > p.close && b.close < p.open) return 'bullHarami';
  if (tr === 'bull' && isUp(p) && big(p) && isDown(b) && body(b) <= 0.5 * body(p) && b.open < p.close && b.close > p.open) return 'bearHarami';
  // one-bar
  const r = range(b);
  if (r < 0.4 * a || r === 0) return null;
  const bd = body(b), lw = lower(b), uw = upper(b);
  if (bd >= 0.9 * r && r >= 1.3 * a) return isUp(b) ? 'bullMarubozu' : 'bearMarubozu';
  if (lw >= 2 * bd && lw >= 0.55 * r && uw <= 0.15 * r) return tr === 'bear' ? 'hammer' : tr === 'bull' ? 'hangingMan' : null;
  if (uw >= 2 * bd && uw >= 0.55 * r && lw <= 0.15 * r) return tr === 'bear' ? 'invHammer' : tr === 'bull' ? 'shootingStar' : null;
  if (bd <= 0.08 * r && r >= 0.7 * a && tr !== 'neutral') return 'doji';
  return null;
}

export function findCandles(bars: Bar[], lookback = 25, intraday = false): CandleHit[] {
  const out: CandleHit[] = [];
  for (let i = Math.max(2, bars.length - lookback); i < bars.length; i++) {
    const id = candleAt(bars, i);
    if (!id) continue;
    const span = ['morningStar', 'eveningStar', 'soldiers', 'crows'].includes(id) ? 3 : ['bullEngulf', 'bearEngulf', 'piercing', 'darkCloud', 'bullHarami', 'bearHarami'].includes(id) ? 2 : 1;
    // later bars tell us whether it worked
    const after = bars.slice(i + 1);
    const b = bars[i];
    let follow = '';
    if (after.length) {
      const bias = CANDLE_BIAS[id];
      if (bias === 'bull') follow = after.some((x) => x.close > b.high) ? ' It has since confirmed with a close above its high.' : after.some((x) => x.close < Math.min(...bars.slice(i - span + 1, i + 1).map((y) => y.low))) ? ' It has since failed: price closed below its low.' : ' Not confirmed yet.';
      if (bias === 'bear') follow = after.some((x) => x.close < b.low) ? ' It has since confirmed with a close below its low.' : after.some((x) => x.close > Math.max(...bars.slice(i - span + 1, i + 1).map((y) => y.high))) ? ' It has since failed: price closed above its high.' : ' Not confirmed yet.';
    } else follow = ' It formed on the latest bar, so there is no follow-through yet.';
    out.push({ kind: 'candle', id, name: CANDLE_NAME[id], bias: CANDLE_BIAS[id], index: i, span, text: `${barLabel(b.time, intraday)}: ${CANDLE_TEXT[id]}${follow}` });
  }
  return out.reverse(); // newest first
}

/* ---------------- swing pivots + lines ---------------- */

export interface Pivot { i: number; p: number }
export function pivots(bars: Bar[], k = 3): { highs: Pivot[]; lows: Pivot[] } {
  const highs: Pivot[] = [], lows: Pivot[] = [];
  for (let i = k; i < bars.length - k; i++) {
    let hi = true, lo = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (bars[j].high > bars[i].high || (j < i && bars[j].high === bars[i].high)) hi = false;
      if (bars[j].low < bars[i].low || (j < i && bars[j].low === bars[i].low)) lo = false;
    }
    if (hi) highs.push({ i, p: bars[i].high });
    if (lo) lows.push({ i, p: bars[i].low });
  }
  return { highs, lows };
}

/** Least-squares line through points. */
export function fitLine(pts: Pivot[]): { m: number; c: number; at: (x: number) => number; maxResid: number } {
  const n = pts.length;
  const mx = pts.reduce((s, q) => s + q.i, 0) / n, my = pts.reduce((s, q) => s + q.p, 0) / n;
  let num = 0, den = 0;
  for (const q of pts) { num += (q.i - mx) * (q.p - my); den += (q.i - mx) ** 2; }
  const m = den ? num / den : 0, c = my - m * mx;
  const at = (x: number) => m * x + c;
  return { m, c, at, maxResid: Math.max(...pts.map((q) => Math.abs(q.p - at(q.i)))) };
}

const lineAt = (l: PatternLine, x: number) => l.a[1] + ((l.b[1] - l.a[1]) * (x - l.a[0])) / (l.b[0] - l.a[0] || 1);

/* ---------------- chart patterns ---------------- */

function doubleTopBottom(bars: Bar[], piv: { highs: Pivot[]; lows: Pivot[] }, top: boolean, intraday: boolean): ChartHit | null {
  const n = bars.length;
  const ps = top ? piv.highs : piv.lows;
  const a = atrAt(bars, n - 1);
  for (let j = ps.length - 1; j >= 1 && ps[j].i >= n - 45; j--) {
    for (let k = j - 1; k >= 0 && ps[j].i - ps[k].i <= 80; k--) {
      const A = ps[k], B = ps[j];
      if (B.i - A.i < 8) continue;
      const aB = atrAt(bars, B.i); // volatility at the second touch, not after a later sell-off
      if (Math.abs(A.p - B.p) > Math.min(0.03 * A.p, Math.max(0.015 * A.p, 0.8 * aB))) continue;
      const between = bars.slice(A.i + 1, B.i);
      const extreme = top ? Math.max(A.p, B.p) : Math.min(A.p, B.p);
      if (top ? between.some((x) => x.high > extreme * 1.005) : between.some((x) => x.low < extreme * 0.995)) continue;
      const neck = top ? Math.min(...between.map((x) => x.low)) : Math.max(...between.map((x) => x.high));
      const depth = Math.abs(extreme - neck);
      if (depth < 2.5 * aB || depth < 0.03 * extreme) continue;
      const after = bars.slice(B.i + 1);
      // invalid if price already blew through the tops/bottoms by a clear margin
      if (top ? after.some((x) => x.close > extreme + 0.5 * a) : after.some((x) => x.close < extreme - 0.5 * a)) continue;
      const confirmed = top ? after.some((x) => x.close < neck) : after.some((x) => x.close > neck);
      const target = top ? neck - depth : neck + depth;
      const ni = between.findIndex((x) => (top ? x.low : x.high) === neck) + A.i + 1;
      const name = top ? 'Double top' : 'Double bottom';
      const dA = barLabel(bars[A.i].time, intraday), dB = barLabel(bars[B.i].time, intraday);
      const text = top
        ? `Price topped at $${$(A.p)} (${dA}) and again at $${$(B.p)} (${dB}) and was turned away both times. The low between them, $${$(neck)}, is the neckline. ${confirmed ? `Price has closed below it, which confirms the pattern; the usual measured-move target is $${$(target)}.` : `A close below $${$(neck)} would confirm it and points to about $${$(target)}.`} It is invalid if price closes above $${$(extreme)}.`
        : `Price bottomed at $${$(A.p)} (${dA}) and again at $${$(B.p)} (${dB}) and buyers held it both times. The high between them, $${$(neck)}, is the neckline. ${confirmed ? `Price has closed above it, which confirms the pattern; the usual measured-move target is $${$(target)}.` : `A close above $${$(neck)} would confirm it and points to about $${$(target)}.`} It is invalid if price closes below $${$(extreme)}.`;
      return {
        kind: 'chart', id: top ? 'doubleTop' : 'doubleBottom', name, bias: top ? 'bear' : 'bull', start: A.i, end: n - 1, status: confirmed ? 'confirmed' : 'forming',
        lines: [
          { a: [A.i, extreme], b: [B.i, extreme], role: top ? 'resistance' : 'support' },
          { a: [A.i, neck], b: [n - 1, neck], role: 'neckline' },
          { a: [A.i, A.p], b: [ni, neck], role: 'outline' }, { a: [ni, neck], b: [B.i, B.p], role: 'outline' },
        ],
        trigger: neck, stop: extreme, target, text,
      };
    }
  }
  return null;
}

function headShoulders(bars: Bar[], piv: { highs: Pivot[]; lows: Pivot[] }, inverse: boolean, intraday: boolean): ChartHit | null {
  const n = bars.length;
  const ps = inverse ? piv.lows : piv.highs;
  const a = atrAt(bars, n - 1);
  const sgn = inverse ? -1 : 1;
  for (let j = ps.length - 1; j >= 2 && ps[j].i >= n - 40; j--) {
    const L = ps[j - 2], H = ps[j - 1], R = ps[j];
    if (sgn * (H.p - L.p) < a || sgn * (H.p - R.p) < a) continue;
    if (Math.abs(L.p - R.p) > 2 * a) continue;
    if (R.i - L.i < 10 || R.i - L.i > 120) continue;
    const seg1 = bars.slice(L.i + 1, H.i), seg2 = bars.slice(H.i + 1, R.i);
    if (!seg1.length || !seg2.length) continue;
    const pick = (seg: Bar[], off: number) => {
      let bi = 0;
      seg.forEach((x, q) => { if (inverse ? x.high > seg[bi].high : x.low < seg[bi].low) bi = q; });
      return { i: off + bi, p: inverse ? seg[bi].high : seg[bi].low };
    };
    const t1 = pick(seg1, L.i + 1), t2 = pick(seg2, H.i + 1);
    const neck: PatternLine = { a: [t1.i, t1.p], b: [t2.i, t2.p], role: 'neckline' };
    const after = bars.slice(R.i + 1);
    if (inverse ? after.some((x) => x.low < H.p) : after.some((x) => x.high > H.p)) continue;
    const neckEnd = lineAt(neck, n - 1);
    const height = Math.abs(H.p - lineAt(neck, H.i));
    const confirmed = after.some((x, q) => (inverse ? x.close > lineAt(neck, R.i + 1 + q) : x.close < lineAt(neck, R.i + 1 + q)));
    const target = inverse ? neckEnd + height : neckEnd - height;
    const name = inverse ? 'Inverse head and shoulders' : 'Head and shoulders';
    const dH = barLabel(bars[H.i].time, intraday);
    const text = inverse
      ? `Three lows: a deeper “head” at $${$(H.p)} (${dH}) between two shallower “shoulders” near $${$(L.p)} and $${$(R.p)}. Each sell-off got bought sooner. The neckline across the two rally highs sits near $${$(neckEnd)} now. ${confirmed ? `Price has closed above it: confirmed, with a measured target near $${$(target)}.` : `A close above the neckline confirms it; the measured target is about $${$(target)}.`} Invalid below the right shoulder ($${$(R.p)}).`
      : `Three highs: a taller “head” at $${$(H.p)} (${dH}) between two lower “shoulders” near $${$(L.p)} and $${$(R.p)}. Each rally topped out lower. The neckline across the two pullback lows sits near $${$(neckEnd)} now. ${confirmed ? `Price has closed below it: confirmed, with a measured target near $${$(target)}.` : `A close below the neckline confirms it; the measured target is about $${$(target)}.`} Invalid above the right shoulder ($${$(R.p)}).`;
    return {
      kind: 'chart', id: inverse ? 'invHS' : 'hs', name, bias: inverse ? 'bull' : 'bear', start: L.i, end: n - 1, status: confirmed ? 'confirmed' : 'forming',
      lines: [
        { ...neck, b: [n - 1, neckEnd] },
        { a: [L.i, L.p], b: [t1.i, t1.p], role: 'outline' }, { a: [t1.i, t1.p], b: [H.i, H.p], role: 'outline' },
        { a: [H.i, H.p], b: [t2.i, t2.p], role: 'outline' }, { a: [t2.i, t2.p], b: [R.i, R.p], role: 'outline' },
      ],
      trigger: neckEnd, stop: R.p, target, text,
    };
  }
  return null;
}

function triangle(bars: Bar[], intraday: boolean): ChartHit | null {
  const n = bars.length;
  if (n < 30) return null;
  const w0 = Math.max(0, n - 60);
  const win = bars.slice(w0);
  const pv = pivots(win, 3);
  const hs = pv.highs.slice(-4).map((q) => ({ i: q.i + w0, p: q.p }));
  const ls = pv.lows.slice(-4).map((q) => ({ i: q.i + w0, p: q.p }));
  if (hs.length < 2 || ls.length < 2) return null;
  if (Math.max(hs.at(-1)!.i, ls.at(-1)!.i) < n - 15) return null;
  const a = atrAt(bars, n - 1);
  const up = fitLine(hs), lo = fitLine(ls);
  if (up.maxResid > 0.8 * a || lo.maxResid > 0.8 * a) return null;
  const s = Math.min(hs[0].i, ls[0].i);
  const wS = up.at(s) - lo.at(s), wE = up.at(n - 1) - lo.at(n - 1);
  if (wS <= 0 || wE <= 0 || wS < 1.4 * wE || wS < 3 * a) return null;
  const flatTol = 0.6 * a / Math.max(1, n - 1 - s); // drift under ~0.6 ATR over the whole pattern counts as flat
  const flatTop = Math.abs(up.m) <= flatTol, flatBot = Math.abs(lo.m) <= flatTol;
  let id: 'ascTri' | 'descTri' | 'symTri' | null = null;
  if (flatTop && lo.m > flatTol) id = 'ascTri';
  else if (flatBot && up.m < -flatTol) id = 'descTri';
  else if (up.m < -flatTol && lo.m > flatTol) id = 'symTri';
  if (!id) return null;
  // the latest bars must still be near the pattern (inside, or a fresh break)
  const last = bars[n - 1];
  const uE = up.at(n - 1), lE = lo.at(n - 1);
  if (last.close > uE + 2 * a || last.close < lE - 2 * a) return null;
  const brokeUp = last.close > uE, brokeDn = last.close < lE;
  const bias: Bias = id === 'ascTri' ? 'bull' : id === 'descTri' ? 'bear' : brokeUp ? 'bull' : brokeDn ? 'bear' : 'neutral';
  const name = id === 'ascTri' ? 'Ascending triangle' : id === 'descTri' ? 'Descending triangle' : 'Symmetrical triangle';
  const status = (bias === 'bull' && brokeUp) || (bias === 'bear' && brokeDn) ? 'confirmed' : (id === 'ascTri' && brokeDn) || (id === 'descTri' && brokeUp) ? 'failed' : 'forming';
  const trigger = bias === 'bear' ? lE : uE;
  const target = bias === 'bear' ? lE - wS : uE + wS;
  const desc = id === 'ascTri'
    ? `Sellers keep defending about $${$(uE)} (flat top) while buyers step in at higher and higher lows (rising bottom line). That squeeze usually resolves upward.`
    : id === 'descTri'
      ? `Buyers keep defending about $${$(lE)} (flat bottom) while each bounce tops out lower (falling top line). That squeeze usually resolves downward.`
      : `Highs are falling and lows are rising, so price is coiling between $${$(lE)} and $${$(uE)}. The break direction decides the trade.`;
  const plan = status === 'confirmed' ? ` Price has broken out ${brokeUp ? 'above' : 'below'} the pattern; the measured move (the triangle’s starting height, ${$(wS)}) points to about $${$(target)}.`
    : status === 'failed' ? ` It broke the wrong way, which cancels the usual read.`
      : id === 'symTri' ? ` A close above $${$(uE)} targets about $${$(uE + wS)}; a close below $${$(lE)} targets about $${$(lE - wS)}.`
        : ` A close ${bias === 'bear' ? 'below' : 'above'} $${$(trigger)} confirms it; the measured move points to about $${$(target)}.`;
  return {
    kind: 'chart', id, name, bias, start: s, end: n - 1, status,
    lines: [
      { a: [s, up.at(s)], b: [n - 1, uE], role: 'resistance' },
      { a: [s, lo.at(s)], b: [n - 1, lE], role: 'support' },
    ],
    trigger, stop: bias === 'bear' ? uE : lE, target, text: `${desc}${plan} Started ${barLabel(bars[s].time, intraday)}.`,
  };
}

function flagAndCup(bars: Bar[], intraday: boolean): ChartHit[] {
  const out: ChartHit[] = [];
  const n = bars.length;
  const last = bars[n - 1];
  const f = bullFlag(bars);
  if (f.ok && f.points) {
    const [ps, pt] = f.points;
    const pole = bars[pt].high - bars[ps].low;
    const flagLow = Math.min(...bars.slice(pt + 1).map((b) => b.low));
    const confirmed = last.close > f.trigger!;
    out.push({
      kind: 'chart', id: 'bullFlag', name: 'Bull flag', bias: 'bull', start: ps, end: n - 1, status: confirmed ? 'confirmed' : 'forming',
      lines: [
        { a: [ps, bars[ps].low], b: [pt, bars[pt].high], role: 'outline' },
        { a: [pt, f.trigger!], b: [n - 1, f.trigger!], role: 'resistance' },
        { a: [pt, flagLow], b: [n - 1, flagLow], role: 'support' },
      ],
      trigger: f.trigger, stop: flagLow, target: f.trigger! + pole,
      text: `A sharp run (the “pole”, $${$(bars[ps].low)} → $${$(bars[pt].high)} from ${barLabel(bars[ps].time, intraday)}) followed by a tight, lighter-volume pause (the “flag”, ${f.detail}). Momentum traders buy the break of the flag high. ${confirmed ? `Price has closed above $${$(f.trigger!)}: breakout underway.` : `Trigger: a close above $${$(f.trigger!)} on rising volume.`} Stop below the flag low ($${$(flagLow)}); a full pole-length move points to about $${$(f.trigger! + pole)}.`,
    });
  }
  const c = cupHandle(bars);
  if (c.ok && c.points) {
    const [l, lowI, r, hl] = c.points;
    const depth = c.trigger! - bars[lowI].low;
    const confirmed = last.close > c.trigger!;
    out.push({
      kind: 'chart', id: 'cupHandle', name: 'Cup and handle', bias: 'bull', start: l, end: n - 1, status: confirmed ? 'confirmed' : 'forming',
      lines: [
        { a: [l, bars[l].high], b: [lowI, bars[lowI].low], role: 'outline' },
        { a: [lowI, bars[lowI].low], b: [r, bars[r].high], role: 'outline' },
        { a: [l, c.trigger!], b: [n - 1, c.trigger!], role: 'resistance' },
        { a: [r, bars[r].high], b: [hl, bars[hl].low], role: 'outline' },
      ],
      trigger: c.trigger, stop: bars[hl].low, target: c.trigger! + depth,
      text: `A rounded base (${c.detail}) that took sellers out slowly, then a small handle pullback near the old high. ${confirmed ? `Price has closed above the rim ($${$(c.trigger!)}): breakout underway.` : `Trigger: a close above the rim at $${$(c.trigger!)}.`} Stop under the handle low ($${$(bars[hl].low)}); the cup depth added to the rim points to about $${$(c.trigger! + depth)}.`,
    });
  }
  return out;
}

export function findChartPatterns(bars: Bar[], intraday = false): ChartHit[] {
  if (bars.length < 30) return [];
  const recent = bars.length > 200 ? bars.length - 200 : 0; // patterns are judged on the last ~200 bars
  const bs = bars.slice(recent);
  const piv = pivots(bs, 3);
  const hits = [
    headShoulders(bs, piv, false, intraday), headShoulders(bs, piv, true, intraday),
    doubleTopBottom(bs, piv, true, intraday), doubleTopBottom(bs, piv, false, intraday),
    triangle(bs, intraday), ...flagAndCup(bs, intraday),
  ].filter((h): h is ChartHit => !!h)
    // a head-and-shoulders already explains the same swing as an overlapping double top/bottom; keep the richer read
    .filter((h, _, all) => !((h.id === 'doubleTop' && all.some((x) => x.id === 'hs' && x.start <= h.end && h.start <= x.end)) || (h.id === 'doubleBottom' && all.some((x) => x.id === 'invHS' && x.start <= h.end && h.start <= x.end))));
  // shift indexes back to the full array
  return hits.map((h) => ({ ...h, start: h.start + recent, end: h.end + recent, lines: h.lines.map((l) => ({ ...l, a: [l.a[0] + recent, l.a[1]] as [number, number], b: [l.b[0] + recent, l.b[1]] as [number, number] })) }))
    .sort((x, y) => y.start - x.start);
}

/* ---------------- report ---------------- */

const smaLast = (bars: Bar[], n: number) => (bars.length >= n ? bars.slice(-n).reduce((s, b) => s + b.close, 0) / n : NaN);

export function analyze(bars: Bar[], sym: string, intraday = false): PatternReport {
  if (bars.length < 30) return { candles: [], charts: [], trend: 'neutral', summary: `Not enough history for ${sym} (${bars.length} bars; need 30+).` };
  const candles = findCandles(bars, 25, intraday);
  const charts = findChartPatterns(bars, intraday);
  const last = bars.at(-1)!;
  const s20 = smaLast(bars, 20), s50 = smaLast(bars, 50);
  const ch20 = bars.length > 20 ? (last.close / bars[bars.length - 21].close - 1) * 100 : NaN;
  const above = (v: number) => (Number.isFinite(v) ? (last.close > v ? 'above' : 'below') : null);
  const trend: Bias = Number.isFinite(s50) ? (last.close > s20 && s20 > s50 ? 'bull' : last.close < s20 && s20 < s50 ? 'bear' : 'neutral') : 'neutral';
  const unit = intraday ? 'hourly bars' : 'days';
  const parts = [
    `${sym} closed at $${$(last.close)}${Number.isFinite(ch20) ? `, ${ch20 >= 0 ? 'up' : 'down'} ${Math.abs(ch20).toFixed(1)}% over the last 20 ${unit}` : ''}.`,
    above(s20) && above(s50) ? `It is ${above(s20)} its 20-${intraday ? 'bar' : 'day'} average and ${above(s50)} its 50-${intraday ? 'bar' : 'day'} average, so the trend reads ${trend === 'bull' ? 'up' : trend === 'bear' ? 'down' : 'mixed'}.` : '',
    charts.length ? `Chart patterns: ${charts.map((c) => `${c.name.toLowerCase()} (${c.status})`).join(', ')}.` : 'No clean chart pattern right now.',
    candles.length ? `Latest candle signal: ${candles[0].name.toLowerCase()} on ${barLabel(bars[candles[0].index].time, intraday)}.` : 'No candlestick signal in the last 25 bars.',
  ];
  return { candles, charts, trend, summary: parts.filter(Boolean).join(' ') };
}
