import { describe, expect, it } from 'vitest';
import { geoNaturalEarth1 } from 'd3-geo';
import { MARKETS, isOpen, nightPath, project, subsolar } from '../shared/mapgeo';
import { MAP_SCALE, MAP_TX, MAP_TY, LAND } from '../src/data/worldLand';
import { hasTimes, hotspotsAt, type Hotspot } from '../shared/world';

const fit = { scale: MAP_SCALE, tx: MAP_TX, ty: MAP_TY };
describe('map projection', () => {
  it('matches d3 geoNaturalEarth1 across the globe', () => {
    const d3 = geoNaturalEarth1().scale(MAP_SCALE).translate([MAP_TX, MAP_TY]);
    for (const [lo, la] of [[0, 0], [-74, 40.7], [139.7, 35.7], [151.2, -33.9], [-122.4, 37.8], [37.6, 55.75], [180, 80], [-180, -60]]) {
      const a = project(lo, la, fit), b = d3([lo, la])!;
      expect(Math.abs(a[0] - b[0])).toBeLessThan(0.05);
      expect(Math.abs(a[1] - b[1])).toBeLessThan(0.05);
    }
  });
  it('baked land path exists', () => { expect(LAND.length).toBeGreaterThan(10000); expect(LAND.startsWith('M')).toBe(true); });
});
describe('day / night', () => {
  it('sun is overhead at noon UTC on the prime meridian near the equinox', () => {
    const s = subsolar(Date.UTC(2026, 2, 20, 12, 0));
    expect(Math.abs(s.lon)).toBeLessThan(1);
    expect(Math.abs(s.lat)).toBeLessThan(2);
  });
  it('northern summer: sun is north, and the night path is a closed shape', () => {
    expect(subsolar(Date.UTC(2026, 5, 21, 12)).lat).toBeGreaterThan(22);
    const p = nightPath(Date.UTC(2026, 10, 8, 6), fit);
    expect(p.startsWith('M') && p.endsWith('Z')).toBe(true);
    expect(p).not.toContain('NaN');
  });
});
describe('market hours', () => {
  const nyse = MARKETS.find((m) => m.id === 'nyse')!, tse = MARKETS.find((m) => m.id === 'tse')!;
  it('New York open at 10:00 ET Friday, closed at 17:00 and on Saturday', () => {
    expect(isOpen(nyse, Date.UTC(2026, 10, 6, 15, 0))).toBe(true); // 10:00 EST
    expect(isOpen(nyse, Date.UTC(2026, 10, 6, 22, 0))).toBe(false);
    expect(isOpen(nyse, Date.UTC(2026, 10, 7, 15, 0))).toBe(false);
  });
  it('Tokyo is open while New York sleeps', () => {
    const t = Date.UTC(2026, 10, 6, 1, 0); // 10:00 JST, 20:00 ET Thursday
    expect(isOpen(tse, t)).toBe(true);
    expect(isOpen(nyse, t)).toBe(false);
  });
});
describe('24-hour replay', () => {
  const h: Hotspot = { id: 'a', name: 'Wall Street', country: 'United States', lat: 0, lon: 0, neg: 2, pos: 1, neu: 0, tone: 0,
    articles: [{ title: 'a', url: '', t: 100, s: 1 }, { title: 'b', url: '', t: 200, s: -1 }, { title: 'c', url: '', t: 300, s: -1 }] };
  it('only counts headlines published by the chosen moment', () => {
    expect(hasTimes([h])).toBe(true);
    expect(hotspotsAt([h], 150, false)[0]).toMatchObject({ pos: 1, neg: 0 });
    expect(hotspotsAt([h], 250, false)[0]).toMatchObject({ pos: 1, neg: 1 });
    expect(hotspotsAt([h], 50, false)).toEqual([]);
    expect(hotspotsAt([h], 999, true)[0]).toMatchObject({ neg: 3, pos: 0 });
  });
});
