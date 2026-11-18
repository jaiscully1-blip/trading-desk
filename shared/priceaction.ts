// Price-action reading for the chart game and Learn: swing structure (HH/HL/LH/LL), break of structure and change of
// character, fair value gaps and inverse FVGs, order blocks, resting liquidity (swing and equal highs/lows), liquidity
// sweeps, volume spikes, gaps, trend averages and RSI. read(bars, upTo) only looks at bars before `upTo`, so the game
// never leaks what happens after the hidden cut. explain() then describes what the hidden bars did, in chart terms.
// These are the definitions most chart traders use (several come from "smart money" vocabulary); none is a promise.
import type { Bar } from './types.js';
import { pivots } from './patterns.js';

export type Dir = 'bull' | 'bear';
export interface Swing { i: number; p: number; type: 'H' | 'L'; label: 'HH' | 'HL' | 'LH' | 'LL' | '' }
export interface StructEvt { i: number; kind: 'BOS' | 'CHoCH'; dir: Dir; level: number; from: number }
export interface Zone { kind: 'FVG' | 'OB'; dir: Dir; i: number; top: number; bot: number; touched: number | null; closedThrough: number | null; filled: number | null }
export interface Liq { kind: 'Swing high' | 'Swing low' | 'Equal highs' | 'Equal lows'; i: number; i2?: number; p: number; taken: number | null }
export interface Sweep { i: number; dir: Dir; level: number; kind: Liq['kind'] }
export interface PA {
  swings: Swing[]; events: StructEvt[]; zones: Zone[]; liq: Liq[]; sweeps: Sweep[];
  volSpikes: number[]; gaps: { i: number; dir: Dir; pct: number }[];
  ema20: (number | null)[]; sma50: (number | null)[]; atr: number[]; rsi: (number | null)[]; trend: Dir | 'range';
}

const K = 3; // bars each side for a swing pivot
export function emaArr(v: number[], n: number): (number | null)[] { const k = 2 / (n + 1); let e: number | null = null; return v.map((x, i) => { if (i < n - 1) return null; e = e == null ? v.slice(0, n).reduce((a, b) => a + b, 0) / n : x * k + e * (1 - k); return e; }); }
export function smaArr(v: number[], n: number): (number | null)[] { let s = 0; return v.map((x, i) => { s += x; if (i >= n) s -= v[i - n]; return i >= n - 1 ? s / n : null; }); }
export function atrArr(b: Bar[], n = 14): number[] { const tr = b.map((x, i) => (i ? Math.max(x.high - x.low, Math.abs(x.high - b[i - 1].close), Math.abs(x.low - b[i - 1].close)) : x.high - x.low)); let a = tr[0]; return tr.map((t, i) => (i ? (a = (a * (n - 1) + t) / n) : a)); }
export function rsiArr(v: number[], n = 14): (number | null)[] {
  let g = 0, l = 0; const out: (number | null)[] = [null];
  for (let i = 1; i < v.length; i++) { const d = v[i] - v[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= n) { g += up / n; l += dn / n; out.push(i === n ? 100 - 100 / (1 + g / (l || 1e-9)) : null); }
    else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; out.push(100 - 100 / (1 + g / (l || 1e-9))); } }
  return out;
}

