// World map overlay (M). Built to draw instantly: the outline is pre-baked, dots are plain circles (no blur filters, only the top 3 pulse),
// the last good data shows first and refreshes behind it. Right side: a ranked hot list that lights up its dot on hover.
// Extras: day/night shading, which stock markets are open, a 24-hour replay slider (desk-news data only), country ETF heat tiles.
// Layers: Market news, Conflicts, Shipping & oil, Deals. (Weather and Lawsuits were taken off the toolbar on Nov 8, 2026; the data
// code for lawsuits still exists in shared/world.ts, see the Trading Desk Guide for how to bring either back.)
import { useDesk } from '../lib/deskctx';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useWorldLayer, type WorldState } from '../data/world';
import type { DataMode } from '../data/live';
import { LAYER_LABEL, REGIONS, hasTimes, hotspotsAt, spotTotal, type ExtraLayer, type Hotspot } from '../../shared/world';
import { MARKETS, isOpen, nightPath, project } from '../../shared/mapgeo';
import { GRATICULE, LAND, MAP_H, MAP_SCALE, MAP_TX, MAP_TY, MAP_W, SPHERE } from '../data/worldLand';
import { tagSymbols } from '../../shared/news';
import { usePersisted } from '../lib/store';
import { pct } from '../lib/format';
import { etTime } from '../lib/clock';
import { Fresh, Seg } from './common';

const FIT = { scale: MAP_SCALE, tx: MAP_TX, ty: MAP_TY };
type MapLayer = 'news' | ExtraLayer;
const LAYERS: MapLayer[] = ['news', 'conflict', 'shipping', 'deals'];
const STEPS = 96; // 24 hours in 15-minute steps

const Base = memo(function Base() {
  return <><path d={SPHERE} className="wm-sphere" /><path d={GRATICULE} className="wm-grat" /><path d={LAND} className="wm-land" /></>;
});
const Night = memo(function Night({ at }: { at: number }) {
  const d = useMemo(() => nightPath(at, FIT), [at]);
  return <path d={d} className="wm-night" />;
});

const Dots = memo(function Dots({ spots, maxCount, cls, selId, hoverId, onPick }: { spots: Hotspot[]; maxCount: number; cls: (h: Hotspot) => string; selId?: string; hoverId?: string | null; onPick: (h: Hotspot) => void }) {
  // name tags on the top 5 dots, skipping any that would sit on top of an earlier tag
  const tagged = new Set<string>(), placed: [number, number][] = [];
  spots.slice(0, 5).forEach((h) => { const [x, y] = project(h.lon, h.lat, FIT); if (!placed.some(([a, b]) => Math.abs(a - x) < 90 && Math.abs(b - y) < 13)) { tagged.add(h.id); placed.push([x, y]); } });
  return (
    <>
      {spots.slice(0, 90).map((h, i) => {
        const [x, y] = project(h.lon, h.lat, FIT);
        const r = 3 + 12 * Math.sqrt(spotTotal(h) / maxCount);
        return (
          <g key={h.id} className={`hot ${cls(h)} ${selId === h.id ? 'sel' : ''} ${hoverId === h.id ? 'hv' : ''}`} onClick={(e) => { e.stopPropagation(); onPick(h); }}>
            <circle cx={x} cy={y} r={r} />
            {i < 3 && <circle cx={x} cy={y} r={r} className="hot-pulse" />}
            {tagged.has(h.id) && <text x={x + r + 3} y={y + 3.5} className="hot-lbl">{h.name.split(',')[0]}</text>}
            <title>{h.name}</title>
          </g>
        );
      })}
    </>
  );
});

