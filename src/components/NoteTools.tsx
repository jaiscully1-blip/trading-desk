// Notebook tools for Essays: tickers found in a note (watch, price alert), reminders (one-time or routine), and a month
// calendar of note cards with each day's P&L from your journal.
import { useMemo, useState } from 'react';
import { useDesk } from '../lib/deskctx';
import { KIND_LABEL, type AlertKind } from '../../shared/alertrules';
import { REPEAT_LABEL, addReminder, etNowParts, onDay, removeReminder, useReminders, type Repeat } from '../lib/noteReminders';
import { sUsd } from '../lib/format';
import { Q } from './common';

export interface NoteLite { id: string; title: string; idea?: string; sym: string; html: string; day?: string; created: number }
export const noteDay = (n: NoteLite) => n.day ?? etNowParts(n.created).day;
const text = (html: string) => html.replace(/<[^>]+>/g, ' ');
/** $TICKER mentions in the note, plus its main ticker. */
export const noteTickers = (n: NoteLite) => [...new Set([n.sym, ...[...text(n.html).matchAll(/\$([A-Za-z]{1,5}(?:\.[A-Za-z])?)\b/g)].map((m) => m[1].toUpperCase())].filter(Boolean))];

function AlertForm({ sym, note, onDone }: { sym: string; note: string; onDone: () => void }) {
  const { priceAlerts, setPriceAlerts } = useDesk();
  const [kind, setKind] = useState<AlertKind>('above'), [v, setV] = useState('');
  return (
    <form className="nt-alert" onSubmit={(e) => { e.preventDefault(); const value = Number(v); if (!(value > 0) || !setPriceAlerts) return; setPriceAlerts([...(priceAlerts ?? []), { id: Math.random().toString(36).slice(2, 10), sym, kind, value, note, active: true, created: Date.now() }]); onDone(); }}>
      <b>{sym}</b>
      <select value={kind} onChange={(e) => setKind(e.target.value as AlertKind)} aria-label="Alert when">{(Object.keys(KIND_LABEL) as AlertKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
      <input value={v} onChange={(e) => setV(e.target.value)} inputMode="decimal" placeholder={kind === 'above' || kind === 'below' ? 'price' : kind === 'rvol' ? '×' : '%'} aria-label="Alert value" autoFocus />
      <button className="btn sm primary" disabled={!(Number(v) > 0)}>Set alert</button>
      <button type="button" className="btn sm" onClick={onDone}>Cancel</button>
    </form>
  );
}

/** One ticker with Watch and Alert buttons. */
export function TickerChip({ sym, note, onWatch }: { sym: string; note: string; onWatch?: (s: string) => void }) {
  const { priceAlerts, openCompany } = useDesk();
  const [alerting, setAlerting] = useState(false), [watched, setWatched] = useState(false);
  const n = (priceAlerts ?? []).filter((a) => a.sym === sym && a.active).length;
  if (alerting) return <AlertForm sym={sym} note={note} onDone={() => setAlerting(false)} />;
  return (
    <span className="nt-tk">
      <button className="link nt-sym" data-sym={sym} onClick={() => openCompany?.(sym)}>{sym}</button>
      <button className="nt-b" title={`Add ${sym} to your watchlist`} onClick={() => { onWatch?.(sym); setWatched(true); }}>{watched ? '✓' : '+ Watch'}</button>
      <button className="nt-b" title={n ? `${n} alert${n > 1 ? 's' : ''} on ${sym}. Add another` : `Ping me when ${sym} hits a price or move`} onClick={() => setAlerting(true)}>🔔{n ? ` ${n}` : ''}</button>
    </span>
  );
}

export function ReminderForm({ noteId, sym, day, onDone }: { noteId?: string; sym?: string; day: string; onDone?: () => void }) {
  const [t, setT] = useState(''), [date, setDate] = useState(day), [time, setTime] = useState('09:15'), [repeat, setRepeat] = useState<Repeat>('once');
  return (
    <form className="nt-rem-f" onSubmit={(e) => { e.preventDefault(); if (!t.trim()) return; addReminder({ noteId, sym, text: t.trim(), date, time, repeat }); setT(''); onDone?.(); }}>
      <input value={t} onChange={(e) => setT(e.target.value)} placeholder={sym ? `e.g. Check ${sym} at the open` : 'Remind me to…'} aria-label="Reminder" />
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
      <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time (ET)" title="Eastern time" />
      <select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)} aria-label="Repeat">{(Object.keys(REPEAT_LABEL) as Repeat[]).map((k) => <option key={k} value={k}>{REPEAT_LABEL[k]}</option>)}</select>
      <button className="btn sm primary" disabled={!t.trim()}>Add reminder</button>
    </form>
  );
}