export function read(all: Bar[], upTo = all.length): PA {
  const b = all.slice(0, upTo), closes = b.map((x) => x.close), atr = atrArr(b), n = b.length;
  // swings, labelled against the previous swing of the same type
  const pv = pivots(b, K), raw = [...pv.highs.map((p) => ({ ...p, type: 'H' as const })), ...pv.lows.map((p) => ({ ...p, type: 'L' as const }))].sort((a, c) => a.i - c.i);
  let lastH: number | null = null, lastL: number | null = null;
  const swings: Swing[] = raw.map((s) => { let label: Swing['label'] = ''; if (s.type === 'H') { if (lastH != null) label = s.p > lastH ? 'HH' : 'LH'; lastH = s.p; } else { if (lastL != null) label = s.p > lastL ? 'HL' : 'LL'; lastL = s.p; } return { i: s.i, p: s.p, type: s.type, label }; });
  // structure breaks: a close beyond the latest confirmed swing (confirmed K bars after it formed)
  const events: StructEvt[] = []; let trend: Dir | null = null; let brokenH = -1, brokenL = -1;
  for (let i = 0; i < n; i++) {
    const conf = swings.filter((s) => s.i + K <= i);
    const h = [...conf].reverse().find((s) => s.type === 'H'), l = [...conf].reverse().find((s) => s.type === 'L');
    if (h && h.i !== brokenH && b[i].close > h.p) { events.push({ i, kind: trend === 'bear' ? 'CHoCH' : 'BOS', dir: 'bull', level: h.p, from: h.i }); trend = 'bull'; brokenH = h.i; }
    if (l && l.i !== brokenL && b[i].close < l.p) { events.push({ i, kind: trend === 'bull' ? 'CHoCH' : 'BOS', dir: 'bear', level: l.p, from: l.i }); trend = 'bear'; brokenL = l.i; }
  }
  // fair value gaps (at least 0.1 ATR wide) and whether price later touched or closed through them (inverse FVG)
  const zones: Zone[] = [];
  for (let i = 2; i < n; i++) {
    const a = b[i - 2], c = b[i], min = 0.1 * atr[i];
    const dir: Dir | null = a.high < c.low && c.low - a.high >= min ? 'bull' : a.low > c.high && a.low - c.high >= min ? 'bear' : null;
    if (!dir) continue;
    const top = dir === 'bull' ? c.low : a.low, bot = dir === 'bull' ? a.high : c.high;
    let touched: number | null = null, through: number | null = null, filled: number | null = null;
    for (let j = i + 1; j < n && through == null; j++) { if (touched == null && (dir === 'bull' ? b[j].low <= top : b[j].high >= bot)) touched = j; if (filled == null && (dir === 'bull' ? b[j].low <= bot : b[j].high >= top)) filled = j; if (dir === 'bull' ? b[j].close < bot : b[j].close > top) through = j; }
    zones.push({ kind: 'FVG', dir, i: i - 1, top, bot, touched, closedThrough: through, filled });
  }
  // order blocks: the last opposite-colour candle before the move that broke structure
  for (const e of events) {
    for (let j = e.i - 1; j > Math.max(0, e.from - 8); j--) {
      const x = b[j];
      if (e.dir === 'bull' ? x.close < x.open : x.close > x.open) {
        let touched: number | null = null, through: number | null = null;
        for (let k = e.i + 1; k < n && through == null; k++) { if (touched == null && (e.dir === 'bull' ? b[k].low <= x.high : b[k].high >= x.low)) touched = k; if (e.dir === 'bull' ? b[k].close < x.low : b[k].close > x.high) through = k; }
        zones.push({ kind: 'OB', dir: e.dir, i: j, top: x.high, bot: x.low, touched, closedThrough: through, filled: through }); break;
      }
    }
  }
  // resting liquidity: swing highs/lows and equal highs/lows (within 0.15 ATR), and the bar that later took them
  const liq: Liq[] = [], sweeps: Sweep[] = [];
  const takenAt = (p: number, from: number, up: boolean) => { for (let j = from; j < n; j++) if (up ? b[j].high > p : b[j].low < p) return j; return null; };
  const hs = swings.filter((s) => s.type === 'H'), ls = swings.filter((s) => s.type === 'L');
  for (const s of hs) liq.push({ kind: 'Swing high', i: s.i, p: s.p, taken: takenAt(s.p, s.i + 1, true) });
  for (const s of ls) liq.push({ kind: 'Swing low', i: s.i, p: s.p, taken: takenAt(s.p, s.i + 1, false) });
  for (let k = 1; k < hs.length; k++) { const a = hs[k - 1], c = hs[k]; if (Math.abs(a.p - c.p) <= 0.15 * atr[c.i]) liq.push({ kind: 'Equal highs', i: a.i, i2: c.i, p: Math.max(a.p, c.p), taken: takenAt(Math.max(a.p, c.p), c.i + 1, true) }); }
  for (let k = 1; k < ls.length; k++) { const a = ls[k - 1], c = ls[k]; if (Math.abs(a.p - c.p) <= 0.15 * atr[c.i]) liq.push({ kind: 'Equal lows', i: a.i, i2: c.i, p: Math.min(a.p, c.p), taken: takenAt(Math.min(a.p, c.p), c.i + 1, false) }); }
  // a sweep: the bar that takes the level closes back on the other side of it
  for (const q of liq) if (q.taken != null) { const x = b[q.taken], up = q.kind.endsWith('high') || q.kind === 'Equal highs'; if (up ? x.close < q.p : x.close > q.p) sweeps.push({ i: q.taken, dir: up ? 'bear' : 'bull', level: q.p, kind: q.kind }); }
  const vavg = smaArr(b.map((x) => x.volume), 20);
  const volSpikes = b.map((x, i) => (vavg[i - 1] != null && x.volume > 2 * vavg[i - 1]! ? i : -1)).filter((i) => i >= 0);
  const gaps = b.map((x, i) => (i && x.open > b[i - 1].high ? { i, dir: 'bull' as Dir, pct: (x.open / b[i - 1].close - 1) * 100 } : i && x.open < b[i - 1].low ? { i, dir: 'bear' as Dir, pct: (x.open / b[i - 1].close - 1) * 100 } : null)).filter((g): g is { i: number; dir: Dir; pct: number } => !!g);
  const ema20 = emaArr(closes, 20), sma50 = smaArr(closes, 50), last = n - 1;
  const t: PA['trend'] = ema20[last] != null && sma50[last] != null ? (closes[last] > ema20[last]! && ema20[last]! > sma50[last]! ? 'bull' : closes[last] < ema20[last]! && ema20[last]! < sma50[last]! ? 'bear' : 'range') : 'range';
  return { swings, events, zones, liq, sweeps, volSpikes, gaps, ema20, sma50, atr, rsi: rsiArr(closes), trend: t };
}

