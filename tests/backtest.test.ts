import { describe, expect, it } from 'vitest';
import { backtest, scoreDay, stats } from '../shared/backtest';
import type { Bar } from '../shared/types';

const mk = (closes: number[], vol = 1000): Bar[] => closes.map((c, i) => ({ time: 1_700_000_000 + i * 86400, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: vol }));

describe('playbook backtest', () => {
  it('uses only the past: a rising series passes "above 20-day average"', () => {
    const b = mk(Array.from({ length: 80 }, (_, i) => 100 + i));
    expect(scoreDay(b, 70, [{ type: 'aboveSma20', weight: 1, enabled: true }], null)).toMatchObject({ score: 100, checked: 1 });
    // rules the past can't check are left out of the score
    expect(scoreDay(b, 70, [{ type: 'catalyst', weight: 3, enabled: true }, { type: 'aboveSma20', weight: 1, enabled: true }], null)).toMatchObject({ score: 100, checked: 1, total: 4 });
  });
  it('enters next open, exits at the target, never holds twice', () => {
    const closes = [...Array.from({ length: 70 }, (_, i) => 100 + (i % 2)), ...Array.from({ length: 30 }, (_, i) => 101 + i * 2)];
    const r = backtest({ UP: mk(closes) }, undefined, [{ type: 'aboveSma20', weight: 1, enabled: true }], { minScore: 100, stopAtr: 1.5, targetR: 2, maxDays: 10 });
    expect(r.trades.length).toBeGreaterThan(0);
    expect(r.trades.every((t) => t.r > 0)).toBe(true);
    const t = r.trades[0];
    expect(t.entryDay > t.signal).toBe(true);
    for (let k = 1; k < r.trades.length; k++) expect(r.trades[k].entryDay > r.trades[k - 1].exitDay).toBe(true);
  });
  it('a falling series stops out at -1R', () => {
    const closes = [...Array.from({ length: 70 }, (_, i) => 100 + i * 0.5), ...Array.from({ length: 30 }, (_, i) => 134 - i * 3)];
    const r = backtest({ DN: mk(closes) }, undefined, [{ type: 'aboveSma20', weight: 1, enabled: true }], { minScore: 100, stopAtr: 1.5, targetR: 2, maxDays: 10 });
    expect(r.trades.some((t) => t.why === 'stop' || t.why === 'gap-stop')).toBe(true);
    expect(Math.min(...r.trades.map((t) => t.r))).toBeLessThanOrEqual(-1);
  });
  it('stats: win rate, expectancy, profit factor, drawdown', () => {
    const s = stats([1, -1, 2, -1, -1].map((r, i) => ({ sym: 'X', signal: '', entryDay: `${i}`, exitDay: `${i}`, entry: 1, exit: 1, r, days: 1, why: 'time' as const, score: 100 })));
    expect(s).toMatchObject({ n: 5, wins: 2, winRate: 0.4, totalR: 0, maxDdR: 2 });
    expect(s.profitFactor).toBeCloseTo(1);
  });
});
