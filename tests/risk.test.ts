import { describe, expect, it } from 'vitest';
import { calc, expectancy, kelly, positionSize, recoverPct, rr, streakOdds } from '../shared/risk';
import { MARKETS, sessionState } from '../shared/sessions';

describe('risk calculator', () => {
  it('position size from account risk', () => {
    expect(positionSize(10_000, 1, 50, 48)).toMatchObject({ shares: 50, riskUsd: 100, perShare: 2, cost: 2500 });
    expect(positionSize(10_000, 1, 50, 49.5, 5000)).toMatchObject({ shares: 100, cappedBy: 'buying power' });
    expect(positionSize(10_000, 1, 50, 50).shares).toBe(0);
  });
  it('reward:risk and R targets, long and short', () => {
    expect(rr(100, 95, 115)).toEqual({ ratio: 3, targets: [105, 110, 115] });
    expect(rr(100, 105, 90).targets).toEqual([95, 90, 85]);
  });
  it('expectancy, breakeven win rate, kelly', () => {
    const e = expectancy(40, 300, 100);
    expect(e.perTrade).toBeCloseTo(60);
    expect(e.perR).toBeCloseTo(0.6);
    expect(e.breakevenWinPct).toBeCloseTo(25);
    expect(kelly(40, 3).full).toBeCloseTo(20);
    expect(kelly(30, 1).full).toBeLessThan(0);
  });
  it('drawdown recovery and losing streaks', () => {
    expect(recoverPct(50)).toBeCloseTo(100);
    expect(recoverPct(20)).toBeCloseTo(25);
    expect(streakOdds(50, 1, 1)).toBeCloseTo(50);
    expect(streakOdds(50, 2, 2)).toBeCloseTo(25);
    expect(streakOdds(50, 2, 3)).toBeCloseTo(37.5);
  });
  it('keypad math without eval', () => {
    expect(calc('2+3*4')).toBe(14);
    expect(calc('(2+3)*4')).toBe(20);
    expect(calc('-5+2')).toBe(-3);
    expect(calc('200*1.5%')).toBeCloseTo(3);
    expect(calc('10÷4')).toBe(2.5);
    expect(calc('2+alert(1)')).toBeNaN();
    expect(calc('2+')).toBeNaN();
  });
});

describe('session clock', () => {
  const ny = MARKETS[0], tky = MARKETS[2];
  it('New York open and close', () => {
    expect(sessionState(ny, Date.parse('2026-11-09T15:00:00Z'))).toMatchObject({ status: 'open', next: 'closes', inSec: 6 * 3600, local: '10:00' });
    expect(sessionState(ny, Date.parse('2026-11-09T13:00:00Z'))).toMatchObject({ status: 'closed', next: 'opens', inSec: 3600 + 1800 });
  });
  it('weekend rolls to Monday', () => {
    const s = sessionState(ny, Date.parse('2026-11-07T17:00:00Z')); // Sat noon ET
    expect(s.status).toBe('closed');
    expect(s.inSec).toBe(2 * 86400 - 12 * 3600 + 9.5 * 3600);
  });
  it('Tokyo lunch break', () => {
    expect(sessionState(tky, Date.parse('2026-11-09T02:45:00Z'))).toMatchObject({ status: 'lunch', next: 'lunch ends', local: '11:45' });
  });
});
