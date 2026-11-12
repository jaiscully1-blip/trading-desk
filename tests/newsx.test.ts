import { describe, expect, it } from 'vitest';
import { mergeArchive, searchNews, topStories, type Head } from '../shared/newsx';

const now = Date.parse('2026-11-12T05:00:00Z');
const h = (id: string, title: string, src: string, minAgo: number, syms: string[] = [], sentiment = 0): Head => ({ id, title, src, url: `https://x/${id}`, t: now - minAgo * 60_000, syms, sentiment });

describe('news tools', () => {
  const items = [
    h('a', 'Nvidia board weighs ousting CEO Jensen Huang', 'WSJ', 300, ['NVDA'], -1),
    h('b', 'Nvidia shares slide as board weighs Jensen Huang future', 'FT', 120, ['NVDA'], -1),
    h('c', 'Nvidia board to decide Jensen Huang fate', 'CNBC', 60, ['NVDA']),
    h('d', 'Oil drops as OPEC weighs output hike', 'Bloomberg', 90),
    h('e', 'Crude oil falls after OPEC output talk', 'Reuters', 80),
    h('f', 'Local bakery wins award', 'BBC', 30),
    h('g', 'Old story about tariffs', 'CNBC', 60 * 30),
  ];
  it('top stories: same story across outlets grouped, ranked by outlets', () => {
    const s = topStories(items, now);
    expect(s[0]).toMatchObject({ title: 'Nvidia board weighs ousting CEO Jensen Huang', syms: ['NVDA'] }); // first outlet's headline leads
    expect(s[0].sources.sort()).toEqual(['CNBC', 'FT', 'WSJ']);
    expect(s[0].tone).toBeCloseTo(-2 / 3);
    expect(s.find((x) => x.title.startsWith('Local'))).toBeUndefined(); // one outlet, one headline: not a "story"
    expect(s.find((x) => x.title.startsWith('Old'))).toBeUndefined(); // older than 24 hours
  });
  it('search: all words, phrases, $tickers', () => {
    expect(searchNews(items, 'jensen board').map((x) => x.id)).toEqual(['c', 'b', 'a']);
    expect(searchNews(items, '"output hike"').map((x) => x.id)).toEqual(['d']);
    expect(searchNews(items, '$NVDA slide').map((x) => x.id)).toEqual(['b']);
    expect(searchNews(items, '   ')).toEqual([]);
    expect(searchNews(items, 'oil').map((x) => x.id)).toEqual(['e', 'd']);
  });
  it('archive: dedupe by link, newest first, caps by count and age', () => {
    const a = mergeArchive([h('a', 'x', 's', 10)], [h('a', 'x', 's', 10), h('b', 'y', 's', 5), h('old', 'z', 's', 60 * 24 * 30)], now, 10, 21);
    expect(a.map((x) => x.id)).toEqual(['b', 'a']);
    expect(mergeArchive([], items, now, 2).length).toBe(2);
  });
});
