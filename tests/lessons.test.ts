import { describe, expect, it } from 'vitest';
import { INDICATORS, MATH, NOTES, STRATS } from '../shared/lessons';
import { calc } from '../shared/quickmath';
import { fvgStats } from '../shared/setuplab';

describe('lessons', () => {
  it('cards are complete and unique', () => {
    for (const xs of [INDICATORS, STRATS, MATH, NOTES] as { id: string }[][]) expect(new Set(xs.map((x) => x.id)).size).toBe(xs.length);
    for (const s of STRATS) { expect(s.entry && s.stop && s.target).toBeTruthy(); expect(s.mistakes.length).toBeGreaterThan(0); }
  });
});

describe('quick math', () => {
  const main = (id: Parameters<typeof calc>[0], v: Record<string, number>) => calc(id, v).find((o) => o.main)!.value;
  it('position size, R and break-even', () => {
    expect(main('size', { acct: 25000, risk: 1, entry: 50, stop: 49 })).toBe('250');
    expect(main('rr', { entry: 20, stop: 19, target: 22.5 })).toBe('+2.50R');
    expect(main('breakeven', { rr: 2 })).toBe('33.3%');
  });
  it('expectancy, drawdown, expected move, kelly, compounding', () => {
    expect(main('expect', { win: 40, avgWin: 2, avgLoss: 1 })).toBe('+0.20R');
    expect(main('dd', { loss: 50 })).toBe('100.0%');
    expect(main('em', { price: 100, iv: 32, days: 365 })).toBe('±$32.00');
    expect(main('kelly', { win: 45, rr: 2 })).toBe('17.5%');
    expect(main('compound', { start: 10000, rate: 10, periods: 10 })).toBe('$25,937.42');
    expect(main('avg', { q1: 100, p1: 50, q2: 100, p2: 46, now: 49 })).toBe('$48.00');
  });
});

describe('fair value gaps', () => {
  const bar = (o: number, h: number, l: number, c: number) => ({ time: 0, open: o, high: h, low: l, close: c, volume: 1 });
  it('finds a bullish gap and sees it revisited and filled', () => {
    const bars = [bar(100, 100.2, 99.9, 100.1), bar(100.1, 101.5, 100.1, 101.4), bar(101.4, 101.8, 101, 101.6), bar(101.6, 101.7, 100.6, 100.8), bar(100.8, 100.9, 100, 100.1)];
    const s = fvgStats([bars], 0.05, 10);
    expect(s).toMatchObject({ n: 1, bull: 1, revisited: 100, filled: 100 });
  });
});
