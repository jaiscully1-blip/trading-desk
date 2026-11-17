// Calm mode: covers the whole desk and shows only a spreadsheet of two price checks a day (9:30 AM open and 4:00 PM close) for the
// stocks you chose. No live prices, no charts, no news, no colours. It stays on until you turn it off, even after a reload.
// Prices are real daily bars (Yahoo, end of day); today's numbers stay hidden until each check time has passed. Nothing here can trade.
import { useEffect, useMemo, useState } from 'react';
import { usePersisted } from '../lib/store';
import { ymd } from '../../shared/essay';

interface Day { time: number; open: number; close: number }
const SYM_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const MAX = 10;
const OPEN_SHOWN = 9 * 60 + 45;   // the 9:30 open, once the (about 15 min delayed) feed has it
const CLOSE_SHOWN = 16 * 60 + 20; // the 4:00 close, once the delayed feed has finished the day
const LOCKS = ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30'];
const lockMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const t12 = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
interface Note { intent: string; close?: string; at: number }
const QUESTIONS = [
  'Has my plan changed, or only the price?',
  'Would I put this trade on right now, with today’s information? If not, why am I holding it?',
  'What would have to happen for me to be wrong? Is it a price, a date, or a fact?',
  'Is this worry about money I could lose, or about being embarrassed if I am wrong?',
  'If I checked only at 9:30 and 4:00 for a month, what would I miss that actually matters?',
  'Is my position size small enough that I could sleep through a bad day?',
  'What did I write in my journal when I made this decision? Does it still hold?',
  'Am I looking for information, or for reassurance? Reassurance does not change the next price.',
  'What is one thing I can do right now that is not looking at a price?',
  'If a friend held this and felt like I do, what would I ask them?',
];

