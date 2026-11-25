// Commodity Map: a tile map of the 50 states colored by a free government layer (US Drought Monitor, NWS severe
// alerts, FEMA disasters), with the main producing states of a commodity outlined and ranked. Click a state to see
// what is happening there and the tickers tied to it (Watch, alert, chart). Real data only; nothing in demo mode.
import { useEffect, useMemo, useState } from 'react';
import type { DataMode } from '../data/live';
import { COMMODITIES, DROUGHT_LABEL, TILES, droughtLevel, type Drought, type FemaDecl } from '../../shared/cmap';
import { load, save, usePersisted } from '../lib/store';
import { useDesk } from '../lib/deskctx';
import { Fresh, Q, Seg } from './common';

interface Data { drought: Record<string, Drought> | null; alerts: Record<string, { event: string; until: string | null }[]> | null; fema: Record<string, FemaDecl[]> | null; errors: Record<string, string>; asOf: number; source: string }
type Layer = 'drought' | 'alerts' | 'fema';
const NAMES: Record<string, string> = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' };
const DCOL = ['--dr0', '--dr1', '--dr2', '--dr3', '--dr4'];

/** What changed since this browser last opened the map: new alert types and worse drought levels, per state. */
function useChanges(d: Data | null): Record<string, string[]> {
  return useMemo(() => {
    if (!d) return {};
    const prev = load<{ alerts: Record<string, string[]>; drought: Record<string, number> } | null>('cmapSeen', null);
    const now = { alerts: Object.fromEntries(Object.entries(d.alerts ?? {}).map(([s, xs]) => [s, xs.map((x) => x.event)])), drought: Object.fromEntries(Object.entries(d.drought ?? {}).map(([s, x]) => [s, droughtLevel(x)])) };
    save('cmapSeen', now);
    if (!prev) return {};
    const out: Record<string, string[]> = {};
    for (const [s, evs] of Object.entries(now.alerts)) for (const e of evs) if (!prev.alerts[s]?.includes(e)) (out[s] ??= []).push(`new ${e}`);
    for (const [s, lv] of Object.entries(now.drought)) if (lv > (prev.drought[s] ?? -1) && lv >= 1) (out[s] ??= []).push(`drought worse: ${DROUGHT_LABEL[lv]}`);
    return out;
  }, [d]);
}

