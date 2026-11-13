// Tesla & Lots: registrations by country (Netherlands official register, plus your own log for other countries),
// satellite lot fullness for big lots (Sentinel-2 brightness proxy), and inventory (Tesla blocks automated reads, so a log).
// Every number is shown month over month and year over year. Data, not advice.
import { useEffect, useMemo, useState } from 'react';
import type { DataMode } from '../data/live';
import { usePersisted } from '../lib/store';
import { Fresh, Seg } from './common';
import { DEFAULT_LOTS, changes, quarters, type Lot, type MonthRow } from '../../shared/tesla';

interface RegResp { brands: MonthRow[]; models: MonthRow[]; brandsTracked: string[]; asOf: number; source: string; error?: string }
interface LotResp { months: { month: string; index: number; n: number }[]; obs: number; asOf: number; source: string; error?: string; code?: string }
interface LogRow { id: string; month: string; country: string; value: number; note: string }
interface InvRow { id: string; date: string; model: string; value: number }

const BRAND_COLORS: Record<string, string> = { TESLA: '#ee9a45', BYD: '#5cc8f5', VOLKSWAGEN: '#b48cff', KIA: '#46d69a', VOLVO: '#ff5a4d', BMW: '#9aa5b1', POLESTAR: '#e8d27a', XPENG: '#f08bd0' };
const pct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`);
const tone = (v: number | null | undefined) => (v == null ? '' : v >= 0 ? 'up' : 'down');
const monthName = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const uid = () => Math.random().toString(36).slice(2, 9);
const thisMonth = () => new Date().toISOString().slice(0, 7);

function Bars({ rows, keys, height = 150 }: { rows: MonthRow[]; keys: string[]; height?: number }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(...keys.map((k) => r.counts[k] ?? 0))));
  const w = Math.max(320, rows.length * keys.length * 9 + rows.length * 6);
  const bw = 8;
  return (
    <div className="tl-bars-wrap">
      <svg className="tl-bars" viewBox={`0 0 ${w} ${height + 18}`} preserveAspectRatio="none" role="img" aria-label="Monthly registrations">
        {rows.map((r, i) => {
          const x0 = i * (keys.length * (bw + 1) + 6);
          return (
            <g key={r.month}>
              {keys.map((k, j) => { const v = r.counts[k] ?? 0, h = (v / max) * height; return <rect key={k} x={x0 + j * (bw + 1)} y={height - h} width={bw} height={h} fill={BRAND_COLORS[k] ?? '#888'} opacity={r.month === thisMonth() ? 0.45 : 1}><title>{`${k} ${monthName(r.month)}: ${v.toLocaleString()}${r.month === thisMonth() ? ' (month so far)' : ''}`}</title></rect>; })}
              {(i % 3 === 0 || i === rows.length - 1) && <text x={x0} y={height + 13} className="tl-ax">{monthName(r.month)}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Spark({ v }: { v: number[] }) {
  if (v.length < 2) return null;
  const w = 220, h = 46, pts = v.map((y, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${(h - 2 - (y / 100) * (h - 4)).toFixed(1)}`).join(' ');
  return <svg className="tl-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true"><polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.6" /></svg>;
}