/** Names of the price-action features visible near the cut, for the "on this chart" list. */
export function namesAt(pa: PA, cut: number, look = 30): string[] {
  const near = (i: number) => i > cut - look && i <= cut;
  const out = new Set<string>();
  for (const e of pa.events) if (near(e.i)) out.add(`${e.kind === 'BOS' ? 'Break of structure' : 'Change of character'} (${e.dir === 'bull' ? 'up' : 'down'})`);
  for (const z of pa.zones) if (near(z.i) || (z.closedThrough != null && near(z.closedThrough))) out.add(z.kind === 'OB' ? `${z.dir === 'bull' ? 'Bullish' : 'Bearish'} order block` : z.closedThrough != null && z.closedThrough <= cut ? 'Inverse FVG' : `${z.dir === 'bull' ? 'Bullish' : 'Bearish'} FVG`);
  for (const s of pa.sweeps) if (near(s.i)) out.add(`Liquidity sweep of ${s.kind.toLowerCase()}`);
  for (const q of pa.liq) if ((q.kind === 'Equal highs' || q.kind === 'Equal lows') && near(q.i2 ?? q.i) && (q.taken == null || q.taken > cut)) out.add(q.kind);
  for (const g of pa.gaps) if (near(g.i)) out.add(g.dir === 'bull' ? 'Gap up' : 'Gap down');
  if (pa.volSpikes.some(near)) out.add('Volume spike');
  return [...out];
}

