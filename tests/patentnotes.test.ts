import { describe, expect, it } from 'vitest';
import { buildNotes, lastWeek, parseTickerList, type TickerNight } from '../shared/patentNotes';

const prev: TickerNight = { sym: 'NVDA', name: 'Nvidia', names: ['Nvidia'], week: { published: 3, granted: 1, from: 'a', to: 'b' }, trendWord: 'steady', trendPct: 5, areasSeen: ['Computing', 'Semiconductors'], notes: [] };

describe('nightly patent notes', () => {
  it('reads the ticker list file', () => {
    expect(parseTickerList('# comment\nnvda\n AAPL  # Apple\n\nbad ticker!\nNVDA\nBRK.B')).toEqual(['NVDA', 'AAPL', 'BRK.B']);
  });
  it('uses the 7 days ending yesterday', () => {
    expect(lastWeek(new Date('2026-11-26T09:30:00Z'))).toEqual({ from: '2026-11-19', to: '2026-11-25' });
  });
  it('writes plain notes for this week, a new tech area and a trend change', () => {
    const n = buildNotes({ week: { published: 14, granted: 1, from: '2026-11-19', to: '2026-11-25' }, trendWord: 'speeding up', trendPct: 31.4, recentAreas: ['Computing', 'Robots'] }, prev);
    expect(n).toEqual([
      'This week (2026-11-19 to 2026-11-25): 14 applications made public, 1 patent granted.',
      'First filing seen in Robots.',
      'Grants over the last 12 months are now speeding up (+31% vs the year before; was steady).',
    ]);
  });
  it('stays quiet when nothing happened, and makes no comparisons on a first run', () => {
    expect(buildNotes({ week: { published: 0, granted: 0, from: 'a', to: 'b' }, trendWord: 'steady', trendPct: 2, recentAreas: [] }, prev)).toEqual([]);
    expect(buildNotes({ week: { published: 0, granted: 0, from: 'a', to: 'b' }, trendWord: 'speeding up', trendPct: 40, recentAreas: ['Robots'] }, null)).toEqual([]);
  });
});
