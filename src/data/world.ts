import { useEffect, useState } from 'react';
import type { Bar, Freshness } from '../types';
import type { DataMode } from './live';
import { REGIONS, regionWeather, type Hotspot, type RegionWeather } from '../../shared/world';
import { ROT_ASSETS, riskAppetite, rotationRows, type RotRow } from '../../shared/rotation';
import { DEMO_AT, makeCandles, rng } from '../lib/demo';

export interface WorldState { hotspots: Hotspot[]; regions: RegionWeather[]; placement?: 'geo' | 'headline'; errors: Record<string, string>; asOf: number; freshness: Freshness }
export interface FlowsState { rows: RotRow[]; risk: ReturnType<typeof riskAppetite>; pending: string[]; sources: string[]; asOfDay: string | null; asOf: number; freshness: Freshness }

const CITIES: [string, number, number][] = [
  ['New York, New York, United States', 40.7, -74], ['Washington, District of Columbia, United States', 38.9, -77], ['Chicago, Illinois, United States', 41.9, -87.6],
  ['San Francisco, California, United States', 37.8, -122.4], ['Toronto, Ontario, Canada', 43.7, -79.4], ['Mexico City, Mexico', 19.4, -99.1],
  ['Sao Paulo, Brazil', -23.5, -46.6], ['London, England, United Kingdom', 51.5, -0.1], ['Frankfurt, Germany', 50.1, 8.7], ['Paris, France', 48.9, 2.35],
  ['Brussels, Belgium', 50.85, 4.35], ['Moscow, Russia', 55.75, 37.6], ['Riyadh, Saudi Arabia', 24.7, 46.7], ['Dubai, United Arab Emirates', 25.2, 55.3],
  ['Mumbai, Maharashtra, India', 19.1, 72.9], ['Beijing, China', 39.9, 116.4], ['Shanghai, China', 31.2, 121.5], ['Hong Kong, Hong Kong', 22.3, 114.2],
  ['Taipei, Taiwan', 25, 121.5], ['Seoul, South Korea', 37.6, 127], ['Tokyo, Japan', 35.7, 139.7], ['Sydney, New South Wales, Australia', -33.9, 151.2],
];

function demoWorld(): WorldState {
  const r = rng(2026);
  const hotspots: Hotspot[] = CITIES.map(([name, lat, lon], i) => {
    const neg = Math.round(r() * 40), pos = Math.round(r() * 40);
    return { id: `d${i}`, name, country: name.split(', ').at(-1)!, lat, lon, neg, pos, tone: (pos - neg) / Math.max(1, pos + neg),
      articles: [{ title: `Sample headline about markets in ${name.split(',')[0]} (demo)`, url: '' }, { title: `Sample: NVDA and AMD suppliers react in ${name.split(',')[0]} (demo)`, url: '' }] };
  });
  const regions = REGIONS.map((g) => regionWeather(g, +((r() - 0.5) * 4).toFixed(2), hotspots));
  return { hotspots, regions, errors: {}, asOf: DEMO_AT, freshness: 'demo' };
}

function demoFlows(): FlowsState {
  const r = rng(99);
  const series: Record<string, Bar[]> = {};
  for (const a of ROT_ASSETS) series[a.sym] = makeCandles(a.sym, 'D', 20 + r() * 200);
  const spy = makeCandles('SPY', 'D', 580);
  const rows = rotationRows(series, spy);
  return { rows, risk: riskAppetite(series, spy), pending: [], sources: ['Generated sample candles'], asOfDay: rows[0]?.asOf ?? null, asOf: DEMO_AT, freshness: 'demo' };
}

/** Only fetches while the overlay is open; GDELT is cached 30 min server-side. */
export function useWorld(mode: DataMode, open: boolean): WorldState | null {
  const [st, setSt] = useState<WorldState | null>(null);
  useEffect(() => {
    if (!open || mode.kind === 'checking') return;
    if (mode.kind === 'demo') { setSt(demoWorld()); return; }
    let stop = false;
    const go = () => fetch('/api/world').then(async (r) => { const j = await r.json(); if (!stop && r.ok) setSt({ ...j, freshness: j.hotspots.length ? 'live' : 'nodata' }); }).catch(() => {});
    go();
    const id = setInterval(go, 10 * 60_000);
    return () => { stop = true; clearInterval(id); };
  }, [mode.kind, open]);
  return st;
}

export function useFlows(mode: DataMode, open: boolean): FlowsState | null {
  const [st, setSt] = useState<FlowsState | null>(null);
  useEffect(() => {
    if (!open || mode.kind === 'checking') return;
    if (mode.kind === 'demo') { setSt(demoFlows()); return; }
    let stop = false, t: ReturnType<typeof setTimeout>;
    const go = async () => {
      try { const r = await fetch('/api/flows'); const j = await r.json(); if (!stop && r.ok) setSt({ ...j, freshness: 'eod' }); if (!stop) t = setTimeout(go, r.ok && !j.pending?.length ? 60 * 60_000 : 90_000); } catch { if (!stop) t = setTimeout(go, 5 * 60_000); }
    };
    go();
    return () => { stop = true; clearTimeout(t); };
  }, [mode.kind, open]);
  return st;
}

/* ---------------- extra layers: conflicts, shipping & oil, lawsuits, deals ---------------- */
import { CHOKEPOINTS, type Chokepoint, type ExtraLayer, type Vessel } from '../../shared/world';
export interface LayerState { layer: ExtraLayer; hotspots: Hotspot[]; chokepoints: Chokepoint[]; ships: Vessel[] | null; shipsKey: boolean; placement?: 'geo' | 'headline'; errors: Record<string, string>; asOf: number; freshness: Freshness }

function demoLayer(layer: ExtraLayer): LayerState {
  const r = rng(layer.length * 31);
  const pick = CITIES.filter(() => r() < 0.5);
  const hotspots: Hotspot[] = pick.map(([name, lat, lon], i) => ({ id: `${layer}${i}`, name, country: name.split(', ').at(-1)!, lat, lon, neg: 1 + Math.round(r() * 30), pos: 0, tone: 0,
    articles: [{ title: `Sample ${layer} headline near ${name.split(',')[0]} (demo)`, url: '' }] }));
  const ships: Vessel[] | null = layer === 'shipping' ? CHOKEPOINTS.flatMap((c, k) => Array.from({ length: 6 }, (_, j) => ({ mmsi: k * 100 + j, name: `SAMPLE ${k}-${j}`, lat: c.lat + (r() - 0.5) * 1.2, lon: c.lon + (r() - 0.5) * 1.6, tanker: r() < 0.4, sog: +(r() * 14).toFixed(1) }))) : null;
  return { layer, hotspots, chokepoints: layer === 'shipping' ? CHOKEPOINTS : [], ships, shipsKey: true, errors: {}, asOf: DEMO_AT, freshness: 'demo' };
}

export function useWorldLayer(layer: ExtraLayer | null, mode: DataMode): LayerState | null {
  const [st, setSt] = useState<LayerState | null>(null);
  useEffect(() => {
    if (!layer || mode.kind === 'checking') return;
    if (mode.kind === 'demo') { setSt(demoLayer(layer)); return; }
    let stop = false;
    setSt(null);
    const go = () => fetch(`/api/world?layer=${layer}`).then(async (r) => { const j = await r.json(); if (!stop && r.ok) setSt({ ...j, freshness: j.hotspots.length || j.ships?.length ? 'live' : 'nodata' }); }).catch(() => {});
    go();
    const id = setInterval(go, 10 * 60_000);
    return () => { stop = true; clearInterval(id); };
  }, [layer, mode.kind]);
  return st;
}