export default function WorldMap({ data, symbols, names, onSelect, onClose, mode }: {
  data: WorldState | null; symbols: string[]; names: Record<string, string>; onSelect: (s: string) => void; onClose: () => void; mode: DataMode;
}) {
  const { openArticle } = useDesk();
  const [saved, setLayer] = usePersisted<string>('mapLayer', 'news');
  const layer: MapLayer = (LAYERS as string[]).includes(saved) ? (saved as MapLayer) : 'news'; // old saved choices (weather, lawsuits) fall back to news
  const extraLayer = layer === 'news' ? null : layer;
  const lay = useWorldLayer(extraLayer, mode);
  const [selChoke, setSelChoke] = useState<string | null>(null);
  const [selHot, setSelHot] = useState<Hotspot | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);

  const all = extraLayer ? lay?.hotspots ?? [] : data?.hotspots ?? [];
  const state = extraLayer ? lay : data;
  const endAt = state?.asOf ?? now;

  // 24-hour replay: step 0..STEPS = from 24 h before the data to the data's time; null = everything (now)
  const timed = hasTimes(all);
  const [step, setStep] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const stepRef = useRef(0);
  useEffect(() => { setStep(null); setPlaying(false); }, [layer]);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      stepRef.current += 1;
      if (stepRef.current >= STEPS) { setStep(null); setPlaying(false); return; }
      setStep(stepRef.current);
    }, 130);
    return () => clearInterval(id);
  }, [playing]);
  const startAt = endAt - 24 * 3600_000;
  const upto = step == null ? null : startAt + (step / STEPS) * 24 * 3600_000;
  const spots = useMemo(() => (upto == null ? all : hotspotsAt(all, upto, !!extraLayer)), [all, upto, extraLayer]);
  const maxCount = useMemo(() => Math.max(1, ...all.map(spotTotal)), [all]);

  const toneClass = (t: number) => (t > 0.15 ? 'pos' : t < -0.15 ? 'neg' : 'mid');
  const cls = useMemo(() => (h: Hotspot) => (extraLayer ? `lay-${extraLayer}` : toneClass(h.tone)), [extraLayer]);
  const pick = (h: Hotspot) => { setSelHot(h); setSelChoke(null); };
  const regionOf = (h: Hotspot) => { const id = REGIONS.find((r) => r.countries.includes(h.country))?.id; return id ? data?.regions.find((r) => r.id === id) : undefined; };
  const affected = useMemo(() => {
    if (!selHot) return [];
    const t = selHot.articles.map((a) => a.title).join(' · ');
    const etf = regionOf(selHot)?.etf;
    return [...new Set([...tagSymbols(t, symbols, names), ...(etf ? [etf] : [])])];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selHot, symbols, names, data]);

  const open = useMemo(() => MARKETS.filter((m) => isOpen(m, now)), [now]);
  const ships = extraLayer === 'shipping' ? lay?.ships ?? [] : [];
  const tiles = useMemo(() => [...(data?.regions ?? [])].filter((r) => r.chgPct != null).sort((a, b) => b.chgPct! - a.chgPct!), [data]);
  const note = extraLayer ? lay?.note : data?.note;
  const placement = extraLayer ? lay?.placement : data?.placement;
  const errs = (extraLayer ? lay?.errors : data?.errors) ?? {};

  return (
    <div className="overlay" role="dialog" aria-label="World map">
      <div className="overlay-in wm">
        <div className="phead">
          <div className="phead-title">World map</div>
          <div className="phead-ctl">
            <Seg<MapLayer> value={layer} onChange={(l) => { setLayer(l); setSelHot(null); setSelChoke(null); }} options={[{ id: 'news', label: 'Market news' }, { id: 'conflict', label: 'Conflicts' }, { id: 'shipping', label: 'Shipping & oil' }, { id: 'deals', label: 'Deals' }]} />
            {state && <Fresh kind={state.freshness} at={state.asOf}
              src={`${state.cached ? 'Saved copy from your last visit, refreshing. ' : ''}${extraLayer
                ? `${lay?.via === 'desk' ? 'Desk news feeds (RSS + Finnhub, last 24h)' : 'GDELT GEO 2.0 (last 24h'}, ${LAYER_LABEL[extraLayer]} query)${extraLayer === 'shipping' ? ' + EIA chokepoints + aisstream.io ships' : ''}`
                : `${data?.sources?.news ?? 'GDELT GEO 2.0 (24h market news, split by tone)'} + ${data?.sources?.market ?? 'country ETFs'}`}`} />}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="wm-body">
          <div className="wm-mapcol">
            <div className="wm-stage">
              <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="wm-svg" onClick={() => { setSelHot(null); setSelChoke(null); }}>
                <Base />
                <Night at={upto ?? now} />
                {open.map((m) => { const [x, y] = project(m.lon, m.lat, FIT); return <g key={m.id} className="mkt"><circle cx={x} cy={y} r={5} /><title>{`${m.name} market is open`}</title></g>; })}
                {ships.map((v) => { const [x, y] = project(v.lon, v.lat, FIT); return <circle key={v.mmsi} cx={x} cy={y} r={v.tanker ? 3 : 2} className={`ship ${v.tanker ? 'tanker' : ''}`}><title>{`${v.name}${v.tanker ? ' · tanker' : ''}${v.sog != null ? ` · ${v.sog} kn` : ''}`}</title></circle>; })}
                {extraLayer === 'shipping' && lay?.chokepoints.map((c) => { const [x, y] = project(c.lon, c.lat, FIT); return (
                  <g key={c.id} className={`choke ${selChoke === c.id ? 'sel' : ''}`} onClick={(e) => { e.stopPropagation(); setSelChoke(c.id); setSelHot(null); }}>
                    <rect x={x - 5} y={y - 5} width={10} height={10} transform={`rotate(45 ${x} ${y})`} /><text x={x + 9} y={y + 4}>{c.name}</text><title>{c.note}</title>
                  </g>); })}
                <Dots spots={spots} maxCount={maxCount} cls={cls} selId={selHot?.id} hoverId={hoverId} onPick={pick} />
              </svg>
              <div className="wm-open" aria-label="Markets open now">
                {open.length ? <><i /> Open now: {open.map((m) => m.name).join(', ')}</> : <span className="muted">All six major markets closed</span>}
                <span className="muted"> · shading = night (approx.)</span>
              </div>
              {!state && <div className="wm-load">Loading headlines…</div>}
            </div>
            {timed && (
              <div className="wm-replay" aria-label="24-hour replay">
                <button className="hw-btn" onClick={() => { if (playing) { setPlaying(false); return; } stepRef.current = 0; setStep(0); setPlaying(true); }} aria-label={playing ? 'Pause replay' : 'Replay the last 24 hours'}>{playing ? '❚❚' : '▶'}</button>
                <input type="range" min={0} max={STEPS} value={step ?? STEPS} onChange={(e) => { const v = +e.target.value; setPlaying(false); stepRef.current = v; setStep(v >= STEPS ? null : v); }} aria-label="Replay position" />
                <span className="small num">{upto == null ? 'Now' : `${etTime(upto)} ET`}</span>
                <span className="small muted">{upto == null ? 'drag back to replay the last 24 hours' : `${Math.round((endAt - upto) / 3600_000)}h ago`}</span>
              </div>
            )}
            {!extraLayer && tiles.length > 0 && (
              <div className="wm-tiles" aria-label="Country ETFs today">
                {tiles.map((r) => {
                  const v = r.chgPct!, a = Math.min(70, 10 + Math.abs(v) * 28);
                  return (
                    <button key={r.id} className="wm-tile" style={{ background: `color-mix(in srgb, var(${v >= 0 ? '--up' : '--down'}) ${a}%, var(--panel))` }} title={`${r.label} (${r.etf}): click to chart`} onClick={() => onSelect(r.etf)}>
                      <span>{r.etf}</span><b className="num">{pct(v, 1)}</b><em>{r.label.split(' / ')[0]}</em>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <aside className="wm-side">
            {selHot ? (
              <>
                <button className="link small" onClick={() => setSelHot(null)}>← All hotspots</button>
                <h4>{selHot.name}</h4>
                {extraLayer ? <div className="kv"><span>{LAYER_LABEL[extraLayer]} articles (24h)</span><b className="num">{selHot.neg}</b></div>
                  : <div className="kv"><span>Negative-tone articles</span><b className="num down">{selHot.neg}</b><span>Positive-tone articles</span><b className="num up">{selHot.pos}</b>{selHot.neu ? <><span>Neutral articles</span><b className="num">{selHot.neu}</b></> : null}<span>Net tone</span><b className={`num ${selHot.tone > 0 ? 'up' : selHot.tone < 0 ? 'down' : ''}`}>{selHot.tone.toFixed(2)}</b></div>}
                <h4>Tickers it affects</h4>
                <div className="wm-chips">{affected.length ? affected.map((s) => <button key={s} className="sym-chip" onClick={() => onSelect(s)}>{s}</button>) : <span className="muted small">None of your tickers are named.</span>}</div>
                <h4>Headlines</h4>
                <ul className="news">{selHot.articles.slice(0, 20).map((a, i) => <li key={i}><span /><span className="news-t"><button className="link-plain news-hl" onClick={() => openArticle({ title: a.title, url: a.url, src: 'World map', t: a.t ?? Date.now(), syms: affected })} title="Open the article reader">{a.title}</button>{a.t ? <em className="small muted"> · {etTime(a.t)} ET</em> : null}</span></li>)}</ul>
              </>
            ) : selChoke && lay ? (() => { const c = lay.chokepoints.find((x) => x.id === selChoke)!; const near = (lay.ships ?? []).filter((v) => v.lat >= c.box[0][0] && v.lat <= c.box[1][0] && v.lon >= c.box[0][1] && v.lon <= c.box[1][1]); return (
              <>
                <button className="link small" onClick={() => setSelChoke(null)}>← All hotspots</button>
                <h4>{c.name}</h4>
                <p className="small">{c.note}</p>
                <div className="kv"><span>Ships seen (last snapshot)</span><b className="num">{lay.ships ? near.length : '—'}</b><span>Known tankers</span><b className="num">{lay.ships ? near.filter((v) => v.tanker).length : '—'}</b></div>
                {near.length > 0 && <ul className="news">{near.slice(0, 25).map((v) => <li key={v.mmsi}><span /><span className="news-t">{v.name}{v.tanker ? ' · tanker' : ''}{v.sog != null ? ` · ${v.sog} kn` : ''}</span></li>)}</ul>}
                <p className="note">Source: U.S. EIA, World Oil Transit Chokepoints. Ships: aisstream.io free AIS feed, an 8-second snapshot refreshed every 5 minutes; tankers are marked only when the ship broadcast its type during the snapshot.</p>
              </>
            ); })() : (
              <>
                <h4>{extraLayer ? LAYER_LABEL[extraLayer] : 'Hot right now'}{upto != null ? <span className="muted"> · as of {etTime(upto)} ET</span> : null}</h4>
                {extraLayer === 'shipping' && lay && !lay.shipsKey && <p className="small warn-txt">Add a free AISSTREAM_API_KEY (aisstream.io) in Vercel to see ship positions. Chokepoints and shipping news work without it.</p>}
                {!state && <p className="muted small">Loading…</p>}
                {state && !spots.length && <p className="muted small">{upto != null ? 'No headlines yet at this time.' : 'Nothing placed on the map right now.'}</p>}
                <ol className="wm-rank">
                  {spots.slice(0, 12).map((h) => {
                    const n = spotTotal(h), reg = extraLayer ? undefined : regionOf(h);
                    return (
                      <li key={h.id} onMouseEnter={() => setHoverId(h.id)} onMouseLeave={() => setHoverId(null)}>
                        <button className="wm-row" onClick={() => pick(h)}>
                          <span className="wm-nm">{h.name.split(',')[0]}</span>
                          {!extraLayer && n > 0 && <span className="wm-tone" title={`${h.pos} positive · ${h.neg} negative`}><i className="up" style={{ width: `${(h.pos / n) * 100}%` }} /><i className="down" style={{ width: `${(h.neg / n) * 100}%` }} /></span>}
                          <span className="num small">{n}</span>
                          {reg?.chgPct != null && <b className={`num small ${reg.chgPct >= 0 ? 'up' : 'down'}`} title={`${reg.etf} today`}>{pct(reg.chgPct, 1)}</b>}
                        </button>
                      </li>
                    );
                  })}
                </ol>
                {extraLayer && <p className="small muted">{{ conflict: 'Where news reports armed conflict in the last 24 hours. Size = article count.', shipping: 'Oil chokepoints (diamonds), shipping news hotspots, and live ship positions near the chokepoints when a free aisstream.io key is set.', deals: 'Where news reports acquisitions, mergers, new factories and big investments in the last 24 hours.', legal: '' }[extraLayer]}</p>}
                {!extraLayer && <p className="small muted">Size = article count; green = mostly positive tone, red = mostly negative. Hover a row to find its dot; click for headlines and the tickers they name.</p>}
                {note && <p className="small muted">{note}</p>}
                {!note && placement === 'headline' && <p className="small warn-txt">GDELT’s map service is down right now, so dots are placed by the country or place each headline names (or the outlet’s country). Coarser than usual.</p>}
                {Object.keys(errs).length > 0 && <p className="small down">{Object.entries(errs).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
