import { describe, expect, it } from 'vitest';
import { mondayOf, weekReview } from '../src/lib/weekly';
import type { CheckIn, TradeView, Violation } from '../src/lib/journal';

const at = (day: string) => Date.parse(`${day}T15:00:00Z`); // 10-11 AM ET
const v = (day: string, realized: number) => ({ status: 'closed', closedAt: at(day), realized } as unknown as TradeView);
const ci = (day: string, tilt: number, sleep = 4): CheckIn => ({ day, t: at(day), sleep, mood: 3, stress: 2, chasing: false, note: '', tilt, updated: 0 });

describe('weekly review', () => {
  it('finds the Monday of a week (Sunday belongs to the week just ended)', () => {
    expect(mondayOf('2026-11-25')).toBe('2026-11-23');
    expect(mondayOf('2026-11-29')).toBe('2026-11-23');
    expect(mondayOf('2026-11-25', 1)).toBe('2026-11-16');
  });
  it('lines up check-ins with results and compares days', () => {
    const views = [v('2026-11-23', 200), v('2026-11-24', 100), v('2026-11-25', -300), v('2026-11-26', -100)];
    const viol = [{ type: 'size', tradeId: 'x', sym: 'A', t: at('2026-11-25'), cost: 150, detail: '' } as unknown as Violation];
    const w = weekReview('2026-11-23', views, viol, [ci('2026-11-23', 10), ci('2026-11-24', 20)], {});
    expect(w.pnl).toBe(-100);
    expect(w.days.map((d) => !!d.checkin)).toEqual([true, true, false, false, false]);
    expect(w.breaks).toBe(1); expect(w.breakCost).toBe(150);
    const c = w.compare.find((x) => x.label === 'Check-in')!;
    expect([c.aAvg, c.bAvg]).toEqual([150, -200]);
  });
});
