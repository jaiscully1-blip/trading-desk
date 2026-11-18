// Teaching diagrams: hand-made example candles (not market data) with the levels, zones and entries that define each
// pattern. Each diagram is a list of closes turned into candles, plus overlays the Learn cards draw on top.

export interface DCandle { o: number; h: number; l: number; c: number; v?: number }
export type Overlay =
  | { t: 'h'; y: number; label: string; tone?: 'up' | 'down' | 'mid'; from?: number; to?: number }
  | { t: 'zone'; x0: number; x1: number; y0: number; y1: number; label: string; tone?: 'up' | 'down' | 'mid' }
  | { t: 'line'; pts: (number | null)[]; label: string; tone?: 'mid' | 'alt' }
  | { t: 'mark'; x: number; y: number; label: string; tone?: 'up' | 'down' | 'mid'; dir?: 'up' | 'down' };
export interface Diagram { candles: DCandle[]; overlays: Overlay[]; volume?: boolean; caption: string; pane?: { label: string; vals: (number | null)[]; lines: number[] } }

/** Candles from a list of closes: each opens at the previous close, wicks add `w` beyond the body, `wick` overrides
 *  one bar's high/low (index → [high, low]). Volume optional. */
function mk(closes: number[], start: number, w = 0.25, wick: Record<number, [number?, number?]> = {}, vol?: number[]): DCandle[] {
  return closes.map((c, i) => {
    const o = i ? closes[i - 1] : start, [hh, ll] = wick[i] ?? [];
    return { o, c, h: Math.max(hh ?? -Infinity, Math.max(o, c) + (hh == null ? w : 0)), l: Math.min(ll ?? Infinity, Math.min(o, c) - (ll == null ? w : 0)), v: vol?.[i] };
  });
}
const emaOf = (xs: number[], n: number) => { const k = 2 / (n + 1); let e = xs[0]; return xs.map((x, i) => (i ? (e = x * k + e * (1 - k)) : e)); };

