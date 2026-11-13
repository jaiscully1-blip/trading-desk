// Real Economy: what's moving in the physical economy. Air traffic (airlines and airports, live and daily history), a
// corporate-jet tracker (your list of tail codes; checks which public company's HQ city a jet is near), rail freight, electricity
// demand by grid region, gasoline nationally and by state, shipping costs, and severe weather with the kinds of stocks it touches.
import { useEffect, useState } from 'react';
import type { DataMode } from '../data/live';
import { usePersisted } from '../lib/store';
import { Fresh } from './common';
import { trend } from '../../shared/altdata';
import { chg } from '../../shared/realecon';

type Pt = { date: string; value: number };
const pc = (v: number | null | undefined, dp = 1) => (v == null || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(dp)}%`);
const tn = (v: number | null | undefined, invert = false) => (v == null ? '' : (invert ? -v : v) >= 0 ? 'up' : 'down');
const uid = () => Math.random().toString(36).slice(2, 9);

function Line({ s, h = 60 }: { s: Pt[]; h?: number }) {
  if (s.length < 2) return <p className="small muted ad-wait">{s.length ? 'One daily reading so far: the line starts tomorrow.' : 'No readings yet.'}</p>;
  const w = 600, lo = Math.min(...s.map((x) => x.value)), hi = Math.max(...s.map((x) => x.value)), span = hi - lo || 1;
  return <svg className="ad-line" style={{ height: h }} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true"><polyline points={s.map((p, i) => `${((i / (s.length - 1)) * w).toFixed(1)},${(4 + (1 - (p.value - lo) / span) * (h - 8)).toFixed(1)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>;
}
function Card({ title, src, at, children }: { title: string; src?: string; at?: number; children: React.ReactNode }) {
  return <section className="ad-card"><header className="ad-h"><h3>{title}</h3>{src && <Fresh kind="delayed" at={at} src={src} />}</header>{children}</section>;
}
const useJson = <T,>(url: string | null) => {
  const [d, setD] = useState<T | null>(null);
  useEffect(() => { if (!url) return; setD(null); fetch(url).then((r) => r.json()).then(setD).catch((e) => setD({ error: String(e) } as T)); }, [url]);
  return d;
};

function Air({ live }: { live: boolean }) {
  const now = useJson<{ airlines: { prefix: string; name: string; sym: string; airborne: number }[]; airports: { code: string; name: string; airborne: number; ground: number }[]; at: number; total: number; source: string; error?: string }>(live ? '/api/research?fn=air' : null);
  const hist = useJson<{ series: Record<string, Pt[]> }>(live ? '/api/research?fn=airhist' : null);
  const [pick, setPick] = useState('DAL');
  const t = (k: string) => trend(hist?.series?.[k] ?? []);
  return (
    <Card title="Air traffic · airlines and airports" src={now?.source} at={now?.at}>
      {!live && <p className="small muted">Live data only.</p>}
      {now?.error && <p className="small down">{now.error}</p>}
      {now && !now.error && (
        <div className="re-two">
          <table className="ad-table"><thead><tr><th>Airline</th><th className="r">In the air now</th><th className="r">30 days</th><th className="r">1 year</th></tr></thead><tbody>
            {now.airlines.map((a) => { const x = t(a.prefix); return <tr key={a.prefix} className={pick === a.prefix ? 'on' : ''} onClick={() => setPick(a.prefix)}><td>{a.name} <span className="small muted">{a.sym}</span></td><td className="r num">{a.airborne}</td><td className={`r num ${tn(x.d30)}`}>{pc(x.d30, 0)}</td><td className={`r num ${tn(x.d365)}`}>{pc(x.d365, 0)}</td></tr>; })}
          </tbody></table>
          <table className="ad-table"><thead><tr><th>Airport</th><th className="r">Aircraft within 40 km</th><th className="r">30 days</th><th className="r">1 year</th></tr></thead><tbody>
            {now.airports.map((a) => { const x = t(a.code); return <tr key={a.code} className={pick === a.code ? 'on' : ''} onClick={() => setPick(a.code)}><td>{a.code} <span className="small muted">{a.name}</span></td><td className="r num">{a.airborne + a.ground}</td><td className={`r num ${tn(x.d30)}`}>{pc(x.d30, 0)}</td><td className={`r num ${tn(x.d365)}`}>{pc(x.d365, 0)}</td></tr>; })}
          </tbody></table>
        </div>
      )}
      {now && !now.error && <><p className="small muted">Daily history for {pick} (one reading each evening):</p><Line s={hist?.series?.[pick] ?? []} /></>}
      <p className="note">Live counts swing with the time of day; the 30-day and 1-year columns compare the same evening reading. Coverage depends on volunteer receivers.</p>
    </Card>
  );
}