const hm12 = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };
export function ReminderList({ noteId, day }: { noteId?: string; day?: string }) {
  const all = useReminders();
  const xs = all.filter((r) => (noteId ? r.noteId === noteId : day ? onDay(r, day) && (r.active || r.lastFired === day) : r.active));
  if (!xs.length) return null;
  return (
    <ul className="nt-rems">{xs.map((r) => <li key={r.id} className={r.active ? '' : 'done'}><span className="nt-rk">{r.repeat === 'once' ? '⏰' : '🔁'}</span><span>{r.text}</span><span className="small muted">{r.repeat === 'once' ? r.date : REPEAT_LABEL[r.repeat]} · {hm12(r.time)} ET{r.active ? '' : ' · done'}</span><button className="nt-x" onClick={() => removeReminder(r.id)} aria-label="Remove reminder">×</button></li>)}</ul>
  );
}

/** Tickers, reminders and date stamp for the open note. */
export function NoteToolbar({ note, onStamp, onWatch }: { note: NoteLite; onStamp: (day: string) => void; onWatch?: (s: string) => void }) {
  const [rem, setRem] = useState(false);
  const tks = noteTickers(note);
  return (
    <div className="nt-bar">
      <label className="nt-stamp" title="The day this note belongs to on the notebook calendar">📅 <input type="date" value={noteDay(note)} onChange={(e) => e.target.value && onStamp(e.target.value)} aria-label="Note date" /></label>
      <span className="nt-tks">{tks.map((s) => <TickerChip key={s} sym={s} note={`From note: ${note.title || 'Untitled'}`} onWatch={onWatch} />)}{tks.length < 2 && <span className="small muted">Type $TICKER in the note to get watch and alert buttons here</span>}</span>
      <button className={`btn sm ${rem ? 'on' : ''}`} onClick={() => setRem(!rem)}>⏰ Reminder</button>
      {rem && <ReminderForm noteId={note.id} sym={note.sym} day={etNowParts().day} onDone={() => setRem(false)} />}
      <ReminderList noteId={note.id} />
    </div>
  );
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Month of note cards: P&L from the journal, the notes stamped that day, reminders. Click a day for its notes. */
export function NotesCalendar({ notes, dayPnl, onOpen, onNewOn, onWatch }: { notes: NoteLite[]; dayPnl: Map<string, number>; onOpen: (id: string) => void; onNewOn: (day: string) => void; onWatch?: (s: string) => void }) {
  const today = etNowParts().day;
  const [ym, setYm] = useState(() => ({ y: +today.slice(0, 4), m: +today.slice(5, 7) - 1 }));
  const [sel, setSel] = useState(today);
  const reminders = useReminders();
  const byDay = useMemo(() => { const m = new Map<string, NoteLite[]>(); for (const n of notes) { const d = noteDay(n); m.set(d, [...(m.get(d) ?? []), n]); } return m; }, [notes]);
  const first = new Date(ym.y, ym.m, 1), start = new Date(ym.y, ym.m, 1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => ymd(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
  const monthPnl = cells.filter((d) => +d.slice(5, 7) - 1 === ym.m).reduce((a, d) => a + (dayPnl.get(d) ?? 0), 0);
  const tickers = useMemo(() => { const m = new Map<string, { n: number; last: string }>(); for (const n of notes) for (const s of noteTickers(n)) { const x = m.get(s) ?? { n: 0, last: '' }; x.n++; x.last = noteDay(n) > x.last ? noteDay(n) : x.last; m.set(s, x); } return [...m.entries()].sort((a, b) => b[1].last.localeCompare(a[1].last) || b[1].n - a[1].n); }, [notes]);
  const move = (k: number) => setYm(({ y, m }) => { const d = new Date(y, m + k, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const selNotes = byDay.get(sel) ?? [];
  return (
    <div className="page nt-cal">
      <section className="panel nt-main">
        <div className="nt-head">
          <button className="btn sm" onClick={() => move(-1)} aria-label="Previous month">‹</button>
          <b>{first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b>
          <button className="btn sm" onClick={() => move(1)} aria-label="Next month">›</button>
          <button className="btn sm" onClick={() => { setYm({ y: +today.slice(0, 4), m: +today.slice(5, 7) - 1 }); setSel(today); }}>Today</button>
          <span className="es-sp" />
          <Q k="mine" src="Your notes and reminders (this browser) · P&L = closed trades in your journal" />{monthPnl !== 0 && <span className="small">Month P&amp;L <b className={`num ${monthPnl >= 0 ? 'up' : 'dn'}`}>{sUsd(monthPnl)}</b></span>}
        </div>
        <div className="nt-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => <span key={w} className="nt-wd">{w}</span>)}
          {cells.map((d) => {
            const ns = byDay.get(d) ?? [], p = dayPnl.get(d), rs = reminders.filter((r) => onDay(r, d) && (r.active || r.lastFired === d));
            return (
              <div key={d} role="button" tabIndex={0} className={`nt-cell ${+d.slice(5, 7) - 1 !== ym.m ? 'out' : ''} ${d === today ? 'today' : ''} ${d === sel ? 'sel' : ''} ${p != null ? (p >= 0 ? 'green' : 'red') : ''}`} onClick={() => setSel(d)} onDoubleClick={() => onNewOn(d)} onKeyDown={(e) => e.key === 'Enter' && setSel(d)}>
                <div className="nt-ch"><span className="nt-dn">{+d.slice(8)}</span>{p != null && <span className={`num nt-pnl ${p >= 0 ? 'up' : 'dn'}`}>{sUsd(p)}</span>}</div>
                {ns.slice(0, 3).map((n) => <button key={n.id} className="nt-card" onClick={(e) => { e.stopPropagation(); onOpen(n.id); }} title={n.idea || text(n.html).slice(0, 140)}>{n.title || 'Untitled'}{n.sym ? <span className="muted"> · {n.sym}</span> : null}</button>)}
                {ns.length > 3 && <span className="small muted">+{ns.length - 3} more</span>}
                {rs.length > 0 && <span className="nt-rdot" title={rs.map((r) => r.text).join('\n')}>⏰ {rs.length}</span>}
              </div>
            );
          })}
        </div>
        <p className="small muted">Click a day to see its notes · double-click to start a note stamped to that day · P&amp;L is closed trades from your journal.</p>
      </section>
      <aside className="panel nt-side">
        <div className="nt-sh"><b>{new Date(`${sel}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</b>{dayPnl.has(sel) && <b className={`num ${dayPnl.get(sel)! >= 0 ? 'up' : 'dn'}`}>{sUsd(dayPnl.get(sel)!)}</b>}</div>
        <button className="btn primary" onClick={() => onNewOn(sel)}>+ New note for this day</button>
        {selNotes.map((n) => <button key={n.id} className="nt-sn" onClick={() => onOpen(n.id)}><b>{n.title || 'Untitled'}</b><span className="small muted">{(n.idea || text(n.html)).trim().slice(0, 120) || 'Empty note'}</span></button>)}
        {!selNotes.length && <p className="small muted">No notes stamped to this day.</p>}
        <h4 className="nt-h4">Reminders</h4>
        <ReminderList day={sel} />
        <ReminderForm day={sel} />
        <h4 className="nt-h4">Notebook watchlist <span className="small muted">tickers in your notes</span></h4>
        <div className="nt-wl">{tickers.slice(0, 30).map(([s, x]) => <div key={s} className="nt-wlr"><TickerChip sym={s} note="From your notebook" onWatch={onWatch} /><span className="small muted">{x.n} note{x.n > 1 ? 's' : ''} · {x.last.slice(5)}</span></div>)}{!tickers.length && <p className="small muted">Type $TICKER in any note and it shows up here.</p>}</div>
      </aside>
    </div>
  );
}