function Registrations({ live }: { live: boolean }) {
  const [d, setD] = useState<RegResp | null>(null);
  const [err, setErr] = useState('');
  const [view, setView] = usePersisted<'brands' | 'models'>('tlRegView', 'brands');
  const [shown, setShown] = usePersisted<string[]>('tlBrands', ['TESLA', 'BYD']);
  useEffect(() => { if (!live) return; fetch('/api/research?fn=teslareg&months=36').then(async (r) => { const j = await r.json(); if (r.ok) setD(j); else setErr(j.error ?? `HTTP ${r.status}`); }).catch((e) => setErr(String(e))); }, [live]);
  const rows = view === 'brands' ? d?.brands ?? [] : d?.models ?? [];
  const modelKeys = useMemo(() => [...new Set((d?.models ?? []).flatMap((r) => Object.keys(r.counts)))].sort(), [d]);
  const keys = view === 'brands' ? shown : modelKeys;
  const full = rows.filter((r) => r.month < thisMonth());
  const last = full.at(-1)?.month;
  const q = quarters(d?.brands ?? [], 'TESLA').filter((x) => x.months === 3);
  const lastQ = q.at(-1), lastQyAgo = lastQ ? q.find((x) => x.q === `${Number(lastQ.q.slice(0, 4)) - 1}${lastQ.q.slice(4)}`) : undefined;
  return (
    <section className="tl-card">
      <header className="tl-h"><h3>Registrations · Netherlands</h3>{d && <Fresh kind="eod" at={d.asOf} src={d.source} />}<span className="tl-sp" /><Seg value={view} onChange={setView} options={[{ id: 'brands', label: 'Tesla vs others' }, { id: 'models', label: 'Tesla by model' }]} /></header>
      {!live && <p className="small muted">Live data only.</p>}
      {err && <p className="small down">{err}</p>}
      {live && !d && !err && <p className="small muted">Loading the official register…</p>}
      {d && last && (
        <>
          <div className="tl-kpis">
            {(view === 'brands' ? shown : modelKeys).slice(0, 4).map((k) => { const c = changes(rows, k, last); return (
              <div key={k} className="tl-kpi"><i style={{ background: BRAND_COLORS[k] ?? 'var(--accent)' }} /><span className="tl-k">{k} · {monthName(last)}</span><b>{c.value.toLocaleString()}</b><span className="small"><span className={tone(c.mom)}>{pct(c.mom)} MoM</span> · <span className={tone(c.yoy)}>{pct(c.yoy)} YoY</span></span></div>
            ); })}
            {lastQ && view === 'brands' && <div className="tl-kpi"><span className="tl-k">TESLA · {lastQ.q}</span><b>{lastQ.value.toLocaleString()}</b><span className="small"><span className={tone(lastQyAgo ? (lastQ.value / lastQyAgo.value - 1) * 100 : null)}>{pct(lastQyAgo ? (lastQ.value / lastQyAgo.value - 1) * 100 : null)} YoY</span> · quarter total</span></div>}
          </div>
          {view === 'brands' && <div className="tl-chips">{d.brandsTracked.map((b) => <button key={b} className={`chip sm ${shown.includes(b) ? 'on' : ''}`} onClick={() => setShown(shown.includes(b) ? shown.filter((x) => x !== b) : [...shown, b])}><i className="tl-dot" style={{ background: BRAND_COLORS[b] }} />{b}</button>)}</div>}
          <Bars rows={rows} keys={keys} />
          <p className="note">Tesla registrations bunch up in the last month of each quarter, when ships arrive, so compare quarter to quarter and with the same month last year, not month to month. The faded bar is the current month so far.</p>
        </>
      )}
    </section>
  );
}

