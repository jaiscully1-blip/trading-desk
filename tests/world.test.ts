import { describe, expect, it } from 'vitest';
import { REGIONS, countryOf, mergeHotspots, parseGeo, parsePopupHtml, regionWeather } from '../shared/world';
import { computeFlows, flowArcs, parseBinanceKlines, parseGeckoChart } from '../shared/flows';
import { barsFrom, ramp } from './helpers';

const geo = (name: string, lon: number, lat: number, count: number, titles: string[]) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { name, count, html: titles.map((t, i) => `<a href="https://x/${encodeURIComponent(t)}${i}" title="">${t}</a><BR>`).join('') },
});

describe('GDELT world layer', () => {
  it('parses GEO GeoJSON points and popup article links', () => {
    expect(parsePopupHtml('<a href="https://a" target="_blank">Stocks &amp; bonds</a><BR><a href="https://b">Oil</a>')).toEqual([{ url: 'https://a', title: 'Stocks & bonds' }, { url: 'https://b', title: 'Oil' }]);
    const p = parseGeo({ type: 'FeatureCollection', features: [geo('London, England, United Kingdom', -0.1, 51.5, 12, ['FTSE falls']), { geometry: null }] });
    expect(p).toEqual([{ name: 'London, England, United Kingdom', lon: -0.1, lat: 51.5, count: 12, articles: [{ url: 'https://x/FTSE%20falls0', title: 'FTSE falls' }] }]);
    expect(countryOf('Tokyo, Tokyo, Japan')).toBe('Japan');
  });
  it('merges negative and positive queries into hotspots with net tone', () => {
    const neg = parseGeo({ features: [geo('London, England, United Kingdom', -0.1, 51.5, 30, ['A']), geo('Tokyo, Japan', 139.7, 35.7, 5, ['B'])] });
    const pos = parseGeo({ features: [geo('London, United Kingdom', -0.12, 51.51, 10, ['C'])] });
    const h = mergeHotspots(neg, pos);
    expect(h[0]).toMatchObject({ country: 'United Kingdom', neg: 30, pos: 10, tone: -0.5 });
    expect(h[0].articles).toHaveLength(2);
    expect(h[1]).toMatchObject({ country: 'Japan', tone: -1 });
  });
  it('weather: 60% ETF move + 40% news tone; storms for fear, sun for greed', () => {
    const uk = REGIONS.find((r) => r.id === 'uk')!;
    const hs = mergeHotspots(parseGeo({ features: [geo('London, United Kingdom', 0, 51, 40, ['x'])] }), []);
    expect(regionWeather(uk, -2.5, hs)).toMatchObject({ weather: 'storm', tone: -1 });
    expect(regionWeather(uk, 1.6, mergeHotspots([], parseGeo({ features: [geo('London, United Kingdom', 0, 51, 40, ['x'])] })))).toMatchObject({ weather: 'sun' });
    expect(regionWeather(uk, 0.1, [])).toMatchObject({ weather: 'cloud', tone: null }); // too few articles -> ETF only
    expect(regionWeather(uk, null, [])).toMatchObject({ weather: null, score: null });
  });
});

describe('money flow proxy', () => {
  const flat = Array(40).fill(100);
  const vol = (hot: boolean) => (i: number) => (hot && i >= 35 ? 3e6 : 1e6);
  it('relative return vs SPY x dollar-volume ratio; arcs from outflows to inflows', () => {
    const series = {
      XLK: barsFrom([...flat.slice(0, 35), ...ramp(100, 110, 5)], { vol: vol(true) }), // +10% on 3x volume
      XLU: barsFrom([...flat.slice(0, 35), ...ramp(100, 95, 5)], { vol: vol(true) }), // -5% on 3x
      GLD: barsFrom([...flat.slice(0, 35), ...ramp(100, 101, 5)]), // +1%
    };
    const spy = barsFrom([...flat.slice(0, 35), ...ramp(100, 102, 5)]);
    const rows = computeFlows(series, spy, '5D');
    expect(rows.map((r) => r.sym)).toEqual(['XLK', 'GLD', 'XLU']);
    const xlk = rows[0];
    expect(xlk.rel).toBeCloseTo(8);
    expect(xlk.volRatio).toBeGreaterThan(2.5);
    expect(rows.find((r) => r.sym === 'GLD')!.flow).toBeCloseTo(-1 * 1, 0); // -1% relative on normal volume
    const arcs = flowArcs(rows);
    expect(arcs.every((a) => ['XLU', 'GLD'].includes(a.from) && a.to === 'XLK')).toBe(true);
  });
  it('parses Binance klines and CoinGecko charts into daily bars with dollar volume', () => {
    const b = parseBinanceKlines([[1793664000000, '70000', '71000', '69000', '70500', '1000', 0, '70500000', 0, 0, 0, 0]]);
    expect(b[0]).toMatchObject({ time: 1793664000, close: 70500 });
    expect(b[0].close * b[0].volume).toBeCloseTo(70_500_000);
    const g = parseGeckoChart({ prices: [[1793664000000, 3000]], total_volumes: [[1793664000000, 9e9]] });
    expect(g[0].close * g[0].volume).toBeCloseTo(9e9);
    expect(() => parseBinanceKlines({ code: 0, msg: 'Service unavailable from a restricted location' })).toThrow(/restricted/);
  });
});

import { CHOKEPOINTS, collectVessels, layerHotspots } from '../shared/world';
describe('extra map layers', () => {
  it('one-sided GEO points become neutral hotspots', () => {
    const h = layerHotspots([{ name: 'Kyiv, Ukraine', lat: 50.45, lon: 30.5, count: 12, articles: [{ title: 'a', url: 'u' }] }]);
    expect(h[0]).toMatchObject({ neg: 12, pos: 0, tone: 0, country: 'Ukraine' });
  });
  it('vessels: latest position per ship, tankers from static data type 80-89', () => {
    const v = collectVessels([
      { MetaData: { MMSI: 1, ShipName: 'GULF STAR ', latitude: 26.5, longitude: 56.2 }, Message: { PositionReport: { Sog: 12.1 } } },
      { MetaData: { MMSI: 1, ShipName: 'GULF STAR', latitude: 26.6, longitude: 56.3 }, Message: { ShipStaticData: { Type: 84 } } },
      { MetaData: { MMSI: 2, ShipName: '', latitude: 2.5, longitude: 101 }, Message: { PositionReport: { Sog: 9 } } },
      { MetaData: { MMSI: 3, latitude: 0, longitude: 0 } },
    ]);
    expect(v).toHaveLength(2);
    expect(v[0]).toMatchObject({ mmsi: 1, name: 'GULF STAR', lat: 26.6, tanker: true, sog: 12.1 });
    expect(v[1]).toMatchObject({ name: 'MMSI 2', tanker: false });
  });
  it('every chokepoint box contains its marker', () => {
    for (const c of CHOKEPOINTS) {
      const [[a, b], [cc, d]] = c.box;
      expect(c.lat >= a && c.lat <= cc && c.lon >= b && c.lon <= d).toBe(true);
    }
  });
});
