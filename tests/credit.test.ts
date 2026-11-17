import { describe, expect, it } from 'vitest';
import { aroundRecessions, lastBefore, lastNYears, recessions, regimeOf, stats, type Pts } from '../shared/credit';

const wk = (n: number, f: (i: number) => number, start = '2020-01-06'): Pts => Array.from({ length: n }, (_, i) => [new Date(Date.parse(`${start}T12:00:00Z`) + i * 7 * 86400_000).toISOString().slice(0, 10), f(i)]);

describe('credit helpers', () => {
  it('ranks the latest value against history and measures changes', () => {
    const p = wk(120, (i) => i + 1); // rises every week
    const s = stats(p)!;
    expect(s.last).toBe(120); expect(s.pctile).toBe(100); expect(s.min).toBe(1); expect(s.max).toBe(120);
    expect(s.chg1m).toBe(5); // the last weekly point at least 30 days back is 5 weeks earlier; expect(s.chg1y).toBe(52);
    expect(stats([])).toBeNull();
    expect(regimeOf(10)).toBe('tight'); expect(regimeOf(50)).toBe('normal'); expect(regimeOf(90)).toBe('wide');
  });
  it('finds recession runs and what a spread did around them', () => {
    const rec: Pts = [['2020-01-01', 0], ['2020-02-01', 1], ['2020-03-01', 1], ['2020-04-01', 0]];
    expect(recessions(rec)).toEqual([['2020-02-01', '2020-03-01']]);
    const spread: Pts = [['2019-01-02', 4], ['2019-12-30', 3.5], ['2020-02-03', 3.6], ['2020-03-23', 8.9], ['2021-01-04', 4.2]];
    const r = aroundRecessions(spread, recessions(rec))[0];
    expect(r.before).toBe(4); expect(r.atStart).toBe(3.5); expect(r.peak).toBe(8.9);
    expect(lastBefore(spread, '2019-06-01')).toBe(4);
    expect(lastNYears(wk(300, (i) => i), 1).length).toBeLessThan(60);
  });
});
