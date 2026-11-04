import { describe, expect, it } from 'vitest';
import { atr, ema, macd, rsi, sma, vwapSeries } from '../src/lib/indicators';
import type { Bar } from '../src/types';

describe('indicators', () => {
  it('SMA', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it('EMA seeded with SMA', () => {
    const e = ema([1, 2, 3, 4, 5, 6], 3);
    expect(e.slice(0, 2)).toEqual([null, null]);
    expect(e[2]).toBe(2);
    expect(e[3]).toBeCloseTo(3); // 4*0.5 + 2*0.5
    expect(e[5]).toBeCloseTo(5);
  });

  // StockCharts' worked example: avg gain 0.2385, avg loss 0.0996 -> RSI 70.46 (70.53 when the averages are rounded first)
  it("RSI matches Wilder's worked example (70.46)", () => {
    const c = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
    expect(rsi(c, 14)[14]).toBeCloseTo(70.46, 2);
  });

  it('MACD on a straight line settles at the EMA lag difference (7) with flat histogram', () => {
    const line = Array.from({ length: 80 }, (_, i) => i);
    const m = macd(line);
    expect(m.line[25]).toBeCloseTo(7);
    expect(m.signal[40]).toBeCloseTo(7);
    expect(m.hist[60]).toBeCloseTo(0);
  });

  it('ATR of constant-range bars equals the range', () => {
    const bars: Bar[] = Array.from({ length: 30 }, (_, i) => ({ time: i, open: 10, high: 11, low: 9, close: 10, volume: 1 }));
    expect(atr(bars, 14)[29]).toBeCloseTo(2);
  });

  it('VWAP resets each ET date', () => {
    const d1 = Date.UTC(2026, 10, 2, 9, 30) / 1000, d2 = Date.UTC(2026, 10, 3, 9, 30) / 1000;
    const v = vwapSeries([
      { time: d1, open: 10, high: 10, low: 10, close: 10, volume: 100 },
      { time: d1 + 300, open: 20, high: 20, low: 20, close: 20, volume: 300 },
      { time: d2, open: 50, high: 50, low: 50, close: 50, volume: 10 },
    ]);
    expect(v[1].value).toBeCloseTo((10 * 100 + 20 * 300) / 400);
    expect(v[2].value).toBe(50);
  });
});