interface Jet { id: string; icao: string; label: string }
interface Sighting { icao: string; at: number; near: string | null; ground: boolean }
function Jets({ live }: { live: boolean }) {
  const [list, setList] = usePersisted<Jet[]>('reJets', []);
  const [log, setLog] = usePersisted<Sighting[]>('reJetLog', []);
  const [f, setF] = useState({ icao: '', label: '' });
  const [res, setRes] = useState<{ jets: any[]; source: string; error?: string } | null>(null);
  const check = async () => {
    if (!list.length) return;
    setRes(null);
    const j = await fetch(`/api/research?fn=jets&icao=${list.map((x) => x.icao).join(',')}`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
    setRes(j);
    if (j.jets?.length) setLog((l) => [...j.jets.map((x: any) => ({ icao: x.icao, at: Date.now(), near: x.near ? `${x.near.sym} · ${x.near.city}` : null, ground: x.ground })), ...l].slice(0, 300));
  };
  return (
    <Card title="Corporate jet tracker" src={res?.source}>
      <p className="small muted">Add a jet's ICAO hex code (6 characters). Find it on the <a href="https://registry.faa.gov/aircraftinquiry/Search/NameInquiry" target="_blank" rel="noreferrer noopener">FAA registry</a> by searching the company name (often a holding LLC); the "Mode S code (base 16 / hex)" is the code. A jet parked near another company's HQ city can hint at deal talks. It's a hint, never proof.</p>
      <form className="tl-form" onSubmit={(e) => { e.preventDefault(); const icao = f.icao.trim().toLowerCase(); if (!/^[0-9a-f]{6}$/.test(icao)) return; setList([...list.filter((x) => x.icao !== icao), { id: uid(), icao, label: f.label.trim() || icao }]); setF({ icao: '', label: '' }); }}>
        <input value={f.icao} onChange={(e) => setF({ ...f, icao: e.target.value })} placeholder="ICAO hex, e.g. a1b2c3" aria-label="ICAO hex code" maxLength={6} />
        <input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Whose jet (e.g. ACME Corp CEO)" aria-label="Label" />
        <button className="btn" type="submit">Add</button>
        <button className="btn primary" type="button" disabled={!list.length || !live} onClick={check}>Check where they are</button>
      </form>
      {list.length > 0 && <div className="tl-chips">{list.map((j) => <span key={j.id} className="chip sm">{j.label} <span className="muted">{j.icao}</span><button className="hw-btn" onClick={() => setList(list.filter((x) => x.id !== j.id))} aria-label="Remove">×</button></span>)}</div>}
      {res?.error && <p className="small down">{res.error}</p>}
      {res && !res.error && (res.jets.length ? <ul className="es-news">{res.jets.map((x: any) => <li key={x.icao}><b>{list.find((j) => j.icao === x.icao)?.label ?? x.icao}</b> {x.ground ? 'on the ground' : `flying at ${Math.round((x.alt ?? 0) * 3.28)} ft`}{x.near ? <> near <b>{x.near.sym}</b> HQ ({x.near.city}, {x.near.km} km)</> : ' (not near a tracked HQ)'} · <a href={`https://globe.adsbexchange.com/?icao=${x.icao}`} target="_blank" rel="noreferrer noopener">map</a></li>)}</ul> : <p className="small muted">None of these jets are transmitting right now (parked with transponders off, or hidden by the FAA privacy program).</p>)}
      {log.length > 0 && <><h5>Your sightings log</h5><ul className="es-news">{log.slice(0, 12).map((s, i) => <li key={i}><span className="num small muted">{new Date(s.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span> {list.find((j) => j.icao === s.icao)?.label ?? s.icao}: {s.near ?? 'elsewhere'}{s.ground ? ' (ground)' : ''}</li>)}</ul></>}
    </Card>
  );
}

function Econ({ live }: { live: boolean }) {
  const d = useJson<{ carloads: Pt[]; intermodal: Pt[]; gas: Pt[]; freight: Pt[]; power: { region: string; name: string; s: Pt[] }[] | null; gasStates: { area: string; name: string; s: Pt[] }[] | null; eiaKey: boolean; errors: Record<string, string>; source: string; error?: string }>(live ? '/api/research?fn=econ' : null);
  const row = (label: string, s: Pt[], back1: number, back12: number, fmt: (v: number) => string, invert = false) => {
    const last = s.at(-1);
    return <tr key={label}><td>{label}</td><td className="r num">{last ? fmt(last.value) : '—'}</td><td className="small muted">{last?.date ?? ''}</td><td className={`r num ${tn(chg(s, back1), invert)}`}>{pc(chg(s, back1))}</td><td className={`r num ${tn(chg(s, back12), invert)}`}>{pc(chg(s, back12))}</td><td className="ad-mini"><Line s={s.slice(-60)} h={22} /></td></tr>;
  };
  const avg7 = (s: Pt[], end: number) => { const xs = s.slice(Math.max(0, end - 6), end + 1); return xs.length ? xs.reduce((a, x) => a + x.value, 0) / xs.length : null; };
  return (
    <>
      <Card title="Freight, fuel and shipping" src={d?.source}>
        {!live && <p className="small muted">Live data only.</p>}
        {d && !d.error && (
          <table className="ad-table"><thead><tr><th>Series</th><th className="r">Latest</th><th>As of</th><th className="r">Prior</th><th className="r">Year</th><th>Trend</th></tr></thead><tbody>
            {row('Rail carloads (monthly, BTS)', d.carloads, 1, 12, (v) => `${(v / 1e6).toFixed(2)}M`)}
            {row('Rail intermodal containers (monthly)', d.intermodal, 1, 12, (v) => `${(v / 1e6).toFixed(2)}M`)}
            {row('Gasoline, US regular (weekly)', d.gas, 1, 52, (v) => `$${v.toFixed(3)}`, true)}
            {row('Deep-sea freight prices (PPI, monthly)', d.freight, 1, 12, (v) => v.toFixed(1), true)}
          </tbody></table>
        )}
        <p className="note">Rail data comes out about two months late (BTS). Weekly AAR carloads, the Drewry container index and the Baltic Dry index have no free data feed.</p>
      </Card>
      <Card title="Electricity demand · grid regions" src={d?.eiaKey ? 'EIA hourly grid monitor, daily totals' : undefined}>
        {d && !d.eiaKey && <p className="small muted">Needs a free EIA key: register at <a href="https://www.eia.gov/opendata/register.php" target="_blank" rel="noreferrer noopener">eia.gov/opendata</a> (email only), add <code>EIA_API_KEY</code> in Vercel and redeploy. This also turns on gasoline by state.</p>}
        {d?.errors?.eiaPower && <p className="small down">{d.errors.eiaPower}</p>}
        {d?.power && (
          <table className="ad-table"><thead><tr><th>Region</th><th className="r">Last 7 days avg (MWh/day)</th><th className="r">vs month ago</th><th className="r">vs year ago</th><th>Trend</th></tr></thead><tbody>
            {d.power.map((p) => { const n = p.s.length - 1, a = avg7(p.s, n), m = n >= 30 ? avg7(p.s, n - 30) : null, y = n >= 365 ? avg7(p.s, n - 364) : null;
              return <tr key={p.region}><td>{p.name}</td><td className="r num">{a ? Math.round(a).toLocaleString() : '—'}</td><td className={`r num ${tn(a && m ? a - m : null)}`}>{a && m ? pc((a / m - 1) * 100) : '—'}</td><td className={`r num ${tn(a && y ? a - y : null)}`}>{a && y ? pc((a / y - 1) * 100) : '—'}</td><td className="ad-mini"><Line s={p.s.slice(-120)} h={22} /></td></tr>; })}
          </tbody></table>
        )}
        {d?.power && <p className="note">Year-over-year growth in PJM (Virginia data-center alley) and ERCOT is the AI data-center power story behind utilities like VST, CEG and NRG. Weather moves demand too: compare against the same week last year.</p>}
      </Card>
      {d?.gasStates && (
        <Card title="Gasoline by state" src="EIA weekly retail prices">
          <table className="ad-table"><thead><tr><th>Area</th><th className="r">Regular</th><th className="r">Week</th><th className="r">Year</th><th>Trend</th></tr></thead><tbody>
            {d.gasStates.map((g) => row(g.name, g.s, 1, 52, (v) => `$${v.toFixed(3)}`, true))}
          </tbody></table>
        </Card>
      )}
    </>
  );
}

function Weather({ live }: { live: boolean }) {
  const d = useJson<{ alerts: { event: string; n: number; states: string[]; until: string | null; sectors: string[] }[]; asOf: number; source: string; error?: string }>(live ? '/api/research?fn=wx' : null);
  return (
    <Card title="Weather risk · severe and extreme alerts" src={d?.source} at={d?.asOf}>
      {!live && <p className="small muted">Live data only.</p>}
      {d?.error && <p className="small down">{d.error}</p>}
      {d && !d.error && (!d.alerts.length ? <p className="small muted">No severe or extreme alerts right now.</p> : (
        <table className="ad-table"><thead><tr><th>Alert</th><th className="r">Count</th><th>States</th><th>Can touch</th><th>Until</th></tr></thead><tbody>
          {d.alerts.filter((a) => a.states.length).map((a) => <tr key={a.event}><td>{a.event}</td><td className="r num">{a.n}</td><td className="small">{a.states.join(' ')}</td><td className="small">{a.sectors.join('; ') || <span className="muted">—</span>}</td><td className="small muted">{a.until ? new Date(a.until).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' }) : ''}</td></tr>)}
        </tbody></table>
      ))}
    </Card>
  );
}

export default function RealEconPage({ mode }: { mode: DataMode }) {
  const live = mode.kind === 'live';
  return (
    <div className="page ad">
      <div className="ad-top"><h2>Real Economy</h2><span className="small muted">Planes, jets, trains, power, fuel, freight and weather: what the physical economy is doing. Data to research with, not advice.</span></div>
      <div className="ad-grid">
        <Air live={live} />
        <Weather live={live} />
        <Econ live={live} />
        <Jets live={live} />
      </div>
    </div>
  );
}
