import { describe, expect, it } from 'vitest';
import { aggregate, boards, breadth } from '../shared/f13agg';
import type { F13Row } from '../shared/smartmoney';

const row = (cusip: string, name: string, shares: number, px: number, putCall: '' | 'PUT' = ''): F13Row => ({ cusip, name, cls: 'COM', shares, value: shares * px, putCall });

describe('aggregate 13F patterns', () => {
  const snaps = [
    { cik: '1', who: 'A', cat: 'x', period: '2026-09-30', cur: [row('AAA', 'Alpha', 200, 10), row('BBB', 'Beta', 100, 10)], prev: [row('AAA', 'Alpha', 100, 9), row('CCC', 'Gamma', 50, 10)] },
    { cik: '2', who: 'B', cat: 'x', period: '2026-09-30', cur: [row('AAA', 'Alpha', 50, 10), row('CCC', 'Gamma', 10, 10)], prev: [row('AAA', 'Alpha', 100, 9), row('CCC', 'Gamma', 10, 9)] },
  ];
  const { stocks, fundStats } = aggregate(snaps, { AAA: 'AAA' });
  const by = (c: string) => stocks.find((s) => s.cusip === c)!;
  it('counts adds, trims, new and exits per stock', () => {
    expect(by('AAA')).toMatchObject({ holders: 2, addedN: 1, trimmedN: 1, newN: 0, soldN: 0, sym: 'AAA' });
    expect(by('BBB')).toMatchObject({ holders: 1, newN: 1 });
    expect(by('CCC')).toMatchObject({ soldN: 1, sameN: 1, holders: 1 });
  });
  it('estimates net dollars from share change', () => {
    expect(by('AAA').netShares).toBe(50); // +100 and -50
    expect(by('AAA').netValue).toBe(500);
    expect(by('CCC').netShares).toBe(-50);
  });
  it('summarizes each fund', () => {
    expect(fundStats[0]).toMatchObject({ who: 'A', newN: 1, addedN: 1, soldN: 1, count: 2 });
    expect(fundStats[0].turnover).toBeCloseTo(1); // 3 changes over 3 distinct names
  });
  it('ignores puts/calls and builds boards without crashing', () => {
    const o = aggregate([{ ...snaps[0], cur: [...snaps[0].cur, row('ZZZ', 'Opt', 5, 10, 'PUT')] }]);
    expect(o.stocks.find((s) => s.cusip === 'ZZZ')).toBeUndefined();
    expect(boards(stocks).length).toBeGreaterThan(8);
    expect(breadth(stocks).buys).toBeGreaterThan(0);
  });
});
