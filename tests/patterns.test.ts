import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyze, candleAt, findChartPatterns, findCandles, fitLine, pivots } from '../shared/patterns';
import type { Bar } from '../src/types';
import { barsFrom, ramp } from './helpers';

/** A clean downtrend: each bar opens 1 above its close, so the prior 6 bars fall ~6 points (> 1.2 ATR). */
function downtrend(n: number, endClose = 80): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < n; i++) {
    const c = endClose + (n - 1 - i);
    out.push({ time: 1_700_000_000 + i * 86400, open: c + 1, high: c + 1.3, low: c - 0.3, close: c, volume: 1e6 });
  }
  return out;
}
const add = (bars: Bar[], o: number, h: number, l: number, c: number) => [...bars, { time: bars.at(-1)!.time + 86400, open: o, high: h, low: l, close: c, volume: 1e6 }];

describe('candlestick signals', () => {
  it('hammer after a decline', () => {
    const b = add(downtrend(20), 79.8, 80.05, 77, 80);
    expect(candleAt(b, b.length - 1)).toBe('hammer');
  });
  it('bullish engulfing after a decline', () => {
    const b = add(add(downtrend(20, 81), 80, 80.2, 78.8, 79), 78.9, 80.7, 78.7, 80.5);
    expect(candleAt(b, b.length - 1)).toBe('bullEngulf');
  });
  it('morning star after a decline', () => {
    let b = downtrend(20, 81);
    b = add(b, 80, 80.2, 77.3, 77.5);
    b = add(b, 77.2, 77.4, 76.8, 77);
    b = add(b, 77.3, 79.7, 77.1, 79.5);
    expect(candleAt(b, b.length - 1)).toBe('morningStar');
    const hits = findCandles(b);
    expect(hits[0].name).toBe('Morning star');
    expect(hits[0].span).toBe(3);
    expect(hits[0].text).toMatch(/no follow-through yet/);
  });
  it('no signal on an ordinary trend bar', () => {
    const b = downtrend(20);
    expect(candleAt(b, b.length - 1)).toBeNull();
  });
  it('reports confirmation from later bars', () => {
    let b = add(downtrend(20), 79.8, 80.05, 77, 80);
    b = add(b, 80, 81.5, 79.9, 81.2);
    const h = findCandles(b).find((x) => x.id === 'hammer')!;
    expect(h.text).toMatch(/confirmed/);
  });
});

describe('pivots and lines', () => {
  it('finds swing highs and lows', () => {
    const b = barsFrom([...ramp(50, 60, 10), ...ramp(60, 52, 8), ...ramp(52, 58, 8)]);
    const p = pivots(b, 3);
    expect(p.highs.map((x) => x.i)).toContain(9);
    expect(p.lows.map((x) => x.i)).toContain(17);
  });
  it('fits a line', () => {
    const l = fitLine([{ i: 0, p: 10 }, { i: 10, p: 20 }]);
    expect(l.at(5)).toBeCloseTo(15);
    expect(l.maxResid).toBeCloseTo(0);
  });
});

describe('chart patterns', () => {
  it('double top: forming, then confirmed on a close below the neckline', () => {
    const base = [...ramp(50, 100, 30), ...ramp(100, 90, 8), ...ramp(90, 100, 8), ...ramp(100, 93, 6)];
    let dt = findChartPatterns(barsFrom(base)).find((h) => h.id === 'doubleTop');
    expect(dt).toBeTruthy();
    expect(dt!.status).toBe('forming');
    expect(dt!.trigger).toBeLessThan(91);
    expect(dt!.target).toBeLessThan(dt!.trigger!);
    dt = findChartPatterns(barsFrom([...base, ...ramp(93, 85, 4)])).find((h) => h.id === 'doubleTop');
    expect(dt!.status).toBe('confirmed');
    expect(dt!.text).toMatch(/confirms the pattern/);
  });
  it('ascending triangle: flat top, rising lows', () => {
    const closes = [...ramp(70, 100, 25), ...ramp(100, 90, 5), ...ramp(90, 100, 5), ...ramp(100, 93, 5), ...ramp(93, 100, 5), ...ramp(100, 96, 5), ...ramp(96, 99.5, 4)];
    const t = findChartPatterns(barsFrom(closes)).find((h) => h.id === 'ascTri');
    expect(t).toBeTruthy();
    expect(t!.bias).toBe('bull');
    expect(t!.status).toBe('forming');
    expect(t!.lines).toHaveLength(2);
  });
  it('flags a fresh bull flag with drawable points', () => {
    const closes = [...ramp(40, 50, 40), ...ramp(50, 62, 8), ...ramp(62, 59, 6)];
    const b = barsFrom(closes, { vol: (i) => (i >= 40 && i < 48 ? 3e6 : 1e6) });
    const f = findChartPatterns(b).find((h) => h.id === 'bullFlag');
    expect(f).toBeTruthy();
    expect(f!.target).toBeGreaterThan(f!.trigger!);
  });
  it('summary reads the trend and lists what it found', () => {
    const r = analyze(barsFrom(ramp(50, 100, 80)), 'TEST');
    expect(r.trend).toBe('bull');
    expect(r.summary).toMatch(/TEST closed at \$100/);
    expect(r.summary).toMatch(/above its 20-day average and above its 50-day/);
  });
  it('asks for more history when short', () => {
    expect(analyze(barsFrom(ramp(1, 2, 10)), 'X').summary).toMatch(/Not enough history/);
  });
});

describe('real data (Alpha Vantage NVDA daily, Jun 17 – Nov 6 2026)', () => {
  const rows = readFileSync(new URL('./fixtures/alphavantage-daily-nvda.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).reverse();
  const bars: Bar[] = rows.map((r) => { const [d, o, h, l, c, v] = r.split(','); return { time: Date.parse(d + 'T00:00:00Z') / 1000, open: +o, high: +h, low: +l, close: +c, volume: +v }; });
  const r = analyze(bars, 'NVDA');
  it('reads the Sep–Oct top as a confirmed head and shoulders, not also a double top', () => {
    expect(r.charts.map((c) => c.id)).toEqual(['hs']);
    expect(r.charts[0].status).toBe('confirmed');
    expect(r.charts[0].text).toMatch(/\$243\.37 \(Oct 6\)/);
    expect(r.trend).toBe('bear');
  });
  it('keeps candle signals sparse', () => {
    expect(r.candles.length).toBeLessThanOrEqual(6);
  });
});
