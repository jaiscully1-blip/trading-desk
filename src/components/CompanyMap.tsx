// Where the S&P 500 (+ Nasdaq-100 extras) are headquartered, and (World > Every listed company) ~9,000 listed companies
// worldwide from Wikidata. The map fills the page; a floating panel on the right (fold it away) holds Movers, Sectors,
// States and Find. With live data the dots are colored by today's move and sized by market cap.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { geoMercator, geoNaturalEarth1, geoPath, geoGraticule10, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import { COMPANIES, type CoRow } from '../../shared/data/companies';
import type { DataMode } from '../data/live';
import { usePersisted } from '../lib/store';
import { Seg } from './common';
import CompanyPage from './CompanyPage';
import { stateAgg, stateOf } from '../../shared/markets';
import { moveColor, pct, useSnapshot } from '../data/apis';
import { Fresh } from './common';

const W = 960, H = 540;
const topo = world as unknown as Topology<{ countries: GeometryCollection }>;
const countries = feature(topo, topo.objects.countries);
const PROJ: Record<'us' | 'world', GeoProjection> = {
  us: geoMercator().fitExtent([[10, 10], [W - 10, H - 10]], { type: 'MultiPoint', coordinates: [[-125, 24.5], [-66.5, 49.5]] }),
  world: geoNaturalEarth1().fitSize([W, H], { type: 'Sphere' }),
};
const SECTORS = [...new Set(COMPANIES.map((c) => c[2]))].sort();
const secIdx = (s: string) => SECTORS.indexOf(s);
const SYM_OK = /^[A-Z][A-Z0-9.\-]{0,9}$/;
/** dot radius from market cap: ~2.5 for $10B, ~13 for $3T */
const capR = (mc: number | null | undefined) => (mc && mc > 0 ? Math.max(2.2, Math.min(13, 1.8 + Math.sqrt(mc / 1e9) * 0.21)) : 2.6);

/** Companies in the same city sit on a small spiral so each dot stays clickable. */
function placed(proj: GeoProjection, rows: CoRow[]) {
  const byCity = new Map<string, CoRow[]>();
  for (const r of rows) byCity.set(r[4], [...(byCity.get(r[4]) ?? []), r]);
  const out: { r: CoRow; x: number; y: number }[] = [];
  for (const list of byCity.values()) {
    const p = proj([list[0][6], list[0][5]]);
    if (!p) continue;
    list.forEach((r, i) => {
      const a = i * 2.4, d = i === 0 ? 0 : 3.2 * Math.sqrt(i);
      out.push({ r, x: p[0] + d * Math.cos(a), y: p[1] + d * Math.sin(a) });
    });
  }
  return out;
}

// [name, ticker, exchange, country, lat, lon, yahoo]
type WRow = [string, string, string, string, number, number, string];
interface WorldFile { asOf: string; source: string; rows: WRow[] }
let worldP: Promise<WorldFile> | null = null;
const loadWorld = () => (worldP ??= fetch('/data/world-companies.json').then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }));

type Tab = 'movers' | 'sectors' | 'states' | 'find';