function OtherCountries() {
  const [log, setLog] = usePersisted<LogRow[]>('tlRegLog', []);
  const [f, setF] = useState({ month: thisMonth(), country: 'Norway', value: '', note: '' });
  const countries = [...new Set(log.map((r) => r.country))];
  const add = (e: React.FormEvent) => { e.preventDefault(); const v = Number(f.value); if (!Number.isFinite(v) || v < 0 || !f.country.trim()) return; setLog([...log.filter((r) => !(r.country === f.country.trim() && r.month === f.month)), { id: uid(), month: f.month, country: f.country.trim(), value: v, note: f.note.trim() }]); setF({ ...f, value: '', note: '' }); };
  return (
    <section className="tl-card">
      <header className="tl-h"><h3>Other countries · your log</h3><span className="tl-sp" /><span className="small muted">Norway (OFV), UK (SMMT), Germany (KBA) and China (weekly insurance data) publish Tesla numbers in news and press releases, not free APIs.</span></header>
      <form className="tl-form" onSubmit={add}>
        <input type="month" value={f.month} onChange={(e) => setF({ ...f, month: e.target.value })} aria-label="Month" />
        <input list="tl-countries" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} placeholder="Country" aria-label="Country" />
        <datalist id="tl-countries">{['Norway', 'United Kingdom', 'Germany', 'France', 'China', 'Sweden', 'Denmark', 'Spain', 'Italy', 'Australia'].map((c) => <option key={c} value={c} />)}</datalist>
        <input type="number" min={0} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder="Teslas registered" aria-label="Teslas registered" />
        <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Source (e.g. OFV press release)" aria-label="Source" />
        <button className="btn primary" type="submit">Add</button>
      </form>
      {!log.length ? <p className="small muted">Add a month and country to start your own tracker. Each row shows month over month and year over year once it has the earlier months.</p> : (
        <table className="tl-table"><thead><tr><th>Country</th><th>Month</th><th className="r">Teslas</th><th className="r">MoM</th><th className="r">YoY</th><th>Source</th><th /></tr></thead><tbody>
          {countries.flatMap((c) => { const rows: MonthRow[] = log.filter((r) => r.country === c).map((r) => ({ month: r.month, counts: { T: r.value } })).sort((a, b) => a.month.localeCompare(b.month));
            return log.filter((r) => r.country === c).sort((a, b) => b.month.localeCompare(a.month)).map((r) => { const ch = changes(rows, 'T', r.month); return (
              <tr key={r.id}><td>{c}</td><td>{monthName(r.month)}</td><td className="r num">{r.value.toLocaleString()}</td><td className={`r num ${tone(ch.mom)}`}>{pct(ch.mom)}</td><td className={`r num ${tone(ch.yoy)}`}>{pct(ch.yoy)}</td><td className="small muted">{r.note}</td><td><button className="hw-btn" onClick={() => setLog(log.filter((x) => x.id !== r.id))} aria-label="Remove">×</button></td></tr>
            ); }); })}
        </tbody></table>
      )}
    </section>
  );
}

