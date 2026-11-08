import { describe, expect, it } from 'vitest';
import { buildLadder, distLabel, nearestKey } from '../shared/ladder';
import { regimeRead } from '../shared/regime';
import { PHASES, clockMin, frac, phaseAt } from '../shared/dayplan';

describe('level ladder', () => {
  const items = [
    { key: 'pdh', short: 'PDH', label: 'Prior-day high', value: 601, kind: 'level' as const },
    { key: 'vwap', short: 'VWAP', label: 'VWAP', value: 599.5, kind: 'level' as const },
    { key: 'orl', short: 'ORL', label: 'Opening-range low', value: null, kind: 'level' as const },
    { key: 'callWall', short: 'Call wall', label: 'Call wall', value: 605, kind: 'gamma' as const },
    { key: 'pdl', short: 'PDL', label: 'Prior-day low', value: 594, kind: 'level' as const },
  ];
  it('sorts high to low, puts last in place, skips empty levels, and finds the nearest', () => {
    const r = buildLadder(items, 599.9, false);
    expect(r.map((x) => x.key)).toEqual(['callWall', 'pdh', 'last', 'vwap', 'pdl']);
    expect(nearestKey(r)).toBe('vwap');
    expect(r.find((x) => x.key === 'pdh')!.dist).toBeCloseTo(0.18, 1);
  });
  it('swing preset keeps only the prior-day range and the walls', () => {
    expect(buildLadder(items, 599.9, true).map((x) => x.key)).toEqual(['callWall', 'pdh', 'last', 'pdl']);
  });
  it('no price, no ladder; labels read well', () => {
    expect(buildLadder(items, 0, false)).toEqual([]);
    expect(distLabel(0.44)).toBe('+0.4%');
    expect(distLabel(-12.3)).toBe('−12%');
  });
});
describe('regime read', () => {
  it('uptrend + positive gamma = calm uptrend', () => expect(regimeRead({ close: 610, sma50: 600, sma200: 560, gamma: 'positive', flip: 590 })).toMatchObject({ label: 'Calm uptrend', tone: 'up', trend: 'up' }));
  it('uptrend + negative gamma is flagged jumpy (warn)', () => expect(regimeRead({ close: 610, sma50: 600, sma200: 560, gamma: 'negative', flip: 620 })).toMatchObject({ label: 'Uptrend, jumpy', tone: 'warn' }));
  it('downtrend', () => expect(regimeRead({ close: 500, sma50: 520, sma200: 560, gamma: 'negative', flip: null })).toMatchObject({ label: 'Risk-off, fast', tone: 'down' }));
  it('mixed averages = choppy', () => expect(regimeRead({ close: 590, sma50: 600, sma200: 560, gamma: 'positive', flip: null })).toMatchObject({ label: 'Choppy', trend: 'mixed' }));
  it('works with only a 50-day and no gamma; nothing without a trend', () => {
    expect(regimeRead({ close: 610, sma50: 600, sma200: null, gamma: null, flip: null })).toMatchObject({ label: 'Calm uptrend', gamma: null });
    expect(regimeRead({ close: null, sma50: null, sma200: null, gamma: 'positive', flip: null })).toBeNull();
  });
});
describe('day plan', () => {
  it('parses clock times', () => { expect(clockMin('08:30')).toBe(510); expect(clockMin('2:00 pm')).toBeNull(); });
  it('positions and phases', () => {
    expect(frac(4 * 60)).toBe(0); expect(frac(20 * 60)).toBe(1); expect(frac(12 * 60)).toBeCloseTo(0.5, 2);
    expect(phaseAt(10 * 60)!.id).toBe('open'); expect(phaseAt(3 * 60)).toBeNull();
    expect(PHASES.every((p, i) => i === 0 || p.from === PHASES[i - 1].to)).toBe(true);
  });
});
