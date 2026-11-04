// World map overlay (M): one map, two layers. News = GDELT hotspots colored by tone. Weather = regional fear/greed.
import { useMemo, useState } from 'react';
import { geoNaturalEarth1, geoPath, geoGraticule10 } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import type { WorldState } from '../data/world';
import type { Hotspot, RegionWeather, Weather } from '../../shared/world';
import { tagSymbols } from '../../shared/news';
import { usePersisted } from '../lib/store';
import { pct } from '../lib/format';
import { Fresh, Seg } from './common';

const W = 960, H = 500;
const proj = geoNaturalEarth1().fitSize([W, H], { type: 'Sphere' });
const path = geoPath(proj);
const topo = world as unknown as Topology<{ countries: GeometryCollection }>;
const countries = feature(topo, topo.objects.countries);
const graticule = path(geoGraticule10()) ?? '';
const sphere = path({ type: 'Sphere' }) ?? '';
/** Nudge glyphs/labels where regions sit close together (screen px). */
const NUDGE: Record<string, [number, number]> = { uk: [-16, -10], eu: [14, 10], cn: [-18, 4], kr: [6, -18], jp: [22, 6], tw: [8, 18], mx: [-6, 8], us: [6, -6] };

function WeatherGlyph({ w, x, y }: { w: Weather; x: number; y: number }) {
  const sun = <><circle cx={x} cy={y} r={7} className="wx-sun" />{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <line key={a} x1={x + 10 * Math.cos((a * Math.PI) / 180)} y1={y + 10 * Math.sin((a * Math.PI) / 180)} x2={x + 13 * Math.cos((a * Math.PI) / 180)} y2={y + 13 * Math.sin((a * Math.PI) / 180)} className="wx-ray" />)}</>;
  const cloud = (dx = 0, dy = 0, cls = 'wx-cloud') => <path className={cls} d={`M${x - 11 + dx},${y + 4 + dy} a5,5 0 0,1 3,-9 a7,7 0 0,1 13,-1 a5,5 0 0,1 6,10 z`} />;
  if (w === 'sun') return <g>{sun}</g>;
  if (w === 'partly') return <g transform={`translate(-3,-3)`}>{sun}{cloud(5, 6)}</g>;
  if (w === 'cloud') return <g>{cloud()}</g>;
  if (w === 'rain') return <g>{cloud(0, 0, 'wx-cloud dark')}{[-6, 0, 6].map((d) => <line key={d} x1={x + d} y1={y + 7} x2={x + d - 2} y2={y + 13} className="wx-rain" />)}</g>;
  return <g>{cloud(0, 0, 'wx-cloud storm')}<path className="wx-bolt" d={`M${x},${y + 4} l-4,7 h4 l-2,7 l7,-10 h-4 l2,-4 z`} /></g>;
}