function LotCard({ lot, live, onEdit, onRemove }: { lot: Lot; live: boolean; onEdit: (l: Lot) => void; onRemove?: () => void }) {
  const [d, setD] = useState<LotResp | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(lot);
  useEffect(() => { if (!live) return; setD(null); fetch(`/api/research?fn=lot&lat=${lot.lat}&lon=${lot.lon}&size=${lot.size}`).then(async (r) => setD(await r.json())).catch((e) => setD({ error: String(e) } as LotResp)); }, [live, lot.lat, lot.lon, lot.size]);
  const m = d?.months ?? [], lastFull = [...m].reverse().find((x) => x.month < thisMonth()) ?? m.at(-1);
  const prev = lastFull ? m[m.findIndex((x) => x.month === lastFull.month) - 1] : undefined;
  const yAgo = lastFull ? m.find((x) => x.month === `${Number(lastFull.month.slice(0, 4)) - 1}${lastFull.month.slice(4)}`) : undefined;
  const mapUrl = `https://www.openstreetmap.org/?mlat=${lot.lat}&mlon=${lot.lon}#map=16/${lot.lat}/${lot.lon}`;
  return (
    <div className="tl-lot">
      <div className="tl-lot-h"><b>{lot.name}</b><span className="small muted">{lot.what}</span><span className="tl-sp" />
        <a className="small" href={mapUrl} target="_blank" rel="noreferrer noopener">map</a><button className="link small" onClick={() => { setDraft(lot); setEditing(!editing); }}>adjust</button>{onRemove && <button className="hw-btn" onClick={onRemove} aria-label="Remove lot">×</button>}</div>
      {editing && (
        <form className="tl-form" onSubmit={(e) => { e.preventDefault(); onEdit(draft); setEditing(false); }}>
          <input type="number" step="0.0001" value={draft.lat} onChange={(e) => setDraft({ ...draft, lat: Number(e.target.value) })} aria-label="Latitude" />
          <input type="number" step="0.0001" value={draft.lon} onChange={(e) => setDraft({ ...draft, lon: Number(e.target.value) })} aria-label="Longitude" />
          <input type="number" min={100} max={3000} step={50} value={draft.size} onChange={(e) => setDraft({ ...draft, size: Number(e.target.value) })} aria-label="Box size in meters" />
          <button className="btn sm primary" type="submit">Save</button>
        </form>
      )}
      {!live && <p className="small muted">Live data only.</p>}
      {d?.code === 'no-key' && <p className="small muted">Needs the free Copernicus keys (steps below).</p>}
      {d?.error && d.code !== 'no-key' && <p className="small down">{d.error}</p>}
      {live && !d && <p className="small muted">Reading two years of satellite passes…</p>}
      {lastFull && (
        <>
          <div className="tl-lot-k"><b className="num">{lastFull.index}</b><span className="small muted">/100 · {monthName(lastFull.month)}</span>
            <span className={`small ${tone(prev ? lastFull.index - prev.index : null)}`}>{prev ? `${lastFull.index - prev.index >= 0 ? '+' : ''}${lastFull.index - prev.index} pts MoM` : ''}</span>
            <span className={`small ${tone(yAgo ? lastFull.index - yAgo.index : null)}`}>{yAgo ? `${lastFull.index - yAgo.index >= 0 ? '+' : ''}${lastFull.index - yAgo.index} pts YoY` : ''}</span></div>
          <Spark v={m.map((x) => x.index)} />
          <span className="small muted">{d!.obs} clear passes in 2 years · 0 = this lot's emptiest month, 100 = its fullest</span>
        </>
      )}
    </div>
  );
}

function Lots({ live }: { live: boolean }) {
  const [mine, setMine] = usePersisted<Lot[]>('tlLots', DEFAULT_LOTS);
  const [nf, setNf] = useState({ name: '', lat: '', lon: '', size: '600' });
  const add = (e: React.FormEvent) => { e.preventDefault(); const lat = Number(nf.lat), lon = Number(nf.lon), size = Number(nf.size); if (!nf.name.trim() || !(Math.abs(lat) <= 80) || !(Math.abs(lon) <= 180)) return; setMine([...mine, { id: uid(), name: nf.name.trim(), what: 'Your lot', lat, lon, size }]); setNf({ name: '', lat: '', lon: '', size: '600' }); };
  return (
    <section className="tl-card">
      <header className="tl-h"><h3>Lot fullness · satellite</h3><span className="tl-sp" /><span className="small muted">Experimental: Sentinel-2 sees 10 m squares, so this is how bright and busy a lot looks, not a car count.</span></header>
      <div className="tl-lots">{mine.map((l) => <LotCard key={l.id} lot={l} live={live} onEdit={(x) => setMine(mine.map((y) => (y.id === l.id ? x : y)))} onRemove={() => setMine(mine.filter((y) => y.id !== l.id))} />)}</div>
      <form className="tl-form" onSubmit={add}>
        <input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} placeholder="Add a lot: name" aria-label="Lot name" />
        <input value={nf.lat} onChange={(e) => setNf({ ...nf, lat: e.target.value })} placeholder="Latitude" aria-label="Latitude" />
        <input value={nf.lon} onChange={(e) => setNf({ ...nf, lon: e.target.value })} placeholder="Longitude" aria-label="Longitude" />
        <input value={nf.size} onChange={(e) => setNf({ ...nf, size: e.target.value })} placeholder="Size (m)" aria-label="Box size in meters" />
        <button className="btn" type="submit">Add lot</button>
        <button className="btn" type="button" onClick={() => setMine(DEFAULT_LOTS)} title="Back to the starting 8 lots">Reset</button>
      </form>
      <details className="tl-setup"><summary>Set up the satellite keys (free, 5 minutes)</summary>
        <ol className="small">
          <li>Make a free account at <a href="https://dataspace.copernicus.eu" target="_blank" rel="noreferrer noopener">dataspace.copernicus.eu</a>.</li>
          <li>Open the <a href="https://shapps.dataspace.copernicus.eu/dashboard/" target="_blank" rel="noreferrer noopener">Sentinel Hub dashboard</a> → User settings → OAuth clients → Create. Copy the client ID and secret (the secret shows once).</li>
          <li>In Vercel → Settings → Environment Variables add <code>COPERNICUS_CLIENT_ID</code> and <code>COPERNICUS_CLIENT_SECRET</code>, then redeploy.</li>
        </ol>
        <p className="small muted">Lot centers are approximate: use "map" to check and "adjust" to move the box onto the lot itself. Each lot is read once a day and costs a small part of the free monthly quota.</p>
      </details>
    </section>
  );
}

