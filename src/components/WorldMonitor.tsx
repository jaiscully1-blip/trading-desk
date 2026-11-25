// World Monitor: one place for free agency feeds (USGS, NOAA, NIFC, GDACS, Red Cross, WHO, CDC, ECDC, FDA, CPSC,
// Federal Register, SEC, Fed, State Dept, CISA, FAA, UN), the US drought / weather / FEMA map, a world map of events,
// and a searchable directory of 1,600+ US federal, state, UN and intergovernmental agencies. Real data only.
import { useEffect, useMemo, useState } from 'react';
import { paceMs } from '../lib/pace';
import { geoCentroid, geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import type { DataMode } from '../data/live';
import { BLOCKED, CAT_LABEL, FEEDS, type Cat, type WEvent } from '../../shared/wmon';
import { load, save, usePersisted } from '../lib/store';
import { Fresh, PageTabs, Q } from './common';
import CommodityMap from './CommodityMap';
import { Weather } from './RealEconPage';
import type { ReactNode } from 'react';

type Tab = 'feed' | 'us' | 'world' | 'dir';
interface Data { events: WEvent[]; status: Record<string, { ok: boolean; n: number; err?: string }>; asOf: number; source: string }
interface Agency { name: string; url: string; group: string; desc?: string }
const CATS = Object.keys(CAT_LABEL) as Cat[];
const ICON: Record<Cat, string> = { quake: '🌐', tsunami: '🌊', volcano: '🌋', storm: '🌀', fire: '🔥', disaster: '🆘', health: '🦠', recall: '⚠️', policy: '🏛️', travel: '✈️', space: '☀️', cyber: '🛡️', aviation: '🛫', world: '🇺🇳' };
const feedOf = (id: string) => FEEDS.find((f) => f.id === id);
const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60_000); return m < 60 ? `${Math.max(1, m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };

const W = 960, H = 500;
const topo = world as unknown as Topology<{ countries: GeometryCollection }>;
const countries = feature(topo, topo.objects.countries) as unknown as { features: { properties: { name: string }; geometry: any }[] };
const proj = geoNaturalEarth1().fitSize([W, H], { type: 'Sphere' });
const path = geoPath(proj);
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
const ALIAS: Record<string, string> = { usa: 'unitedstatesofamerica', unitedstates: 'unitedstatesofamerica', democraticrepublicofthecongo: 'demrepcongo', drc: 'demrepcongo', centralafricanrepublic: 'centralafricanrep', southsudan: 'ssudan', bosniaandherzegovina: 'bosniaandherz', dominicanrepublic: 'dominicanrep', czechia: 'czechia', czechrepublic: 'czechia', turkiye: 'turkey', myanmarburma: 'myanmar', cotedivoire: 'cotedivoire', ivorycoast: 'cotedivoire', laos: 'laos', syrianarabrepublic: 'syria', russianfederation: 'russia', iranislamicrepublicof: 'iran', unitedkingdom: 'unitedkingdom', vietnam: 'vietnam' };
const CENTROID = new Map(countries.features.map((f) => [norm(f.properties.name), geoCentroid(f as any) as [number, number]]));
function where(e: WEvent): [number, number] | null {
  if (e.lat != null && e.lon != null) return [e.lon, e.lat];
  if (!e.country) return null;
  const k = norm(e.country.split(/[,(]/)[0]);
  return CENTROID.get(ALIAS[k] ?? k) ?? null;
}

function useWmon(on: boolean) {
  const [d, setD] = useState<Data | null>(null), [err, setErr] = useState('');
  useEffect(() => {
    if (!on) return;
    let stop = false;
    const go = () => fetch('/api/research?fn=wmon').then((r) => r.json()).then((j) => { if (!stop) { if (j.error) setErr(j.error); else { setD(j); setErr(''); } } }).catch((e) => !stop && setErr(String(e)));
    go(); const id = setInterval(go, paceMs(5 * 60_000));
    return () => { stop = true; clearInterval(id); };
  }, [on]);
  return { d, err };
}

function Row({ e, isNew }: { e: WEvent; isNew: boolean }) {
  const f = feedOf(e.feed);
  return (
    <li className={`wmn-row sev${e.sev}`}>
      <span className="wmn-ic" aria-hidden="true">{ICON[e.cat]}</span>
      <div className="wmn-main">
        <a href={e.url ?? f?.home} target="_blank" rel="noreferrer">{e.title}</a>
        <span className="small muted">{f?.agency ?? e.feed}{e.country ? ` · ${e.country}` : ''}{e.detail ? ` · ${e.detail.slice(0, 140)}` : ''}</span>
      </div>
      <span className="small muted wmn-t">{isNew && <i className="wmn-new" title="New since your last visit">●</i>}{ago(e.t)}</span>
    </li>
  );
}

function WorldMap({ events, seen }: { events: WEvent[]; seen: number }) {
  const [pick, setPick] = useState<WEvent | null>(null);
  const pts = useMemo(() => events.map((e) => { const w = where(e); const p = w ? proj(w) : null; return p ? { e, x: p[0], y: p[1] } : null; }).filter(Boolean) as { e: WEvent; x: number; y: number }[], [events]);
  return (
    <section className="panel">
      <div className="gx-h"><Q k="delayed" src="each agency's own feed (see the event)" /><b>World map</b><span className="small muted">{pts.length} of {events.length} events placed · size = severity · click a dot · events without a place stay in the feed</span></div>
      <div className="wmn-mapwrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="wmn-map" role="img" aria-label="World map of events">
          <path d={path({ type: 'Sphere' }) ?? ''} className="wmn-sphere" />
          {countries.features.map((f, i) => <path key={i} d={path(f as any) ?? ''} className="wmn-land" />)}
          {pts.sort((a, b) => a.e.sev - b.e.sev).map(({ e, x, y }) => <circle key={e.id} cx={x} cy={y} r={2.5 + e.sev * 2} className={`wmn-dot c-${e.cat} ${pick?.id === e.id ? 'on' : ''} ${e.t > seen && seen ? 'new' : ''}`} onClick={() => setPick(e)}><title>{e.title}</title></circle>)}
        </svg>
      </div>
      {pick && <ul className="wmn-list wmn-pick"><Row e={pick} isNew={false} /></ul>}
    </section>
  );
}

function Directory() {
  const [all, setAll] = useState<Agency[] | null>(null);
  const [q, setQ] = useState(''), [group, setGroup] = usePersisted<string>('wmDirGroup', 'all'), [n, setN] = useState(150);
  useEffect(() => { fetch('/data/agencies.json').then((r) => r.json()).then(setAll).catch(() => setAll([])); }, []);
  const groups = useMemo(() => ['all', ...new Set((all ?? []).map((a) => a.group))], [all]);
  const list = useMemo(() => { const k = q.trim().toLowerCase(); return (all ?? []).filter((a) => (group === 'all' || a.group === group) && (!k || a.name.toLowerCase().includes(k) || a.desc?.toLowerCase().includes(k))); }, [all, q, group]);
  return (
    <section className="panel">
      <div className="gx-h"><Q k="eod" src="USA.gov agency index, Wikipedia lists of US federal agencies and intergovernmental organizations, UN specialized agencies (saved 2026-11-24)" /><b>Agency directory</b><span className="small muted">{all ? `${list.length.toLocaleString('en-US')} of ${all.length.toLocaleString('en-US')}` : 'loading…'} · 📡 = its feed is on the Feed tab</span></div>
      <div className="wmn-dirbar">
        <input value={q} onChange={(e) => { setQ(e.target.value); setN(150); }} placeholder="Search agencies (e.g. energy, FEMA, food, trade)" aria-label="Search agencies" />
        <div className="wmn-chips">{groups.map((g) => <button key={g} className={`chip sm ${group === g ? 'on' : ''}`} onClick={() => { setGroup(g); setN(150); }} aria-pressed={group === g}>{g === 'all' ? 'All' : g}</button>)}</div>
      </div>
      <ul className="wmn-dir">
        {list.slice(0, n).map((a) => { const fs = FEEDS.filter((f) => f.match.test(a.name)); return (
          <li key={a.name + a.url}><a href={a.url} target="_blank" rel="noreferrer">{a.name}</a> <span className="small muted">{a.group}</span>{fs.length > 0 && <span className="wmn-feedtag" title={fs.map((f) => f.label).join(', ')}>📡 {fs.map((f) => f.label).join(' · ')}</span>}{a.desc && <p className="small muted">{a.desc}</p>}</li>
        ); })}
      </ul>
      {list.length > n && <button className="btn wmn-more" onClick={() => setN(n + 300)}>Show more ({list.length - n} left)</button>}
      <p className="note small gx-pad">Most agencies publish websites, not data feeds. The ones with a free, no-key feed are on the Feed tab. Can't be added for now: {BLOCKED.join('; ')}.</p>
    </section>
  );
}

export default function WorldMonitor({ mode, onChart, onWatch, newsMap, startTab }: { mode: DataMode; onChart: (s: string) => void; onWatch: (s: string) => void; newsMap?: (close: () => void) => ReactNode; startTab?: Tab }) {
  const [tab, setTab] = usePersisted<Tab>('wmTab', 'feed');
  const [mapKind, setMapKind] = usePersisted<'news' | 'agency'>('wmMapKind', 'news');
  useEffect(() => { if (startTab) setTab(startTab); }, [startTab]); // eslint-disable-line react-hooks/exhaustive-deps
  const [cats, setCats] = usePersisted<Cat[]>('wmCats', []);
  const [minSev, setMinSev] = usePersisted<number>('wmSev', 1);
  const live = mode.kind === 'live';
  const { d, err } = useWmon(live && (tab === 'feed' || (tab === 'world' && mapKind === 'agency')));
  const [seen] = useState(() => { const s = load<number>('wmSeen', 0); save('wmSeen', Date.now()); return s; });
  const shown = useMemo(() => (d?.events ?? []).filter((e) => e.sev >= minSev && (!cats.length || cats.includes(e.cat))), [d, cats, minSev]);
  const counts = useMemo(() => { const c: Partial<Record<Cat, number>> = {}; for (const e of d?.events ?? []) if (e.sev >= minSev) c[e.cat] = (c[e.cat] ?? 0) + 1; return c; }, [d, minSev]);
  const bad = Object.entries(d?.status ?? {}).filter(([, s]) => !s.ok);
  const severe = (d?.events ?? []).filter((e) => e.sev === 3);
  const toggle = (c: Cat) => setCats(cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c]);
  return (
    <div className="page wmn">
      <section className="panel">
        <div className="phead">
          <div className="phead-title">World Monitor</div>
          <div className="phead-ctl">
            <PageTabs<Tab> label="View" value={tab} onChange={setTab} options={[{ id: 'feed', label: 'Feed' }, { id: 'us', label: 'US map' }, { id: 'world', label: 'World map' }, { id: 'dir', label: 'Directory' }]} />
            {d && <Fresh kind="delayed" at={d.asOf} src={d.source} />}
          </div>
        </div>
        {!live && tab !== 'dir' && <p className="small muted gx-pad">World Monitor only shows real agency data, so it needs live mode. The Directory tab works anywhere.</p>}
        {live && (tab === 'feed' || (tab === 'world' && mapKind === 'agency')) && <>
          {err && !d && <p className="small down gx-pad">Could not load the feeds: {err}</p>}
          {!d && !err && <p className="small muted gx-pad">Loading {FEEDS.length} agency feeds…</p>}
          {d && <p className="small gx-pad">{severe.length ? <><b className="down">Severe now:</b> {severe.slice(0, 4).map((e) => e.title).join(' · ')}</> : <>No severe events in the feeds right now.</>} <span className="muted">· {FEEDS.length - bad.length}/{FEEDS.length} feeds loaded{bad.length ? ` (not loaded: ${bad.map(([k, s]) => `${feedOf(k)?.agency ?? k}: ${s.err}`).join('; ')})` : ''}</span></p>}
          <div className="wmn-chips gx-pad">
            <button className={`chip sm ${!cats.length ? 'on' : ''}`} onClick={() => setCats([])}>All</button>
            {CATS.map((c) => <button key={c} className={`chip sm ${cats.includes(c) ? 'on' : ''}`} onClick={() => toggle(c)} aria-pressed={cats.includes(c)}>{ICON[c]} {CAT_LABEL[c]}{counts[c] ? ` ${counts[c]}` : ''}</button>)}
            <span className="wmn-sev"><button className={`chip sm ${minSev === 1 ? 'on' : ''}`} onClick={() => setMinSev(1)}>Everything</button><button className={`chip sm ${minSev === 2 ? 'on' : ''}`} onClick={() => setMinSev(2)}>Notable+</button><button className={`chip sm ${minSev === 3 ? 'on' : ''}`} onClick={() => setMinSev(3)}>Severe only</button></span>
          </div>
        </>}
      </section>
      {live && tab === 'feed' && d && (
        <section className="panel">
          <div className="gx-h"><Q k="delayed" src="each agency's own feed (see the event)" /><b>{shown.length} events</b><span className="small muted">newest first · ● = new since your last visit · red edge = severe · links open the agency's page</span></div>
          <ul className="wmn-list">{shown.slice(0, 250).map((e) => <Row key={e.id} e={e} isNew={!!seen && e.t > seen} />)}</ul>
          <p className="note small gx-pad">Each item comes straight from the agency named under it. Severity is the desk's own rough grading (for example M6+ quakes, orange/red GDACS alerts, Level 4 travel advisories). Not investment advice.</p>
        </section>
      )}
      {tab === 'world' && <div className="wmn-kind"><button className={`chip sm ${mapKind === 'news' ? 'on' : ''}`} onClick={() => setMapKind('news')}>News, conflicts, shipping</button><button className={`chip sm ${mapKind === 'agency' ? 'on' : ''}`} onClick={() => setMapKind('agency')}>Agency events</button></div>}
      {tab === 'world' && mapKind === 'news' && newsMap && <div className="wmn-newsmap">{newsMap(() => setTab('feed'))}</div>}
      {live && tab === 'world' && mapKind === 'agency' && d && <WorldMap events={shown} seen={seen} />}
      {tab === 'us' && <CommodityMap mode={mode} onChart={onChart} onWatch={onWatch} />}
      {tab === 'us' && live && <div className="ad-grid wmn-wx"><Weather live={live} /></div>}
      {tab === 'dir' && <Directory />}
    </div>
  );
}