/** The US tab of World Monitor (also usable on its own). */
export default function CommodityMap({ mode, onChart, onWatch }: { mode: DataMode; onChart: (s: string) => void; onWatch: (s: string) => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [layer, setLayer] = usePersisted<Layer>('cmapLayer', 'drought');
  const [com, setCom] = usePersisted<string>('cmapCom', 'corn');
  const [sel, setSel] = usePersisted<string>('cmapSel', 'IA');
  const { priceAlerts, setPriceAlerts, openCompany } = useDesk();
  useEffect(() => {
    if (mode.kind !== 'live') return;
    let stop = false;
    const go = () => fetch('/api/research?fn=cmap').then((r) => r.json()).then((j) => { if (!stop) { if (j.error) setErr(j.error); else setD(j); } }).catch((e) => !stop && setErr(String(e)));
    go(); const id = setInterval(go, 15 * 60_000);
    return () => { stop = true; clearInterval(id); };
  }, [mode.kind]);
  const changes = useChanges(d);
  const c = COMMODITIES.find((x) => x.id === com) ?? COMMODITIES[0];
  const rank = (s: string) => c.states.indexOf(s);
  const fill = (s: string): string | undefined => {
    if (!d) return undefined;
    if (layer === 'drought') { const lv = droughtLevel(d.drought?.[s]); return lv < 0 ? undefined : `var(${DCOL[lv]})`; }
    if (layer === 'alerts') { const n = d.alerts?.[s]?.length ?? 0; return n ? `color-mix(in srgb, var(--down) ${Math.min(70, 20 + n * 12)}%, transparent)` : undefined; }
    const n = d.fema?.[s]?.length ?? 0; return n ? `color-mix(in srgb, var(--warn) ${Math.min(70, 22 + n * 14)}%, transparent)` : undefined;
  };
  const watchHits = c.states.filter((s) => (d?.alerts?.[s]?.length ?? 0) > 0 || droughtLevel(d?.drought?.[s]) >= 2 || (d?.fema?.[s]?.length ?? 0) > 0);
  const addAlert = (sym: string) => { if (setPriceAlerts) setPriceAlerts([...(priceAlerts ?? []), { id: Math.random().toString(36).slice(2, 10), sym, kind: 'chgUp', value: 3, note: `${c.label}: up 3% on the day (Commodity Map)`, active: true, created: Date.now() }, { id: Math.random().toString(36).slice(2, 10), sym, kind: 'chgDown', value: 3, note: `${c.label}: down 3% on the day (Commodity Map)`, active: true, created: Date.now() }]); };
  if (mode.kind !== 'live') return <div className="cmp"><section className="panel"><div className="phead"><div className="phead-title">US map</div></div><p className="small muted gx-pad">This map only uses real government data, so it needs live mode.</p></section></div>;
  const sd = d?.drought?.[sel], sa = d?.alerts?.[sel] ?? [], sf = d?.fema?.[sel] ?? [];
  return (
    <div className="cmp">
      <section className="panel">
        <div className="phead">
          <div className="phead-title">US map: drought, weather, disasters and farm / energy states</div>
          <div className="phead-ctl">
            <Seg<Layer> value={layer} onChange={setLayer} options={[{ id: 'drought', label: 'Drought' }, { id: 'alerts', label: 'Severe weather' }, { id: 'fema', label: 'FEMA disasters' }]} />
            {d && <Fresh kind="delayed" at={d.asOf} src={d.source} />}
          </div>
        </div>
        <div className="cmp-coms">{COMMODITIES.map((x) => <button key={x.id} className={`chip sm ${x.id === com ? 'on' : ''}`} onClick={() => setCom(x.id)} aria-pressed={x.id === com}>{x.label}</button>)}</div>
        {err && !d && <p className="small down gx-pad">Could not load the map layers: {err}</p>}
        {d && Object.keys(d.errors ?? {}).length > 0 && <p className="small warn-txt gx-pad">Some layers did not load: {Object.entries(d.errors).map(([k, v]) => `${k} (${v})`).join(', ')}</p>}
        {d && <p className="small gx-pad">{watchHits.length ? <><b>{c.label} states with something going on:</b> {watchHits.map((s) => `${NAMES[s]} (#${rank(s) + 1})`).join(', ')}</> : <>Nothing unusual in the top {c.label.toLowerCase()} states right now.</>}{Object.keys(changes).length > 0 && <> · <b>Since your last visit:</b> {Object.entries(changes).slice(0, 6).map(([s, xs]) => `${s} ${xs.join(', ')}`).join('; ')}</>}</p>}
      </section>
      <div className="cmp-grid">
        <section className="panel cmp-mapp">
          <div className="gx-h"><Q k="delayed" src={d?.source ?? 'loading'} /><b>{layer === 'drought' ? 'Worst drought level covering 10%+ of the state' : layer === 'alerts' ? 'Active severe and extreme weather alerts' : 'FEMA disaster declarations, last 60 days'}</b><span className="small muted">outlined + number = top {c.label.toLowerCase()} states by rank (approximate) · ● = changed since your last visit</span></div>
          <div className="cmp-map" role="group" aria-label="US states">
            {Object.entries(TILES).map(([s, [r, col]]) => (
              <button key={s} className={`cmp-t ${rank(s) >= 0 ? 'prod' : ''} ${sel === s ? 'sel' : ''}`} style={{ gridRow: r + 1, gridColumn: col + 1, background: fill(s), color: layer === 'drought' && fill(s) ? 'var(--dr-text)' : undefined }} onClick={() => setSel(s)} title={NAMES[s]}>
                <b>{s}</b>{rank(s) >= 0 && <em>#{rank(s) + 1}</em>}{changes[s] && <i className="cmp-new" aria-label="changed since your last visit">●</i>}
              </button>
            ))}
          </div>
          {layer === 'drought' && <div className="cmp-leg">{DROUGHT_LABEL.map((l, i) => <span key={l}><i style={{ background: `var(${DCOL[i]})` }} />{l}</span>)}</div>}
        </section>
        <section className="panel cmp-side">
          <div className="gx-h"><b>{NAMES[sel] ?? sel}</b>{rank(sel) >= 0 && <span className="small muted">#{rank(sel) + 1} for {c.label.toLowerCase()}</span>}</div>
          <div className="cmp-sec"><h4>Drought</h4>{sd ? <p className="small">{droughtLevel(sd) < 0 ? 'No drought.' : DROUGHT_LABEL[droughtLevel(sd)]} · dry or worse {sd.d0.toFixed(0)}% · drought (D1+) {sd.d1.toFixed(0)}% · severe+ (D2+) {sd.d2.toFixed(0)}% <span className="muted">(map of {sd.day})</span></p> : <p className="small muted">No reading.</p>}</div>
          <div className="cmp-sec"><h4>Severe weather now</h4>{sa.length ? <ul className="small">{sa.map((a) => <li key={a.event}>{a.event}{a.until ? ` · until ${new Date(a.until).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET` : ''}</li>)}</ul> : <p className="small muted">No severe or extreme alerts.</p>}</div>
          <div className="cmp-sec"><h4>FEMA declarations (60 days)</h4>{sf.length ? <ul className="small">{sf.slice(0, 6).map((f) => <li key={f.title + f.date}>{f.date} · {f.type}: {f.title}</li>)}</ul> : <p className="small muted">None.</p>}</div>
          <div className="cmp-sec"><h4>Commodities here</h4>
            {COMMODITIES.filter((x) => x.states.includes(sel)).length === 0 && <p className="small muted">Not a top producer of the tracked commodities.</p>}
            {COMMODITIES.filter((x) => x.states.includes(sel)).map((x) => (
              <div key={x.id} className="cmp-com"><b className="small">{x.label} · #{x.states.indexOf(sel) + 1}</b>
                {x.tickers.map((t) => (
                  <div key={t.sym} className="cmp-tk"><button className="nt-sym link" onClick={() => openCompany(t.sym)}>{t.sym}</button><span className="small muted">{t.why}</span>
                    <span className="cmp-act"><button className="nt-b" onClick={() => onWatch(t.sym)}>+ Watch</button><button className="nt-b" onClick={() => onChart(t.sym)}>Chart</button>{setPriceAlerts && <button className="nt-b" onClick={() => addAlert(t.sym)} title="Alert when it moves 3% up or down on the day">🔔 ±3%</button>}</span></div>
                ))}
              </div>
            ))}
          </div>
          <p className="note small">Producer ranks are approximate, from recent USDA and EIA annual rankings. Weather and drought don't move a stock on their own; they are context. Not investment advice.</p>
        </section>
      </div>
    </div>
  );
}
