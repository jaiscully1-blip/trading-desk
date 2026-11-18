import { describe, expect, it } from 'vitest';
import { countByQuarter, fdaDate, quarterRange, steamQuarterly } from '../shared/livefeeds';

const NOW = Date.parse('2026-11-18T12:00:00Z');
describe('live feeds helpers', () => {
  it('lists complete quarters only', () => {
    const r = quarterRange(2026, NOW);
    expect(r.map((x) => x.q)).toEqual(['2026Q1', '2026Q2', '2026Q3']);
    expect(r[2]).toEqual({ q: '2026Q3', from: '2026-07-01', to: '2026-10-01' });
  });
  it('sums Steam rollups by quarter and skips thin quarters', () => {
    const t = (s: string) => Date.parse(s) / 1000;
    const g = [{ rollups: [{ date: t('2026-01-01'), recommendations_up: 300, recommendations_down: 100 }, { date: t('2026-02-01'), recommendations_up: 100, recommendations_down: 0 }, { date: t('2026-04-01'), recommendations_up: 10, recommendations_down: 5 }, { date: t('2026-10-02'), recommendations_up: 900, recommendations_down: 0 }] }];
    const s = steamQuarterly(g, NOW);
    expect(s.pos).toEqual([['2026Q1', 80]]); expect(s.vol).toEqual([['2026Q1', 500]]);
  });
  it('counts dated rows by quarter with zero-filled gaps', () => {
    const c = countByQuarter([{ date: '2026-01-05', v: 10 }, { date: '2026-01-20', v: 5 }, { date: '2026-08-01', v: 1 }], NOW);
    expect(c.n).toEqual([['2026Q1', 2], ['2026Q2', 0], ['2026Q3', 1]]); expect(c.sum[0]).toEqual(['2026Q1', 15]);
  });
  it('reads openFDA dates', () => { expect(fdaDate('20250917')).toBe('2025-09-17'); expect(fdaDate('bad')).toBe(''); });
});

import { FDA_EXCLUDE, steamIds } from '../shared/livefeeds';
describe('live feed fixes', () => {
  it('reads Steam app ids from store search results', () => {
    expect(steamIds({ items: [{ logo: 'https://x/steam/apps/359550/abc/capsule.jpg' }, { logo: 'nope' }] })).toEqual([359550]);
  });
  it('keeps Merck & Co. and drops Merck KGaA', () => {
    expect(FDA_EXCLUDE.MRK.test('Merck KGaA')).toBe(true); expect(FDA_EXCLUDE.MRK.test('Merck Sharp & Dohme LLC')).toBe(false);
  });
});