function Inventory() {
  const [log, setLog] = usePersisted<InvRow[]>('tlInv', []);
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), model: 'Model Y', value: '' });
  const models = [...new Set(log.map((r) => r.model))];
  return (
    <section className="tl-card">
      <header className="tl-h"><h3>Inventory · your log</h3><span className="tl-sp" /><span className="small muted">Tesla's site refuses automated reads (HTTP 403), so the desk doesn't scrape it.</span></header>
      <p className="small">Weekly: open <a href="https://www.tesla.com/inventory/new/my" target="_blank" rel="noreferrer noopener">tesla.com/inventory</a>, note how many new cars show for a model, and log it. Rising unsold inventory late in a quarter is a classic demand tell.</p>
      <form className="tl-form" onSubmit={(e) => { e.preventDefault(); const v = Number(f.value); if (!Number.isFinite(v) || v < 0) return; setLog([...log, { id: uid(), date: f.date, model: f.model, value: v }]); setF({ ...f, value: '' }); }}>
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Date" />
        <select value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} aria-label="Model">{['Model Y', 'Model 3', 'Model S', 'Model X', 'Cybertruck'].map((m) => <option key={m}>{m}</option>)}</select>
        <input type="number" min={0} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder="Cars listed (US)" aria-label="Cars listed" />
        <button className="btn primary" type="submit">Log</button>
      </form>
      {models.map((m) => { const rows = log.filter((r) => r.model === m).sort((a, b) => a.date.localeCompare(b.date)); const last = rows.at(-1)!, prev = rows.at(-2);
        const yAgo = [...rows].reverse().find((r) => Date.parse(r.date) <= Date.parse(last.date) - 330 * 86400_000);
        return <div key={m} className="tl-inv"><b>{m}</b><span className="num">{last.value.toLocaleString()}</span><span className="small muted">{last.date}</span>
          <span className={`small ${tone(prev ? last.value - prev.value : null)}`}>{prev ? `${pct((last.value / prev.value - 1) * 100)} vs last log` : ''}</span>
          <span className={`small ${tone(yAgo ? last.value - yAgo.value : null)}`}>{yAgo ? `${pct((last.value / yAgo.value - 1) * 100)} YoY` : ''}</span>
          <button className="link small" onClick={() => setLog(log.filter((r) => r.model !== m))}>clear</button></div>; })}
    </section>
  );
}

export default function TeslaPage({ mode }: { mode: DataMode }) {
  const live = mode.kind === 'live';
  return (
    <div className="page tl">
      <div className="tl-top"><h2>Tesla &amp; Lots</h2><span className="small muted">Registrations, parking-lot fullness and inventory, month over month and year over year. Data to research with, not advice.</span></div>
      <Registrations live={live} />
      <Lots live={live} />
      <div className="tl-two"><OtherCountries /><Inventory /></div>
    </div>
  );
}