function etClock() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, mins: Number(p.hour) * 60 + Number(p.minute) };
}
const nextCheck = (mins: number) => {
  const left = (t: number) => { const m = t - mins; return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
  if (mins < 9 * 60 + 30) return `9:30 AM open, in ${left(9 * 60 + 30)}`;
  if (mins < 16 * 60) return `4:00 PM close, in ${left(16 * 60)}`;
  return 'the next 9:30 AM open (next market day)';
};
const dateLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const p2 = (n: number) => n.toFixed(2);

export default function CalmMode({ onExit }: { onExit: () => void }) {
  const [syms, setSyms] = usePersisted<string[]>('calmSyms', ['SPY', 'QQQ']);
  const [draft, setDraft] = useState('');
  const [data, setData] = useState<Record<string, Day[] | string>>({});
  const [tick, setTick] = useState(0);
  const [qi, setQi] = useState(() => new Date().getDate() % QUESTIONS.length);
  const [leaving, setLeaving] = useState(false);
  const [lock, setLock] = usePersisted<{ day: string; until: string } | null>('calmLock', null); // "no checking before ...", today only
  const [notes, setNotes] = usePersisted<Record<string, Note>>('calmNotes', {});
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 60_000); return () => clearInterval(id); }, []);
  // fetch quietly: the numbers on screen only change at the two check times
  useEffect(() => {
    let stop = false;
    const load = () => syms.forEach((s) => {
      fetch(`/api/research?fn=bars&symbol=${encodeURIComponent(s)}&tf=1d`).then(async (r) => {
        const j = await r.json();
        if (stop) return;
        setData((d) => ({ ...d, [s]: r.ok ? (j.bars as Day[]).map((b) => ({ time: b.time, open: b.open, close: b.close })) : (j.error ?? `HTTP ${r.status}`) }));
      }).catch((e) => { if (!stop) setData((d) => ({ ...d, [s]: String(e?.message ?? e) })); });
    });
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => { stop = true; clearInterval(id); };
  }, [syms]);

  const now = useMemo(() => etClock(), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = useMemo(() => {
    const set = new Set<string>();
    for (const s of syms) { const d = data[s]; if (Array.isArray(d)) for (const b of d) set.add(ymd(b.time)); }
    return [...set].sort().reverse().slice(0, 30);
  }, [data, syms]);
  const lockedNow = !!lock && lock.day === now.day && now.mins < lockMins(lock.until);
  const setUntil = (v: string) => {
    if (!v) { if (lockedNow && !confirm('You set this timer to protect yourself. Remove it and look now?')) return; setLock(null); return; }
    if (lockedNow && lockMins(v) < lockMins(lock!.until) && !confirm('You set a later time earlier. Move it earlier anyway?')) return;
    setLock({ day: now.day, until: v });
  };
  const note = notes[now.day];
  const writeNote = (patch: Partial<Note>) => { setNotes({ ...notes, [now.day]: { ...note, ...patch, intent: patch.intent ?? note?.intent ?? '', at: Date.now() } }); setSavedAt(Date.now()); };
  const afterClose = now.mins >= 16 * 60;
  const past = Object.entries(notes).filter(([d, n]) => d !== now.day && (n.intent || n.close)).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);
  const cell = (s: string, day: string) => {
    const d = data[s];
    const b = Array.isArray(d) ? d.find((x) => ymd(x.time) === day) : undefined;
    if (!b) return { open: null as number | null, close: null as number | null, wait: false };
    const today = day === now.day;
    const locked = today && lockedNow;
    const openOk = !today || (now.mins >= OPEN_SHOWN && !locked), closeOk = !today || (now.mins >= CLOSE_SHOWN && !locked);
    return { open: openOk ? b.open : null, close: closeOk ? b.close : null, wait: today && (!openOk || !closeOk), locked };
  };

  const add = () => { const s = draft.trim().toUpperCase(); setDraft(''); if (SYM_RE.test(s) && !syms.includes(s) && syms.length < MAX) setSyms([...syms, s]); };
  const csv = () => {
    const head = ['Date', ...syms.flatMap((s) => [`${s} 9:30 open`, `${s} 4:00 close`])];
    const rows = days.map((d) => [d, ...syms.flatMap((s) => { const c = cell(s, d); return [c.open == null ? '' : p2(c.open), c.close == null ? '' : p2(c.close)]; })]);
    const text = [head, ...rows].map((r) => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = `price-checks-${now.day}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <div className="calm" role="dialog" aria-modal="true" aria-label="Calm mode">
      <div className="calm-in">
        <header className="calm-h">
          <div>
            <h1>Calm mode</h1>
            <p className="muted">Two price checks a day: the 9:30 AM open and the 4:00 PM close. Everything else on the desk is hidden until you turn this off.</p>
            <p className="small muted">Next check: {nextCheck(now.mins)}. Today’s numbers appear at {Math.floor(OPEN_SHOWN / 60)}:{String(OPEN_SHOWN % 60).padStart(2, '0')} AM and {Math.floor(CLOSE_SHOWN / 60) - 12}:{String(CLOSE_SHOWN % 60).padStart(2, '0')} PM ET, because the free price feed runs about 15 minutes late. Real daily prices, no colours on purpose.</p>
          </div>
          <div className="calm-btns"><button className="btn" onClick={csv} disabled={!days.length} title="Download this sheet as a CSV file that opens in Excel">Download for Excel</button><button className="btn" onClick={() => setLeaving(true)}>Leave Calm mode</button></div>
        </header>

        <div className="calm-syms">
          {syms.map((s) => <span key={s} className="calm-chip">{s}<button onClick={() => setSyms(syms.filter((x) => x !== s))} aria-label={`Remove ${s}`}>×</button></span>)}
          {syms.length < MAX && <form onSubmit={(e) => { e.preventDefault(); add(); }}><input value={draft} onChange={(e) => setDraft(e.target.value.toUpperCase())} placeholder="Add a ticker" aria-label="Add a ticker" maxLength={10} /></form>}
          <span className="small muted">{syms.length}/{MAX}</span>
        </div>

        <div className="calm-lock">
          <label className="small" htmlFor="calm-until">Cooling-off timer: no checking before</label>
          <select id="calm-until" value={lock && lock.day === now.day ? lock.until : ''} onChange={(e) => setUntil(e.target.value)}>
            <option value="">Off</option>
            {LOCKS.map((t) => <option key={t} value={t}>{t12(t)}</option>)}
          </select>
          <span className="small muted">{lockedNow ? `Today’s prices are locked until ${t12(lock!.until)} ET. It resets tomorrow.` : 'Set it for today and the sheet hides today’s prices until then.'}</span>
        </div>

        <div className="calm-sheet">
          <table>
            <thead>
              <tr><th rowSpan={2}>Date</th>{syms.map((s) => <th key={s} colSpan={2}>{s}</th>)}</tr>
              <tr>{syms.map((s) => <><th key={`${s}o`} className="sub">9:30 open</th><th key={`${s}c`} className="sub">4:00 close</th></>)}</tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d} className={d === now.day ? 'today' : ''}>
                  <td className="dt">{dateLabel(d)}{d === now.day ? ' · today' : ''}</td>
                  {syms.map((s) => { const c = cell(s, d); return <><td key={`${s}o`} className="num">{c.open == null ? <span className="muted">{c.locked ? 'locked' : c.wait ? 'not yet' : '—'}</span> : p2(c.open)}</td><td key={`${s}c`} className="num">{c.close == null ? <span className="muted">{c.locked ? 'locked' : c.wait ? 'not yet' : '—'}</span> : p2(c.close)}</td></>; })}
                </tr>
              ))}
            </tbody>
          </table>
          {!days.length && <p className="muted calm-pad">{syms.some((s) => typeof data[s] === 'string') ? `Could not load prices: ${syms.map((s) => (typeof data[s] === 'string' ? `${s}: ${data[s]}` : '')).filter(Boolean).join('; ')}` : 'Loading the sheet…'}</p>}
        </div>

        <section className="calm-note" aria-label="Morning intention">
          <div className="sm-row"><h3>{afterClose ? 'Read back: what you wrote this morning' : 'Morning intention'}</h3><span className="small muted">{savedAt ? `✓ Saved ${new Date(savedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : '✓ Autosave on'}</span></div>
          {afterClose && note?.intent && <blockquote className="calm-read">{note.intent}</blockquote>}
          {afterClose && !note?.intent && <p className="small muted">You did not write an intention this morning. Tomorrow, try two lines before 9:30.</p>}
          {!afterClose || !note?.intent ? null : <p className="small muted">Did you do what you said? Not what the price did.</p>}
          <textarea value={note?.intent ?? ''} onChange={(e) => writeNote({ intent: e.target.value })} rows={4} maxLength={1500} aria-label="Morning intention"
            placeholder={'Before the open, in your own words:\n• What is my plan today?\n• What would make me change it?\n• What will I not do?'} />
          {afterClose && (<>
            <h4>Closing thought</h4>
            <textarea value={note?.close ?? ''} onChange={(e) => writeNote({ close: e.target.value })} rows={3} maxLength={1500} aria-label="Closing thought" placeholder="How did I do against my plan, not against the price? One thing to keep, one to change." />
          </>)}
          {past.length > 0 && (
            <details className="calm-past"><summary>Earlier notes ({past.length})</summary>
              {past.map(([d, n]) => <div key={d} className="calm-prev"><b className="small">{dateLabel(d)}</b>{n.intent && <p>{n.intent}</p>}{n.close && <p className="muted">Closing: {n.close}</p>}</div>)}
            </details>
          )}
        </section>

        <aside className="calm-q" aria-label="A question to sit with">
          <span className="small muted">A question to sit with</span>
          <p>{QUESTIONS[qi]}</p>
          <button className="btn sm" onClick={() => setQi((qi + 1) % QUESTIONS.length)}>Another question</button>
        </aside>
      </div>

      {leaving && (
        <div className="calm-leave" role="alertdialog" aria-label="Leave Calm mode">
          <div className="calm-box">
            <h3>Before you leave Calm mode</h3>
            <ul><li>What am I hoping to find out?</li><li>Can it wait until the next check at {nextCheck(now.mins).split(',')[0]}?</li><li>Has my plan changed, or only the price?</li>{lockedNow && <li>You set “no checking before {t12(lock!.until)}”. Is this worth breaking it?</li>}</ul>
            <div className="calm-btns"><button className="btn primary" onClick={() => setLeaving(false)}>Stay calm</button><button className="btn" onClick={onExit}>Leave anyway</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