export const DIAGRAMS: Record<string, Diagram> = {
  orb: {
    candles: mk([101, 100.2, 100.9, 102.2, 102.9, 102.5, 103.4, 104.1, 103.8, 104.6, 105.2], 100.4, 0.3, { 0: [101.4, 99.8] }, [9, 7, 6, 10, 8, 5, 7, 6, 4, 5, 5]),
    volume: true,
    overlays: [
      { t: 'zone', x0: 0, x1: 2, y0: 99.8, y1: 101.4, label: 'Opening range (first 15 min)', tone: 'mid' },
      { t: 'h', y: 101.4, label: 'Range high', tone: 'mid', from: 0 },
      { t: 'h', y: 99.8, label: 'Stop: other side', tone: 'down', from: 0 },
      { t: 'h', y: 104.6, label: 'Target 2R', tone: 'up', from: 3 },
      { t: 'mark', x: 3, y: 101.4, label: 'Entry on break', tone: 'up', dir: 'up' },
    ],
    caption: 'Price breaks the first 15 minutes’ high on rising volume; stop at the range low, target twice the risk.',
  },
  fvg: {
    candles: mk([100.4, 102.6, 103.0, 102.4, 101.9, 102.6, 103.5, 104.2], 100, 0.2, { 0: [100.6, 99.9], 2: [103.3, 101.2], 4: [102.2, 101.5] }),
    overlays: [
      { t: 'zone', x0: 0, x1: 7, y0: 100.6, y1: 101.2, label: 'Fair value gap', tone: 'up' },
      { t: 'mark', x: 0, y: 100.6, label: 'Candle 1 high', tone: 'mid', dir: 'up' },
      { t: 'mark', x: 2, y: 103.3, label: 'Candle 3 low edges the gap', tone: 'mid', dir: 'down' },
      { t: 'mark', x: 4, y: 101.5, label: 'Price returns to the gap', tone: 'up', dir: 'up' },
    ],
    caption: 'A strong middle candle leaves a gap between candle 1’s high and candle 3’s low; traders watch for price to come back into it.',
  },
  volema: (() => {
    const closes = [100, 100.8, 101.7, 102.3, 103.2, 103.9, 103.5, 103.1, 102.9, 103.8, 104.7, 105.4];
    return { candles: mk(closes, 99.6, 0.25, {}, [6, 7, 8, 7, 8, 7, 3, 3, 2, 8, 7, 6]), volume: true,
      overlays: [{ t: 'line', pts: emaOf(closes, 6), label: '9 EMA', tone: 'mid' }, { t: 'mark', x: 9, y: 102.8, label: 'Bounce on volume = entry', tone: 'up', dir: 'up' }, { t: 'h', y: 102.6, label: 'Stop under pullback low', tone: 'down', from: 6 }],
      caption: 'Uptrend, quiet pullback to the EMA on low volume, then a bounce candle on high volume.' } as Diagram;
  })(),
  vwapr: (() => {
    const closes = [100, 99.4, 99.1, 99.3, 99.0, 99.6, 100.3, 100.9, 100.6, 100.4, 101.0, 101.6];
    let pv = 0, n = 0; const vw = closes.map((c) => { pv += c; n++; return pv / n + 0.15; });
    return { candles: mk(closes, 100.2, 0.25), overlays: [{ t: 'line', pts: vw, label: 'VWAP', tone: 'mid' }, { t: 'mark', x: 6, y: 100.6, label: 'Cross above', tone: 'mid', dir: 'up' }, { t: 'mark', x: 9, y: 100.1, label: 'Retest holds = entry', tone: 'up', dir: 'up' }],
      caption: 'Below VWAP all morning, then a cross above and a retest that holds.' } as Diagram;
  })(),
  emax: (() => {
    const closes = [103, 102.4, 101.8, 101.3, 101.0, 101.2, 101.8, 102.5, 103.1, 103.8, 104.3, 104.9];
    return { candles: mk(closes, 103.4, 0.2), overlays: [{ t: 'line', pts: emaOf(closes, 3), label: '9 EMA', tone: 'mid' }, { t: 'line', pts: emaOf(closes, 7), label: '21 EMA', tone: 'alt' }, { t: 'mark', x: 7, y: 101.6, label: 'Fast crosses above slow', tone: 'up', dir: 'up' }],
      caption: 'The fast EMA crosses back above the slow EMA after a pullback.' } as Diagram;
  })(),
  brr: {
    candles: mk([100, 101.2, 101.9, 101.1, 101.8, 101.0, 101.9, 103.1, 102.6, 102.1, 102.9, 103.8], 99.6, 0.2, { 2: [102.1] , 4: [102.05], 6: [102.08] }),
    overlays: [{ t: 'h', y: 102.1, label: 'Resistance → support', tone: 'mid' }, { t: 'mark', x: 7, y: 103.4, label: 'Breakout', tone: 'up', dir: 'down' }, { t: 'mark', x: 9, y: 101.9, label: 'Retest holds = entry', tone: 'up', dir: 'up' }],
    caption: 'A level that capped price three times breaks, then holds as support on the retest.',
  },
  flag: {
    candles: mk([100.6, 101.8, 103.0, 104.1, 103.8, 103.6, 103.3, 103.4, 104.6, 105.5], 100, 0.2, {}, [6, 8, 9, 8, 3, 3, 2, 3, 8, 7]), volume: true,
    overlays: [{ t: 'zone', x0: 3, x1: 7, y0: 103.1, y1: 104.3, label: 'Flag (tight, low volume)', tone: 'mid' }, { t: 'mark', x: 1, y: 101.0, label: 'Pole', tone: 'up', dir: 'up' }, { t: 'mark', x: 8, y: 104.3, label: 'Break of flag high', tone: 'up', dir: 'up' }],
    caption: 'A strong pole on heavy volume, a tight drift on light volume, then a break of the flag’s high.',
  },
  sweeprev: {
    candles: mk([101, 101.6, 101.2, 101.7, 101.4, 101.5, 100.6, 100.0, 99.6], 100.6, 0.2, { 5: [102.6] }, [5, 5, 4, 5, 5, 11, 7, 6, 6]), volume: true,
    overlays: [{ t: 'h', y: 102.0, label: 'Prior high (stops sit above)', tone: 'mid' }, { t: 'mark', x: 5, y: 102.6, label: 'Sweep, close back inside', tone: 'down', dir: 'down' }, { t: 'mark', x: 6, y: 100.4, label: 'Entry after the close', tone: 'down', dir: 'down' }],
    caption: 'Price runs the stops above an obvious high, closes back inside, and reverses.',
  },
  fake: {
    candles: mk([100.5, 101.2, 100.8, 101.4, 101.0, 101.6, 100.9, 100.5, 100.1], 100.2, 0.2, { 5: [102.3] }, [5, 5, 4, 5, 4, 3, 7, 6, 5]), volume: true,
    overlays: [{ t: 'h', y: 101.8, label: 'Breakout level', tone: 'mid' }, { t: 'mark', x: 5, y: 102.3, label: 'Break on low volume…', tone: 'down', dir: 'down' }, { t: 'mark', x: 6, y: 100.7, label: '…closes back inside', tone: 'down', dir: 'down' }],
    caption: 'A break of a visible level on light volume that closes back inside the range within a few bars.',
  },
  beartrap: {
    candles: mk([101, 100.4, 100.8, 100.3, 100.7, 100.4, 100.9, 101.6, 102.2], 101.4, 0.2, { 5: [undefined, 99.1] }, [5, 5, 4, 5, 4, 10, 8, 7, 6]), volume: true,
    overlays: [{ t: 'h', y: 99.9, label: 'Support', tone: 'mid' }, { t: 'mark', x: 5, y: 99.1, label: 'Break below, close back above', tone: 'up', dir: 'up' }, { t: 'mark', x: 6, y: 100.5, label: 'Entry on reclaim', tone: 'up', dir: 'up' }],
    caption: 'A break below support that reverses back above it traps the sellers.',
  },
  gapgo: {
    candles: mk([100, 100.4, 100.2, 102.1, 101.6, 101.1, 100.6, 100.3], 99.8, 0.2, { 3: [102.5, 101.9] }),
    overlays: [{ t: 'h', y: 100.2, label: 'Yesterday’s close', tone: 'mid' }, { t: 'zone', x0: 2, x1: 3, y0: 100.2, y1: 101.9, label: 'Gap', tone: 'mid' }, { t: 'mark', x: 7, y: 100.2, label: 'Gap filled', tone: 'down', dir: 'down' }],
    caption: 'A small gap up with no news fades back to yesterday’s close (gap fill). A news gap that holds the opening range is a gap and go.',
  },
  rsi2: {
    candles: mk([101, 101.8, 102.6, 103.1, 102.5, 101.8, 101.2, 102.1, 102.9, 103.6], 100.4, 0.2),
    overlays: [{ t: 'h', y: 100.6, label: '200-day average (price above)', tone: 'mid' }, { t: 'mark', x: 6, y: 100.9, label: 'RSI(2) < 10: buy', tone: 'up', dir: 'up' }, { t: 'mark', x: 8, y: 103.2, label: 'Sell on bounce', tone: 'mid', dir: 'down' }],
    pane: { label: 'RSI(2)', vals: [60, 80, 88, 90, 35, 12, 6, 55, 78, 85], lines: [10, 70] },
    caption: 'Three down days inside an uptrend push RSI(2) under 10; exit on the bounce.',
  },
  trend200: (() => {
    const closes = [96, 95.2, 95.8, 96.5, 97.4, 98.6, 99.5, 100.6, 101.4, 102.3, 103.1, 103.8];
    return { candles: mk(closes, 96.8, 0.3), overlays: [{ t: 'line', pts: closes.map((_, i) => 98.2 + i * 0.12), label: '200-day SMA', tone: 'mid' }, { t: 'mark', x: 6, y: 99.0, label: 'Close above the 200 = in', tone: 'up', dir: 'up' }],
      caption: 'Hold while price is above the 200-day average; step aside below it.' } as Diagram;
  })(),
};
/** Which diagram each strategy or setup card shows. */
export const DIAGRAM_FOR: Record<string, string> = { orb: 'orb', fvg: 'fvg', volema: 'volema', vwapr: 'vwapr', emax: 'emax', brr: 'brr', flag: 'flag', sweeprev: 'sweeprev', gapgo: 'gapgo', rsi2: 'rsi2', trend200: 'trend200', fake: 'fake', grab: 'sweeprev', bulltrap: 'fake', beartrap: 'beartrap', vwapreclaim: 'vwapr', gapfill: 'gapgo', pdh: 'sweeprev', drive: 'orb' };
