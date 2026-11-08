import { describe, expect, it } from 'vitest';
import { LAYER_WORDS, headlineHotspots, regionWeather, REGIONS, spotTotal } from '../shared/world';
import { placeOf } from '../shared/places';

describe('desk-news world fallback', () => {
  const items = [
    { title: 'Wall Street rallies as tech stocks surge', url: 'a', sentiment: 1 as const },
    { title: 'Wall Street slumps on recession fears', url: 'b', sentiment: -1 as const },
    { title: 'Wall Street opens flat', url: 'c', sentiment: 0 as const },
    { title: 'Wall Street opens flat', url: 'dup', sentiment: 0 as const },
    { title: 'Japan exports climb', url: 'd', sentiment: 1 as const },
    { title: 'No place in this headline', url: 'e', sentiment: 0 as const },
  ];
  it('places, splits tone, counts neutrals and dedupes', () => {
    const hs = headlineHotspots(items, placeOf);
    const ws = hs.find((h) => h.name === 'Wall Street')!;
    expect(ws).toMatchObject({ pos: 1, neg: 1, neu: 1, country: 'United States' });
    expect(spotTotal(ws)).toBe(3);
    expect(hs.find((h) => h.name === 'Japan')?.pos).toBe(1);
    expect(hs.length).toBe(2);
  });
  it('feeds the weather layer by country', () => {
    const hs = headlineHotspots(items, placeOf);
    const us = regionWeather(REGIONS[0], 1, hs);
    expect(us.articles).toBe(2);
  });
  it('layer word filters', () => {
    expect(LAYER_WORDS.deals.test('Microsoft to acquire startup in $2 billion acquisition')).toBe(true);
    expect(LAYER_WORDS.legal.test('Apple sued over App Store')).toBe(true);
    expect(LAYER_WORDS.conflict.test('Earnings beat estimates')).toBe(false);
  });
});
