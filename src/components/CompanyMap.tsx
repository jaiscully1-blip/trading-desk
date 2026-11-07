// Where the S&P 500 (+ Nasdaq-100 extras) are headquartered. Click a company for its supply chain (company page in a panel).
import { useMemo, useState, type ReactNode } from 'react';
import { geoMercator, geoNaturalEarth1, geoPath, geoGraticule10, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import { COMPANIES, type CoRow } from '../../shared/data/companies';
import type { DataMode } from '../data/live';
import { usePersisted } from '../lib/store';
import { Seg } from './common';
import CompanyPage from './CompanyPage';

const W = 960, H = 540;
const topo = world as unknown as Topology<{ countries: GeometryCollection }>;
const countries = feature(topo, topo.objects.countries);
const PROJ: Record<'us' | 'world', GeoProjection> = {
  us: geoMercator().fitExtent([[10, 10], [W - 10, H - 10]], { type: 'MultiPoint', coordinates: [[-125, 24.5], [-66.5, 49.5]] }),
  world: geoNaturalEarth1().fitSize([W, H], { type: 'Sphere' }),
};
const SECTORS = [...new Set(COMPANIES.map((c) => c[2]))].sort();
const secIdx = (s: string) => SECTORS.indexOf(s);

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

export default function CompanyMap({ mode, extra, onClose, onChart }: { mode: DataMode; extra?: ReactNode; onClose: () => void; onChart: (s: string) => void }) {
  const [view, setView] = usePersisted<'us' | 'world'>('coMapView', 'us');
  const [secOn, setSecOn] = usePersisted<string[]>('coMapSectors', []);
  const [q, setQ] = useState('');
  const [hov, setHov] = useState<CoRow | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const proj = PROJ[view];
  const path = useMemo(() => geoPath(proj), [proj]);
  const land = useMemo(() => countries.features.map((f) => path(f) ?? ''), [path]);
  const grat = useMemo(() => path(geoGraticule10()) ?? '', [path]);
  const rows = useMemo(() => COMPANIES.filter((c) => !secOn.length || secOn.includes(c[2])), [secOn]);
  const dots = useMemo(() => placed(proj, rows), [proj, rows]);
  const ql = q.trim().toLowerCase();
  const match = (r: CoRow) => !!ql && (r[0].toLowerCase() === ql || r[1].toLowerCase().includes(ql));
  const hits = ql ? rows.filter(match).slice(0, 8) : [];
  const cityMates = hov ? COMPANIES.filter((c) => c[4] === hov[4]) : [];
  const toggleSec = (s: string) => setSecOn((xs) => (xs.includes(s) ? xs.filter((x) => x !== s) : [...xs, s]));
  const foreign = COMPANIES.filter((c) => c[6] < -130 || c[6] > -60 || c[5] < 18).length;

  return (
    <div className="overlay" role="dialog" aria-label="Company headquarters map">
      <div className="overlay-in wm">
        <div className="phead">
          <div className="phead-title">Where the big companies are <span className="tag">{COMPANIES.length}</span></div>
          <div className="phead-ctl">
            {extra}
            <Seg value={view} onChange={setView} options={[{ id: 'us', label: 'US' }, { id: 'world', label: `World (+${foreign} abroad)` }]} />
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="wm-body">
          <svg viewBox={`0 0 ${W} ${H}`} className="wm-svg" onMouseLeave={() => setHov(null)}>
            {view === 'world' && <path d={path({ type: 'Sphere' }) ?? ''} className="wm-sphere" />}
            <path d={grat} className="wm-grat" />
            {land.map((d, i) => <path key={i} d={d} className="wm-land" />)}
            {dots.map(({ r, x, y }) => (
              <circle key={r[0]} cx={x} cy={y} r={match(r) ? 6 : hov?.[0] === r[0] ? 5 : 2.6} className={`co-dot sec-${secIdx(r[2])} ${match(r) ? 'hit' : ''} ${ql && !match(r) ? 'dim' : ''}`}
                onMouseEnter={() => setHov(r)} onClick={() => setOpen(r[0])}>
                <title>{`${r[0]} · ${r[1]}\n${r[3]}\n${r[4]}`}</title>
              </circle>
            ))}
          </svg>
          <aside className="wm-side">
            <input className="lib-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a company or ticker…" aria-label="Find a company" />
            {hits.length > 0 && <ul className="co-hits">{hits.map((r) => <li key={r[0]}><button className="link" onClick={() => setOpen(r[0])}><b>{r[0]}</b> {r[1]}</button> <span className="small muted">{r[4]}</span></li>)}</ul>}
            <h4>Sectors</h4>
            <div className="co-secs">{SECTORS.map((s) => (
              <button key={s} className={`chip sm co-sec ${secOn.includes(s) ? 'on' : ''}`} onClick={() => toggleSec(s)}><i className={`sec-sw sec-${secIdx(s)}`} />{s} <span className="muted">{COMPANIES.filter((c) => c[2] === s).length}</span></button>
            ))}{secOn.length > 0 && <button className="chip sm" onClick={() => setSecOn([])}>all</button>}</div>
            {hov ? (
              <>
                <h4>{hov[0]} · {hov[1]}</h4>
                <p className="small">{hov[3]} ({hov[2]})<br /><span className="muted">{hov[4]}</span></p>
                <div className="tinfo-btns"><button className="btn primary" onClick={() => setOpen(hov[0])}>Supply chain</button><button className="btn" onClick={() => onChart(hov[0])}>Chart</button></div>
                {cityMates.length > 1 && <><h4>Also in {hov[4].split(',')[0]} ({cityMates.length})</h4><div className="wm-chips">{cityMates.filter((c) => c[0] !== hov[0]).slice(0, 40).map((c) => <button key={c[0]} className="sym-chip" title={c[1]} onClick={() => setOpen(c[0])}>{c[0]}</button>)}</div></>}
              </>
            ) : <p className="small muted">Hover a dot to see the company; click it for what it sells, who supplies it and who buys from it. Dots in the same city fan out in a small spiral.</p>}
            <p className="note">Headquarters from the S&P 500 constituent list (github.com/datasets/s-and-p-500-companies) plus Nasdaq-100 members outside the S&P 500; city coordinates from a US cities database. A headquarters isn’t where things are made: factories and suppliers are on the company page.</p>
          </aside>
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
