import { describe, expect, it } from 'vitest';
import { BASICS, BASIC_GROUPS, breakeven, payoff } from '../shared/basics';

describe('Learn basics', () => {
  it('every card has a group, unique id, points and a video search', () => {
    expect(new Set(BASICS.map((b) => b.id)).size).toBe(BASICS.length);
    for (const b of BASICS) { expect(BASIC_GROUPS).toContain(b.group); expect(b.points.length).toBeGreaterThan(1); expect(b.watch.length).toBeGreaterThan(5); }
  });
  it('option payoffs match the card examples', () => {
    expect(payoff('call', 'buy', 105, 2, 112)).toBe(500);
    expect(payoff('call', 'buy', 105, 2, 104)).toBe(-200);
    expect(payoff('put', 'buy', 95, 1.5, 88)).toBe(550);
    expect(payoff('call', 'sell', 55, 1, 50)).toBe(100);
    expect(breakeven('call', 105, 2)).toBe(107); expect(breakeven('put', 95, 1.5)).toBe(93.5);
  });
});