export default function WorldMap({ data, symbols, names, onSelect, onClose }: {
  data: WorldState | null; symbols: string[]; names: Record<string, string>; onSelect: (s: string) => void; onClose: () => void;
}) {
  const [layer, setLayer] = usePersisted<'news' | 'weather'>('mapLayer', 'news');
  const [selHot, setSelHot] = useState<Hotspot | null>(null);
  const [selReg, setSelReg] = useState<RegionWeather | null>(null);
  const maxCount = useMemo(() => Math.max(1, ...(data?.hotspots ?? []).map((h) => h.pos + h.neg)), [data]);
  const affected = useMemo(() => {
    if (!selHot) return [];
    const t = selHot.articles.map((a) => a.title).join(' · ');
    const etf = data?.regions.find((r) => r.label.includes(selHot.country) || (r.id === 'us' && selHot.country === 'United States'))?.etf;
    return [...new Set([...tagSymbols(t, symbols, names), ...(etf ? [etf] : [])])];
  }, [selHot, symbols, names, data]);
  const toneClass = (t: number) => (t > 0.15 ? 'pos' : t < -0.15 ? 'neg' : 'mid');

  return (
    <div className="overlay" role="dialog" aria-label="World map">
      <div className="overlay-in wm">
        <div className="phead">
          <div className="phead-title">World map</div>
          <div className="phead-ctl">
            <Seg value={layer} onChange={setLayer} options={[{ id: 'news', label: 'News' }, { id: 'weather', label: 'Sentiment weather' }]} />
            {data && <Fresh kind={data.freshness} at={data.asOf} src="GDELT GEO 2.0 (24h market news, split by tone) + country ETFs (Finnhub)" />}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="wm-body">
          <svg viewBox={`0 0 ${W} ${H}`} className="wm-svg" onClick={() => { setSelHot(null); setSelReg(null); }}>
            <defs>
              <filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            <path d={sphere} className="wm-sphere" />
            <path d={graticule} className="wm-grat" />
            {countries.features.map((f, i) => <path key={i} d={path(f) ?? ''} className="wm-land" />)}
            {layer === 'news' && data?.hotspots.map((h) => {
              const p = proj([h.lon, h.lat]);
              if (!p) return null;
              const r = 3 + 12 * Math.sqrt((h.pos + h.neg) / maxCount);
              return (
                <g key={h.id} className={`hot ${toneClass(h.tone)} ${selHot?.id === h.id ? 'sel' : ''}`} onClick={(e) => { e.stopPropagation(); setSelHot(h); setSelReg(null); }}>
                  <circle cx={p[0]} cy={p[1]} r={r} filter="url(#glow)" />
                  <circle cx={p[0]} cy={p[1]} r={r} className="hot-pulse" />
                  <title>{h.name}: {h.neg} negative / {h.pos} positive</title>
                </g>
              );
            })}
            {layer === 'weather' && data?.regions.map((g) => {
              const raw = proj([g.lon, g.lat]);
              if (!raw || !g.weather) return null;
              const n = NUDGE[g.id] ?? [0, 0];
              const p: [number, number] = [raw[0] + n[0], raw[1] + n[1]];
              return (
                <g key={g.id} className={`wx ${selReg?.id === g.id ? 'sel' : ''}`} onClick={(e) => { e.stopPropagation(); setSelReg(g); setSelHot(null); }}>
                  <circle cx={p[0]} cy={p[1]} r={20} className="wx-hit" />
                  <WeatherGlyph w={g.weather} x={p[0]} y={p[1] - 4} />
                  <text x={p[0]} y={p[1] + 22} className="wx-l">{g.etf} {g.chgPct != null ? pct(g.chgPct, 1) : ''}</text>
                  <title>{g.label}: {g.weather}</title>
                </g>
              );
            })}
          </svg>
          <aside className="wm-side">
            {selHot ? (
              <>
                <h4>{selHot.name}</h4>
                <div className="kv"><span>Negative-tone articles</span><b className="num down">{selHot.neg}</b><span>Positive-tone articles</span><b className="num up">{selHot.pos}</b><span>Net tone</span><b className={`num ${selHot.tone > 0 ? 'up' : selHot.tone < 0 ? 'down' : ''}`}>{selHot.tone.toFixed(2)}</b></div>
                <h4>Tickers it affects</h4>
                <div className="wm-chips">{affected.length ? affected.map((s) => <button key={s} className="sym-chip" onClick={() => onSelect(s)}>{s}</button>) : <span className="muted small">None of your tickers are named.</span>}</div>
                <h4>Headlines</h4>
                <ul className="news">{selHot.articles.slice(0, 20).map((a, i) => <li key={i}><span /><span className="news-t">{a.url ? <a href={a.url} target="_blank" rel="noreferrer noopener">{a.title}</a> : a.title}</span></li>)}</ul>
              </>
            ) : selReg ? (
              <>
                <h4>{selReg.label}</h4>
                <div className="kv">
                  <span>Weather</span><b>{selReg.weather}</b>
                  <span>{selReg.etf} today</span><b className={`num ${(selReg.chgPct ?? 0) >= 0 ? 'up' : 'down'}`}>{selReg.chgPct != null ? pct(selReg.chgPct) : 'n/a'}</b>
                  <span>News tone</span><b className="num">{selReg.tone != null ? selReg.tone.toFixed(2) : `n/a (${selReg.articles} articles)`}</b>
                  <span>Score</span><b className="num">{selReg.score?.toFixed(2) ?? '—'}</b>
                </div>
                <button className="btn" onClick={() => onSelect(selReg.etf)}>Chart {selReg.etf}</button>
                <p className="note">Score = 60% the country ETF’s move today (±2% = ±1) + 40% net news tone in that region. Storm ≤ −0.5, rain ≤ −0.15, sun ≥ +0.5.</p>
              </>
            ) : (
              <>
                <h4>{layer === 'news' ? 'News hotspots' : 'Sentiment weather'}</h4>
                <p className="small muted">{layer === 'news'
                  ? 'Where market news is happening in the last 24 hours. Size = article count; green = mostly positive tone, red = mostly negative. Click a hotspot for its headlines and the tickers they name.'
                  : 'Fear and greed by region: storms for fear, sunshine for greed. Click a region for the numbers behind it.'}</p>
                {layer === 'news' && <ol className="wm-top">{data?.hotspots.slice(0, 12).map((h) => <li key={h.id}><button className="link" onClick={() => setSelHot(h)}>{h.name.split(',')[0]}</button> <span className={`num small ${h.tone > 0 ? 'up' : h.tone < 0 ? 'down' : 'muted'}`}>{h.pos + h.neg}</span></li>)}</ol>}
                {layer === 'weather' && <ul className="wm-top">{data?.regions.filter((r) => r.score != null).sort((a, b) => a.score! - b.score!).map((r) => <li key={r.id}><button className="link" onClick={() => setSelReg(r)}>{r.label}</button> <span className="small muted">{r.weather}</span></li>)}</ul>}
                {data?.errors && Object.keys(data.errors).length > 0 && <p className="small down">{Object.entries(data.errors).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}
                {!data && <p className="muted small">Loading…</p>}
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