export default function CompanyMap({ mode, extra, onClose, onChart }: { mode: DataMode; extra?: ReactNode; onClose: () => void; onChart: (s: string) => void }) {
  const [view, setView] = usePersisted<'us' | 'world'>('coMapView', 'us');
  const [secOn, setSecOn] = usePersisted<string[]>('coMapSectors', []);
  const [q, setQ] = useState('');
  const [hov, setHov] = useState<CoRow | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const proj = PROJ[view];
  const [mapMode, setMapMode] = usePersisted<'dots' | 'states'>('coMapMode', 'dots');
  const [colorBy, setColorBy] = usePersisted<'avg' | 'cap'>('coMapColor', 'avg');
  const [dotColor, setDotColor] = usePersisted<'move' | 'sector'>('coMapDotColor', 'move');
  const [panel, setPanel] = usePersisted<boolean>('coMapPanel', true);
  const [tab, setTab] = usePersisted<Tab>('coMapTab', 'movers');
  const [everyone, setEveryone] = usePersisted<boolean>('coMapWorldAll', false);
  const [stSel, setStSel] = useState<string | null>(null);
  const [ctySel, setCtySel] = useState<string | null>(null);
  const [wq, setWq] = useState('');
  const [wd, setWd] = useState<WorldFile | null>(null);
  const [wErr, setWErr] = useState('');
  const live = mode.kind === 'live';
  const snap = useSnapshot(live);
  const snapMap = snap.data?.snap ?? {};
  const hasSnap = Object.keys(snapMap).length > 0;
  const worldAll = view === 'world' && everyone;
  useEffect(() => { if (worldAll && !wd) loadWorld().then(setWd).catch((e) => setWErr(String(e.message ?? e))); }, [worldAll, wd]);

  const states = useMemo(() => stateAgg(snapMap).map((s) => { const p = proj([s.lon, s.lat]); return p ? { ...s, x: p[0], y: p[1], val: colorBy === 'cap' ? s.capWtd ?? s.avg : s.avg } : null; }).filter((s): s is NonNullable<typeof s> => !!s), [snapMap, proj, colorBy]);
  const stRow = stSel ? states.find((s) => s.state === stSel) ?? null : null;
  const stCos = stRow ? COMPANIES.filter((c) => stRow.syms.includes(c[0])).map((c) => ({ c, q: snapMap[c[0]] })).sort((a, b) => (b.q?.c ?? -1e9) - (a.q?.c ?? -1e9)) : [];
  const path = useMemo(() => geoPath(proj), [proj]);
  const land = useMemo(() => countries.features.map((f) => path(f) ?? ''), [path]);
  const grat = useMemo(() => path(geoGraticule10()) ?? '', [path]);
  const rows = useMemo(() => COMPANIES.filter((c) => !secOn.length || secOn.includes(c[2])), [secOn]);
  // biggest dots first so small ones stay on top and clickable
  const dots = useMemo(() => placed(proj, rows).sort((a, b) => (snapMap[b.r[0]]?.mc ?? 0) - (snapMap[a.r[0]]?.mc ?? 0)), [proj, rows, snapMap]);
  const ql = q.trim().toLowerCase();
  const match = (r: CoRow) => !!ql && (r[0].toLowerCase() === ql || r[1].toLowerCase().includes(ql));
  const hits = ql ? rows.filter(match).slice(0, 8) : [];
  const cityMates = hov ? COMPANIES.filter((c) => c[4] === hov[4]) : [];
  const toggleSec = (s: string) => setSecOn((xs) => (xs.includes(s) ? xs.filter((x) => x !== s) : [...xs, s]));
  const foreign = COMPANIES.filter((c) => c[6] < -130 || c[6] > -60 || c[5] < 18).length;
  const moveMode = dotColor === 'move' && hasSnap;

  // panel data
  const priced = rows.map((c) => ({ c, s: snapMap[c[0]] })).filter((x) => x.s && Number.isFinite(x.s.c));
  const gainers = [...priced].sort((a, b) => b.s!.c - a.s!.c).slice(0, 8);
  const losers = [...priced].sort((a, b) => a.s!.c - b.s!.c).slice(0, 8);
  const sectorStats = SECTORS.map((s) => {
    const xs = COMPANIES.filter((c) => c[2] === s).map((c) => snapMap[c[0]]).filter(Boolean);
    const cap = xs.reduce((t, x) => t + (x!.mc ?? 0), 0);
    const avg = xs.length ? xs.reduce((t, x) => t + x!.c, 0) / xs.length : null;
    const cw = cap ? xs.reduce((t, x) => t + x!.c * (x!.mc ?? 0), 0) / cap : null;
    return { s, n: COMPANIES.filter((c) => c[2] === s).length, avg, cw, up: xs.filter((x) => x!.c > 0).length, priced: xs.length };
  }).sort((a, b) => (b.cw ?? b.avg ?? -99) - (a.cw ?? a.avg ?? -99));
  const maxAbs = Math.max(0.5, ...sectorStats.map((x) => Math.abs(x.cw ?? x.avg ?? 0)));
  const inState = (r: CoRow) => !!stSel && stateOf(r[4]) === stSel;

  // world: one bubble per country (where its listed companies are headquartered)
  const wRows = wd?.rows ?? [];
  const byCountry = useMemo(() => {
    const m = new Map<string, { name: string; n: number; lat: number; lon: number }>();
    for (const r of wRows) {
      const k = r[3] || 'Unknown country';
      const v = m.get(k) ?? { name: k, n: 0, lat: 0, lon: 0 };
      v.n++; v.lat += r[4]; v.lon += r[5]; m.set(k, v);
    }
    return [...m.values()].map((v) => ({ ...v, lat: v.lat / v.n, lon: v.lon / v.n })).sort((a, b) => b.n - a.n);
  }, [wRows]);
  const wql = wq.trim().toLowerCase();
  const wList = worldAll ? wRows.filter((r) => (!ctySel || (r[3] || 'Unknown country') === ctySel) && (!wql || r[0].toLowerCase().includes(wql) || r[1].toLowerCase() === wql || r[6].toLowerCase() === wql)).slice(0, 120) : [];
  const wPoints = useMemo(() => (worldAll ? wRows.map((r) => { const p = PROJ.world([r[5], r[4]]); return p ? { r, x: p[0], y: p[1] } : null; }).filter((x): x is { r: WRow; x: number; y: number } => !!x) : []), [worldAll, wRows]);

  const coRow = (c: CoRow, chg?: number) => (
    <li key={c[0]}><button className="link" onClick={() => setOpen(c[0])}><b>{c[0]}</b> {c[1]}</button>{chg != null && <span className={`num ${chg >= 0 ? 'up' : 'down'}`}>{pct(chg)}</span>}</li>
  );

  return (
    <div className="overlay" role="dialog" aria-label="Company headquarters map">
      <div className="overlay-in wm">
        <div className="phead">
          <div className="phead-title">Where the big companies are <span className="tag">{worldAll ? wRows.length.toLocaleString() : COMPANIES.length}</span></div>
          <div className="phead-ctl">
            {extra}
            {!worldAll && <Seg value={mapMode} onChange={(v) => { setMapMode(v); setStSel(null); }} options={[{ id: 'dots', label: 'Companies' }, { id: 'states', label: 'States' }]} />}
            {!worldAll && mapMode === 'dots' && <Seg value={dotColor} onChange={setDotColor} options={[{ id: 'move', label: 'Today' }, { id: 'sector', label: 'Sector' }]} />}
            {!worldAll && mapMode === 'states' && <Seg value={colorBy} onChange={setColorBy} options={[{ id: 'avg', label: 'Avg move' }, { id: 'cap', label: 'Cap-weighted' }]} />}
            {!worldAll && snap.data && <Fresh kind="delayed" at={snap.data.asOf} src={snap.data.source} />}
            <Seg value={view} onChange={(v) => { setView(v); setCtySel(null); }} options={[{ id: 'us', label: 'US' }, { id: 'world', label: `World (+${foreign} abroad)` }]} />
            {view === 'world' && <button className={`chip sm ${everyone ? 'on' : ''}`} onClick={() => { setEveryone(!everyone); setCtySel(null); }} aria-pressed={everyone} title="Every publicly listed company with a known headquarters, worldwide (Wikidata, community-edited)">Every listed company</button>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className={`cm-body ${panel ? '' : 'panel-off'}`}>
          <svg viewBox={`0 0 ${W} ${H}`} className="wm-svg cm-svg" preserveAspectRatio="xMidYMid meet" onMouseLeave={() => setHov(null)}>
            {view === 'world' && <path d={path({ type: 'Sphere' }) ?? ''} className="wm-sphere" />}
            <path d={grat} className="wm-grat" />
            {land.map((d, i) => <path key={i} d={d} className="wm-land" />)}
            {worldAll && wPoints.map(({ r, x, y }, i) => <circle key={i} cx={x} cy={y} r={ctySel && (r[3] || 'Unknown country') === ctySel ? 2.4 : 1.3} className={`wco-dot ${ctySel && (r[3] || 'Unknown country') !== ctySel ? 'dim' : ''}`}><title>{`${r[0]} · ${r[1]} (${r[2]})\n${r[3]}`}</title></circle>)}
            {worldAll && byCountry.slice(0, 40).map((c) => { const p = PROJ.world([c.lon, c.lat]); if (!p) return null; const rad = 6 + Math.sqrt(c.n) * 0.75; return (
              <g key={c.name} className={`cty-bub ${ctySel === c.name ? 'on' : ''}`} onClick={() => { setCtySel(ctySel === c.name ? null : c.name); setPanel(true); }}>
                <circle cx={p[0]} cy={p[1]} r={rad} /><text x={p[0]} y={p[1] + 3.5} textAnchor="middle" fontSize={Math.min(11, rad * 0.55)}>{c.n}</text><title>{`${c.name}: ${c.n} listed companies`}</title>
              </g>
            ); })}
            {!worldAll && mapMode === 'states' && [...states].sort((a, b) => b.n - a.n).map((s) => {
              const rad = 15 + Math.sqrt(s.n) * 2.3;
              return (
                <g key={s.state} className={`st-bub ${stSel === s.state ? 'on' : ''}`} onClick={() => { setStSel(s.state); setPanel(true); }}>
                  <circle cx={s.x} cy={s.y} r={rad} fill={moveColor(s.val, 2)} />
                  <text x={s.x} y={s.y - 1} textAnchor="middle" className="st-t" fontSize={Math.min(13, rad * 0.5)}>{s.val == null ? s.ab : pct(s.val, Math.abs(s.val) >= 10 ? 0 : rad < 19 ? 1 : 2)}</text>
                  <text x={s.x} y={s.y + 10} textAnchor="middle" className="st-t2">{s.n}</text>
                  <title>{`${s.state}: ${s.n} companies · ${s.val == null ? 'no quotes yet' : pct(s.val)}`}</title>
                </g>
              );
            })}
            {!worldAll && mapMode === 'dots' && dots.map(({ r, x, y }) => {
              const sq = snapMap[r[0]];
              const big = moveMode ? capR(sq?.mc) : 2.6;
              const rad = match(r) ? Math.max(6, big) : hov?.[0] === r[0] ? big + 2 : big;
              const dim = (ql && !match(r)) || (stSel && !inState(r));
              return (
                <circle key={r[0]} cx={x} cy={y} r={rad} className={`co-dot ${moveMode ? 'mv' : `sec-${secIdx(r[2])}`} ${match(r) ? 'hit' : ''} ${dim ? 'dim' : ''}`} style={moveMode ? { fill: moveColor(sq?.c, 3) } : undefined}
                  onMouseEnter={() => setHov(r)} onClick={() => setOpen(r[0])}>
                  <title>{`${r[0]} · ${r[1]}${sq ? ` · ${pct(sq.c)}` : ''}\n${r[3]}\n${r[4]}`}</title>
                </circle>
              );
            })}
          </svg>
          {moveMode && !worldAll && mapMode === 'dots' && <div className="cm-legend small"><span>Color: today's move</span><i style={{ background: moveColor(-3) }} />−3%<i style={{ background: moveColor(0) }} />0<i style={{ background: moveColor(3) }} />+3% · size: market cap</div>}
          {!panel && <button className="btn cm-open" onClick={() => setPanel(true)}>Panel ‹</button>}
          {panel && (
            <aside className="cm-panel">
              <div className="cm-ph">
                {worldAll ? <b>{ctySel ?? 'Every listed company'}</b> : mapMode === 'states' ? <b>Stocks by state</b> : <Seg value={tab} onChange={setTab} options={[{ id: 'movers', label: 'Movers' }, { id: 'sectors', label: 'Sectors' }, { id: 'states', label: 'States' }, { id: 'find', label: 'Find' }]} />}
                <button className="hw-btn" onClick={() => setPanel(false)} title="Fold the panel away" aria-label="Hide panel">›</button>
              </div>
              <div className="cm-pb">
                {!worldAll && mapMode === 'dots' && hov && tab !== 'find' && (
                  <div className="cm-hov">
                    <button className="link" onClick={() => setOpen(hov[0])}><b>{hov[0]}</b> {hov[1]}</button>
                    <span className="small muted">{hov[4]}{snapMap[hov[0]] ? ' · ' : ''}{snapMap[hov[0]] && <b className={snapMap[hov[0]].c >= 0 ? 'up' : 'down'}>{pct(snapMap[hov[0]].c)}</b>}{snapMap[hov[0]]?.mc ? ` · $${(snapMap[hov[0]].mc! / 1e9).toFixed(0)}B` : ''}</span>
                  </div>
                )}
                {worldAll && (
                  <>
                    {wErr && <p className="small down">Couldn't load the world list: {wErr}</p>}
                    {!wd && !wErr && <p className="small muted">Loading about 9,000 companies…</p>}
                    {wd && <>
                      <input className="lib-q" value={wq} onChange={(e) => setWq(e.target.value)} placeholder="Find a company or ticker worldwide…" aria-label="Find a company worldwide" />
                      {!ctySel && <><h4>Countries</h4><div className="wm-chips">{byCountry.slice(0, 30).map((c) => <button key={c.name} className="chip sm" onClick={() => setCtySel(c.name)}>{c.name} <span className="muted">{c.n}</span></button>)}</div></>}
                      {ctySel && <button className="chip sm on" onClick={() => setCtySel(null)}>{ctySel} ×</button>}
                      {(ctySel || wql) && <ul className="st-list">{wList.map((r, i) => (
                        <li key={`${r[1]}:${i}`}>
                          <span><b>{r[1]}</b> {r[0]} <span className="small muted">{r[2]}</span></span>
                          <span className="cm-acts">
                            {r[6] && SYM_OK.test(r[6]) && <button className="link" onClick={() => onChart(r[6])}>Chart</button>}
                            {r[6] && <a href={`https://finance.yahoo.com/quote/${encodeURIComponent(r[6])}`} target="_blank" rel="noreferrer noopener">Quote</a>}
                          </span>
                        </li>
                      ))}</ul>}
                      <p className="note">{wd.source}. Pulled {wd.asOf}. Some companies are missing or out of date, and sectors aren't included. Quotes open on Yahoo Finance (unofficial, delayed).</p>
                    </>}
                  </>
                )}
                {!worldAll && mapMode === 'states' && (
                  <>
                    {!live && <p className="small muted"><Fresh kind="demo" /> Live quotes only.</p>}
                    {snap.error && !snap.data && <p className="small down">{snap.error}</p>}
                    {stRow ? (
                      <>
                        <p className="small"><b>{stRow.state}</b> · {stRow.n} companies · avg <b className={(stRow.avg ?? 0) >= 0 ? 'up' : 'down'}>{pct(stRow.avg)}</b>{stRow.capWtd != null && <> · cap-weighted <b className={stRow.capWtd >= 0 ? 'up' : 'down'}>{pct(stRow.capWtd)}</b></>}</p>
                        <ul className="st-list">{stCos.map(({ c, q }) => coRow(c, q?.c))}</ul>
                      </>
                    ) : <p className="small muted">Each bubble is a state: size = how many S&P 500 / Nasdaq-100 companies are headquartered there, color = their move today. Click one to list its companies.</p>}
                  </>
                )}
                {!worldAll && mapMode === 'dots' && tab === 'movers' && (
                  !hasSnap ? <p className="small muted">{live ? 'Loading today’s moves…' : 'Live quotes only.'}</p> : <>
                    <h4>Up the most</h4><ul className="st-list">{gainers.map(({ c, s }) => coRow(c, s!.c))}</ul>
                    <h4>Down the most</h4><ul className="st-list">{losers.map(({ c, s }) => coRow(c, s!.c))}</ul>
                    <p className="note">Among the {priced.length} companies on the map{secOn.length ? ' in the sectors you picked' : ''}. {snap.data?.source}.</p>
                  </>
                )}
                {!worldAll && mapMode === 'dots' && tab === 'sectors' && (
                  <>
                    <div className="cm-secs">{sectorStats.map((x) => { const v = x.cw ?? x.avg; return (
                      <button key={x.s} className={`cm-sec ${secOn.includes(x.s) ? 'on' : ''}`} onClick={() => toggleSec(x.s)} title={`${x.s}: ${x.n} companies${x.priced ? `, ${x.up} of ${x.priced} up today` : ''}. Click to show only this sector (click more to add).`}>
                        <span className="cm-sec-n"><i className={`sec-sw sec-${secIdx(x.s)}`} />{x.s}</span>
                        <span className="cm-sec-bar"><i style={{ width: `${v == null ? 0 : (Math.abs(v) / maxAbs) * 100}%`, background: v == null ? 'var(--line-2)' : v >= 0 ? 'var(--up)' : 'var(--down)' }} /></span>
                        <span className={`num small ${(v ?? 0) >= 0 ? 'up' : 'down'}`}>{v == null ? x.n : pct(v)}</span>
                      </button>
                    ); })}</div>
                    {secOn.length > 0 && <button className="chip sm" onClick={() => setSecOn([])}>Show all sectors</button>}
                    <p className="note">Bars: cap-weighted move today (bigger companies count more). Click sectors to filter the map.</p>
                  </>
                )}
                {!worldAll && mapMode === 'dots' && tab === 'states' && (
                  <>
                    {stSel ? (
                      <>
                        <button className="chip sm on" onClick={() => setStSel(null)}>{stSel} ×</button>
                        <ul className="st-list">{COMPANIES.filter((c) => stateOf(c[4]) === stSel && rows.includes(c)).map((c) => ({ c, q: snapMap[c[0]] })).sort((a, b) => (b.q?.c ?? -1e9) - (a.q?.c ?? -1e9)).map(({ c, q }) => coRow(c, q?.c))}</ul>
                      </>
                    ) : (
                      <ul className="st-list">{stateAgg(snapMap).map((s) => (
                        <li key={s.state}><button className="link" onClick={() => setStSel(s.state)}><b>{s.state}</b> <span className="muted">{s.n}</span></button>{s.capWtd != null || s.avg != null ? <span className={`num ${(s.capWtd ?? s.avg ?? 0) >= 0 ? 'up' : 'down'}`}>{pct(s.capWtd ?? s.avg)}</span> : null}</li>
                      ))}</ul>
                    )}
                    <p className="note">Click a state to light up its companies on the map. Move is cap-weighted.</p>
                  </>
                )}
                {!worldAll && mapMode === 'dots' && tab === 'find' && (
                  <>
                    <input className="lib-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a company or ticker…" aria-label="Find a company" />
                    {hits.length > 0 && <ul className="co-hits">{hits.map((r) => <li key={r[0]}><button className="link" onClick={() => setOpen(r[0])}><b>{r[0]}</b> {r[1]}</button> <span className="small muted">{r[4]}</span></li>)}</ul>}
                    {hov ? (
                      <>
                        <h4>{hov[0]} · {hov[1]}</h4>
                        <p className="small">{hov[3]} ({hov[2]})<br /><span className="muted">{hov[4]}</span>{snapMap[hov[0]] && <><br /><b className={snapMap[hov[0]].c >= 0 ? 'up' : 'down'}>{pct(snapMap[hov[0]].c)}</b> today{snapMap[hov[0]].mc ? ` · $${(snapMap[hov[0]].mc! / 1e9).toFixed(0)}B market cap` : ''}</>}</p>
                        <div className="tinfo-btns"><button className="btn primary" onClick={() => setOpen(hov[0])}>Supply chain</button><button className="btn" onClick={() => onChart(hov[0])}>Chart</button></div>
                        {cityMates.length > 1 && <><h4>Also in {hov[4].split(',')[0]} ({cityMates.length})</h4><div className="wm-chips">{cityMates.filter((c) => c[0] !== hov[0]).slice(0, 40).map((c) => <button key={c[0]} className="sym-chip" title={c[1]} onClick={() => setOpen(c[0])}>{c[0]}</button>)}</div></>}
                      </>
                    ) : <p className="small muted">Hover a dot to see the company; click it for what it sells, who supplies it and who buys from it.</p>}
                    <p className="note">Headquarters from the S&P 500 constituent list plus Nasdaq-100 members outside it; city coordinates from a US cities database. A headquarters isn’t where things are made.</p>
                  </>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>
      {open && (
        <div className="overlay co-modal" role="dialog" aria-label={`${open} supply chain`} onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
          <div className="co-modal-in">
            <button className="icon-btn co-modal-x" onClick={() => setOpen(null)} aria-label="Close">×</button>
            <CompanyPage sym={open} mode={mode} onOpen={setOpen} onChart={onChart} onPatterns={onChart} />
          </div>
        </div>
      )}
    </div>
  );
}