const $ = (x: number) => x.toFixed(2);
/** Plain-English read of the chart at the cut, and of what the hidden bars did. */
export function explain(all: Bar[], cut: number, h: number): { before: string[]; after: string[]; takeaway: string } {
  const pre = read(all, cut + 1), post = read(all, Math.min(all.length, cut + h + 1));
  const c = all[cut], atr = pre.atr[cut], before: string[] = [], after: string[] = [];
  const e20 = pre.ema20[cut], s50 = pre.sma50[cut], rsi = pre.rsi[cut];
  before.push(pre.trend === 'bull' ? `Uptrend: price above a rising 20-day EMA (${$(e20!)}) that sits above the 50-day (${$(s50!)}).` : pre.trend === 'bear' ? `Downtrend: price below the 20-day EMA (${$(e20!)}), which is below the 50-day (${$(s50!)}).` : `No clean trend: price and the 20/50-day averages are mixed.`);
  if (e20 != null && atr) { const st = (c.close - e20) / atr; if (Math.abs(st) >= 2) before.push(`Stretched: ${Math.abs(st).toFixed(1)} ATR ${st > 0 ? 'above' : 'below'} the 20 EMA. Moves this far from the average often pause or snap back.`); }
  const lastEvt = pre.events.at(-1); if (lastEvt) before.push(`Last structure signal: ${lastEvt.kind === 'BOS' ? 'break of structure' : 'change of character'} ${lastEvt.dir === 'bull' ? 'up' : 'down'} ${cut - lastEvt.i} bars ago (close through ${$(lastEvt.level)}).`);
  const labels = pre.swings.slice(-4).map((s) => s.label).filter(Boolean); if (labels.length) before.push(`Recent swings: ${labels.join(' → ')}.`);
  const above = pre.liq.filter((q) => (q.taken == null || q.taken > cut) && q.p > c.close && (q.kind === 'Swing high' || q.kind === 'Equal highs')).sort((a, b) => a.p - b.p)[0];
  const below = pre.liq.filter((q) => (q.taken == null || q.taken > cut) && q.p < c.close && (q.kind === 'Swing low' || q.kind === 'Equal lows')).sort((a, b) => b.p - a.p)[0];
  if (above) before.push(`Liquidity above: ${above.kind.toLowerCase()} at ${$(above.p)} (${(((above.p / c.close) - 1) * 100).toFixed(1)}% away). Stops and breakout orders sit there.`);
  if (below) before.push(`Liquidity below: ${below.kind.toLowerCase()} at ${$(below.p)} (${(((below.p / c.close) - 1) * 100).toFixed(1)}% away).`);
  const openZ = pre.zones.filter((z) => z.closedThrough == null && z.i < cut);
  const zUp = openZ.filter((z) => z.bot > c.close).sort((a, b) => a.bot - b.bot)[0], zDn = openZ.filter((z) => z.top < c.close).sort((a, b) => b.top - a.top)[0];
  if (zUp) before.push(`Unfilled ${zUp.kind === 'OB' ? 'order block' : 'FVG'} above at ${$(zUp.bot)}–${$(zUp.top)}.`);
  if (zDn) before.push(`Unfilled ${zDn.kind === 'OB' ? 'order block' : 'FVG'} below at ${$(zDn.bot)}–${$(zDn.top)}.`);
  const ifvg = pre.zones.filter((z) => z.kind === 'FVG' && z.closedThrough != null && z.closedThrough > cut - 15 && z.closedThrough <= cut).at(-1);
  if (ifvg) before.push(`Inverse FVG: a ${ifvg.dir === 'bull' ? 'bullish' : 'bearish'} gap at ${$(ifvg.bot)}–${$(ifvg.top)} was closed through; traders now expect it to act as ${ifvg.dir === 'bull' ? 'resistance' : 'support'}.`);
  const sw = pre.sweeps.filter((s) => s.i > cut - 10).at(-1); if (sw) before.push(`Recent liquidity sweep: price ran the ${sw.kind.toLowerCase()} at ${$(sw.level)} and closed back ${sw.dir === 'bull' ? 'above' : 'below'} it ${cut - sw.i} bars ago.`);
  if (rsi != null) before.push(`RSI(14) ${rsi.toFixed(0)}${rsi >= 70 ? ': overbought territory' : rsi <= 30 ? ': oversold territory' : ''}.`);
  if (pre.volSpikes.includes(cut)) before.push('The last bar had more than twice normal volume.');

  // what the hidden bars did
  const end = all[Math.min(all.length - 1, cut + h)], seg = all.slice(cut + 1, cut + h + 1);
  const hi = Math.max(...seg.map((x) => x.high)), lo = Math.min(...seg.map((x) => x.low)), mv = (end.close / c.close - 1) * 100;
  after.push(`Closed ${mv >= 0 ? 'up' : 'down'} ${Math.abs(mv).toFixed(1)}%; the range was ${(((lo / c.close) - 1) * 100).toFixed(1)}% to +${(((hi / c.close) - 1) * 100).toFixed(1)}%.`);
  let take = '';
  if (above && hi > above.p) { const back = end.close < above.p; after.push(`It took the liquidity above at ${$(above.p)}${back ? ' and closed back below it (a sweep)' : ' and held above it (a breakout)'}.`); take ||= back ? 'Price ran the stops above the swing high, then reversed: a classic liquidity grab.' : 'Price broke through the liquidity above and kept going.'; }
  if (below && lo < below.p) { const back = end.close > below.p; after.push(`It took the liquidity below at ${$(below.p)}${back ? ' and closed back above it (a sweep)' : ' and stayed below it (a breakdown)'}.`); take ||= back ? 'Price ran the stops below the swing low, then reversed: a liquidity grab.' : 'Price broke the swing low and kept falling.'; }
  if (zUp && hi >= zUp.bot) { after.push(`It reached the ${zUp.kind === 'OB' ? 'order block' : 'FVG'} above (${$(zUp.bot)}–${$(zUp.top)})${end.close < zUp.bot ? ' and was rejected there' : ''}.`); take ||= `Price was drawn up into the open ${zUp.kind === 'OB' ? 'order block' : 'fair value gap'} above.`; }
  if (zDn && lo <= zDn.top) { after.push(`It came back into the ${zDn.kind === 'OB' ? 'order block' : 'FVG'} below (${$(zDn.bot)}–${$(zDn.top)})${end.close > zDn.top ? ' and bounced from it' : ''}.`); take ||= `Price returned to fill the ${zDn.kind === 'OB' ? 'order block' : 'fair value gap'} below.`; }
  const newEvt = post.events.filter((e) => e.i > cut); for (const e of newEvt.slice(0, 2)) after.push(`${e.kind === 'BOS' ? 'Break of structure' : 'Change of character'} ${e.dir === 'bull' ? 'up' : 'down'} on day ${e.i - cut} (close through ${$(e.level)}).`);
  if (newEvt[0]) take ||= newEvt[0].kind === 'CHoCH' ? `The trend flipped: a change of character ${newEvt[0].dir === 'bull' ? 'up' : 'down'}.` : `The ${newEvt[0].dir === 'bull' ? 'uptrend' : 'downtrend'} continued with a new break of structure.`;
  if (e20 != null) { const crossed = seg.some((x) => (c.close > e20 ? x.close < e20 : x.close > e20)); if (crossed) after.push(`It closed ${c.close > e20 ? 'below' : 'above'} the 20 EMA at least once.`); }
  const gaps = post.gaps.filter((g) => g.i > cut); if (gaps.length) after.push(`${gaps.length} gap${gaps.length > 1 ? 's' : ''} (${gaps.map((g) => `${g.pct >= 0 ? '+' : ''}${g.pct.toFixed(1)}%`).join(', ')}): often news or earnings.`);
  const spikes = post.volSpikes.filter((i) => i > cut); if (spikes.length) after.push(`Volume spiked above twice normal on ${spikes.length} day${spikes.length > 1 ? 's' : ''}: big participants were active.`);
  if (!take) take = pre.trend !== 'range' && (mv >= 0) === (pre.trend === 'bull') ? `Trend continuation: price kept moving with the ${pre.trend === 'bull' ? 'uptrend' : 'downtrend'}.` : pre.trend !== 'range' ? 'A pullback against the trend.' : Math.abs(mv) < 1 ? 'Sideways drift: no level was taken.' : `A ${mv >= 0 ? 'rally' : 'drop'} out of a range.`;
  return { before, after, takeaway: take };
}
