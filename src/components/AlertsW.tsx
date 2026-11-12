// Price alerts widget: add an alert on any ticker (price above / below, % up / down on the day, relative volume), see how
// far each one is from ringing, re-arm or delete. Alerts ring with a sound and a pop-up inside the desk on any page.
import { useState } from 'react';
import type { Quote } from '../types';
import { KIND_LABEL, describeAlert, distance, unit, type AlertKind, type PriceAlert } from '../../shared/alertrules';
import { useDesk } from '../lib/deskctx';

const KINDS: AlertKind[] = ['above', 'below', 'chgUp', 'chgDown', 'rvol'];
const when = (t: number) => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

export function AlertsW({ quotes, sel, live, onChart }: { quotes: Record<string, Quote>; sel: string; live: boolean; onChart: (s: string) => void }) {
  const { priceAlerts = [], setPriceAlerts } = useDesk();
  const [sym, setSym] = useState(sel);
  const [kind, setKind] = useState<AlertKind>('above');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [repeat, setRepeat] = useState(false);
  const [err, setErr] = useState('');
  const q = quotes[sym.toUpperCase()];
  const add = () => {
    const s = sym.trim().toUpperCase().replace(/^\$/, ''), v = parseFloat(value);
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(s)) return setErr('Type a ticker.');
    if (!Number.isFinite(v) || v <= 0) return setErr('Type a number above 0.');
    setErr('');
    setPriceAlerts?.([{ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, sym: s, kind, value: v, note: note.trim() || undefined, repeat, active: true, created: Date.now() }, ...priceAlerts].slice(0, 60));
    setValue(''); setNote('');
  };
  const upd = (id: string, p: Partial<PriceAlert>) => setPriceAlerts?.(priceAlerts.map((a) => (a.id === id ? { ...a, ...p } : a)));
  const del = (id: string) => setPriceAlerts?.(priceAlerts.filter((a) => a.id !== id));
  const active = priceAlerts.filter((a) => a.active), done = priceAlerts.filter((a) => !a.active);
  return (
    <div className="al">
      <div className="al-form">
        <input className="tp-in" value={sym} onChange={(e) => setSym(e.target.value.toUpperCase())} aria-label="Ticker" maxLength={10} />
        <select value={kind} onChange={(e) => setKind(e.target.value as AlertKind)} aria-label="Condition">{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
        <input className="al-val" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder={kind === 'above' || kind === 'below' ? (q && Number.isFinite(q.last) ? q.last.toFixed(2) : 'price') : kind === 'rvol' ? '2' : '3'} aria-label="Value" />
        <span className="small muted">{unit(kind) === '$' ? '' : unit(kind)}</span>
        <label className="small"><input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} /> repeat</label>
        <button className="btn sm" onClick={add}>Add</button>
      </div>
      <input className="al-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="note (optional): why this level matters" maxLength={80} />
      {err && <p className="small down hw-pad">{err}</p>}
      {!live && <p className="small muted hw-pad">Alerts only check live quotes; in demo mode nothing rings.</p>}
      <div className="al-list">
        {active.map((a) => (
          <div key={a.id} className="al-row">
            <button className="wl-sym" onClick={() => onChart(a.sym)}>{a.sym}</button>
            <span className="small">{describeAlert(a).replace(`${a.sym} `, '')}{a.repeat ? <span className="muted"> · repeats</span> : null}{a.note ? <span className="muted"> · {a.note}</span> : null}</span>
            <span className="num small muted">{distance(a, quotes[a.sym])}</span>
            <button className="wl-x vis" onClick={() => del(a.id)} aria-label={`Delete alert on ${a.sym}`}>×</button>
          </div>
        ))}
        {!active.length && <p className="small muted hw-pad">No active alerts. Add one above; it rings on any page.</p>}
        {done.length > 0 && <div className="small muted al-sub">Rang</div>}
        {done.slice(0, 15).map((a) => (
          <div key={a.id} className="al-row done">
            <button className="wl-sym" onClick={() => onChart(a.sym)}>{a.sym}</button>
            <span className="small">{describeAlert(a).replace(`${a.sym} `, '')}</span>
            <span className="num small muted">{a.firedAt ? `${when(a.firedAt)} at $${a.firedPx?.toFixed(2)}` : 'off'}</span>
            <span><button className="link small" onClick={() => upd(a.id, { active: true, firedAt: undefined, firedPx: undefined })}>re-arm</button> <button className="wl-x vis" onClick={() => del(a.id)} aria-label={`Delete alert on ${a.sym}`}>×</button></span>
          </div>
        ))}
      </div>
      <p className="note small">Checked each time quotes refresh (every few seconds to a minute, depending on the data source). Sound and a pop-up inside the desk only; phone alerts stay off. Tickers with an alert are always quoted.</p>
    </div>
  );
}
