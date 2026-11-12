// Journal → Calendar: every trade on the day it closed (an open option on its expiration day, open shares on the day they
// were opened), or switch to the day each was opened. Click a day for its trades, totals and your own note for that day
// (plan, mood, what you saw, whether you followed your rules). Notes stay in this browser with the rest of the journal.
import { useMemo, useState } from 'react';
import type { TradeView } from '../lib/journal';
import { etDay } from '../lib/journal';
import { usePersisted } from '../lib/store';
import { sUsd } from '../lib/format';

export interface DayNote { text: string; tags: string[]; mood?: string; followed?: 'yes' | 'no' | 'partly'; updated: number }
const MOODS = ['calm', 'confident', 'fomo', 'revenge', 'anxious', 'bored', 'tired'];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const desc = (v: TradeView) => v.t.opt ? `${v.t.opt.strike}${v.t.opt.type === 'call' ? 'C' : 'P'} ${v.t.opt.expiry.slice(5)}` : `${v.t.side} shares`;

/** Which calendar day a trade belongs to. */
export function tradeDay(v: TradeView, by: 'close' | 'open'): string | null {
  if (by === 'open') return v.openedAt != null ? etDay(v.openedAt) : null;
  if (v.status === 'closed' && v.closedAt != null) return etDay(v.closedAt);
  if (v.status === 'open') return v.t.opt?.expiry ?? (v.openedAt != null ? etDay(v.openedAt) : null);
  return null;
}

export function JournalCalendar({ views, onSelect }: { views: TradeView[]; onSelect: (s: string) => void }) {
  const live = views.filter((v) => !v.t.deleted && v.status !== 'planned');
  const [by, setBy] = useState<'close' | 'open'>('close');
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const today = etDay(Date.now());
  const [sel, setSel] = useState<string>(today);
  const [notes, setNotes] = usePersisted<Record<string, DayNote>>('journalDayNotes', {});
  const byDay = useMemo(() => {
    const m = new Map<string, TradeView[]>();
    for (const v of live) { const d = tradeDay(v, by); if (d) m.set(d, [...(m.get(d) ?? []), v]); }
    return m;
  }, [live, by]);
  const dayStats = (d: string) => {
    const vs = byDay.get(d) ?? [], closed = vs.filter((v) => v.status === 'closed');
    const pnl = closed.reduce((a, v) => a + v.realized, 0), r = closed.reduce((a, v) => a + (v.r ?? 0), 0);
    return { vs, closed, open: vs.filter((v) => v.status === 'open'), pnl, r, wins: closed.filter((v) => v.realized > 0).length, losses: closed.filter((v) => v.realized < 0).length, fees: closed.reduce((a, v) => a + v.fees, 0) };
  };

  // weeks of the month, Monday to Friday, plus a week total
  const first = new Date(ym.y, ym.m, 1), last = new Date(ym.y, ym.m + 1, 0);
  const start = new Date(first); start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const weeks: Date[][] = [];
  for (const d = new Date(start); d <= last; ) { const w: Date[] = []; for (let i = 0; i < 7; i++, d.setDate(d.getDate() + 1)) if (d.getDay() > 0 && d.getDay() < 6) w.push(new Date(d)); weeks.push(w); }
  const inMonth = weeks.flat().filter((d) => d.getMonth() === ym.m).map(ymd);
  const month = inMonth.map(dayStats);
  const mPnl = month.reduce((a, s) => a + s.pnl, 0), mW = month.reduce((a, s) => a + s.wins, 0), mL = month.reduce((a, s) => a + s.losses, 0);
  const traded = inMonth.map((d, i) => ({ d, s: month[i] })).filter((x) => x.s.closed.length);
  const best = traded.reduce<{ d: string; p: number } | null>((b, x) => (!b || x.s.pnl > b.p ? { d: x.d, p: x.s.pnl } : b), null);
  const worst = traded.reduce<{ d: string; p: number } | null>((b, x) => (!b || x.s.pnl < b.p ? { d: x.d, p: x.s.pnl } : b), null);
  const noted = inMonth.filter((d) => notes[d]?.followed);
  const followedPnl = (f: string) => inMonth.filter((d) => notes[d]?.followed === f).reduce((a, d) => a + dayStats(d).pnl, 0);

  const s = dayStats(sel), note = notes[sel];
  const setNote = (p: Partial<DayNote>) => setNotes((n) => {
    const cur = n[sel] ?? { text: '', tags: [], updated: 0 };
    const next = { ...cur, ...p, updated: Date.now() };
    const empty = !next.text.trim() && !next.tags.length && !next.mood && !next.followed;
    const out = { ...n }; if (empty) delete out[sel]; else out[sel] = next;
    return out;
  });
  const move = (k: number) => setYm(({ y, m }) => { const n = m + k; return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 }; });

  return (
    <div className="jc">
      <div className="jc-main">
        <div className="jc-head">
          <button className="btn sm" onClick={() => move(-1)} aria-label="Previous month">‹</button>
          <b className="jc-month">{first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b>
          <button className="btn sm" onClick={() => move(1)} aria-label="Next month">›</button>
          <button className="btn sm" onClick={() => { setYm({ y: now.getFullYear(), m: now.getMonth() }); setSel(today); }}>Today</button>
          <span className="chips jc-by">
            <button className={`chip sm ${by === 'close' ? 'on' : ''}`} onClick={() => setBy('close')} title="Each trade on the day it closed; open options on their expiration day">By close / expiry</button>
            <button className={`chip sm ${by === 'open' ? 'on' : ''}`} onClick={() => setBy('open')} title="Each trade on the day it was opened">By open day</button>
          </span>
        </div>
        <div className="jc-sum small">
          <span>Month <b className={`num ${mPnl > 0 ? 'up' : mPnl < 0 ? 'down' : ''}`}>{sUsd(mPnl)}</b></span>
          <span>Win rate <b className="num">{mW + mL ? `${Math.round((mW / (mW + mL)) * 100)}%` : '–'}</b> <span className="muted">({mW}W {mL}L)</span></span>
          {best && best.p > 0 && <span>Best day <b className="num up">{best.d.slice(5)} {sUsd(best.p)}</b></span>}
          {worst && worst.p < 0 && <span>Worst day <b className="num down">{worst.d.slice(5)} {sUsd(worst.p)}</b></span>}
          {noted.length >= 3 && <span title="Days you marked whether you followed your plan">Followed plan <b className="num">{sUsd(followedPnl('yes'))}</b> vs didn't <b className="num">{sUsd(followedPnl('no'))}</b></span>}
        </div>
        <div className="jc-grid" role="grid" aria-label="Trading calendar">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => <div key={d} className="jc-dow">{d}</div>)}<div className="jc-dow jc-wkh">Week</div>
          {weeks.map((w, i) => {
            const wk = w.reduce((a, d) => a + dayStats(ymd(d)).pnl, 0), any = w.some((d) => dayStats(ymd(d)).closed.length);
            return [
              ...w.map((d) => {
                const k = ymd(d), x = dayStats(k), n = notes[k];
                return (
                  <button key={k} className={`jc-day ${d.getMonth() !== ym.m ? 'out' : ''} ${k === today ? 'today' : ''} ${k === sel ? 'sel' : ''} ${x.closed.length ? (x.pnl > 0 ? 'up' : x.pnl < 0 ? 'down' : '') : ''}`} onClick={() => setSel(k)} aria-label={k}>
                    <span className="jc-d">{d.getDate()}</span>
                    {x.closed.length > 0 && <span className={`num jc-p ${x.pnl > 0 ? 'up' : x.pnl < 0 ? 'down' : ''}`}>{sUsd(x.pnl)}</span>}
                    <span className="jc-m">{x.closed.length > 0 && <span>{x.closed.length} closed</span>}{x.open.length > 0 && <span title="Open options expiring this day">⏳{x.open.length}</span>}{n?.text && <span title={n.text.slice(0, 80)}>✎</span>}{n?.followed && <span title="Followed plan?">{n.followed === 'yes' ? '✓' : n.followed === 'no' ? '✗' : '~'}</span>}</span>
                  </button>
                );
              }),
              <div key={`wk${i}`} className={`num jc-wk ${wk > 0 ? 'up' : wk < 0 ? 'down' : ''}`}>{any ? sUsd(wk) : ''}</div>,
            ];
          })}
        </div>
        <p className="note">✎ note · ⏳ open option expiring · ✓ / ✗ / ~ followed your plan. Notes stay in this browser with your journal.</p>
      </div>
      <aside className="jc-side">
        <b>{new Date(`${sel}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</b>
        {s.vs.length > 0 ? (
          <div className="jc-list">
            {s.vs.map((v) => (
              <div key={v.t.id} className="jc-row">
                <button className="wl-sym" onClick={() => onSelect(v.t.sym)}>{v.t.sym}</button>
                <span className="small muted">{desc(v)}</span>
                <span className={`num small ${v.status === 'open' ? 'muted' : v.realized > 0 ? 'up' : v.realized < 0 ? 'down' : ''}`}>{v.status === 'open' ? (by === 'close' ? 'expires' : 'open') : `${sUsd(v.realized)}${v.r != null ? ` · ${v.r.toFixed(1)}R` : ''}`}</span>
              </div>
            ))}
            {s.closed.length > 0 && <div className="jc-row jc-tot small"><span>Day</span><span className="muted">{s.wins}W {s.losses}L{s.fees ? ` · fees ${sUsd(-s.fees)}` : ''}</span><b className={`num ${s.pnl > 0 ? 'up' : s.pnl < 0 ? 'down' : ''}`}>{sUsd(s.pnl)}{s.r ? ` · ${s.r.toFixed(1)}R` : ''}</b></div>}
          </div>
        ) : <p className="small muted">No trades on this day.</p>}
        <label className="small">Your note<textarea value={note?.text ?? ''} onChange={(e) => setNote({ text: e.target.value })} rows={6} placeholder="Plan for the day, what you saw, how you felt, what you'd do differently…" /></label>
        <div className="jc-opts small">
          <label>Mood<select value={note?.mood ?? ''} onChange={(e) => setNote({ mood: e.target.value || undefined })}><option value="">–</option>{MOODS.map((m) => <option key={m}>{m}</option>)}</select></label>
          <label>Followed my plan?<select value={note?.followed ?? ''} onChange={(e) => setNote({ followed: (e.target.value || undefined) as DayNote['followed'] })}><option value="">–</option><option value="yes">yes</option><option value="partly">partly</option><option value="no">no</option></select></label>
        </div>
        <label className="small">Tags<input value={(note?.tags ?? []).join(', ')} onChange={(e) => setNote({ tags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="FOMC, chased, A+ setup" /></label>
        {note?.updated ? <span className="small muted">Saved {new Date(note.updated).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span> : null}
      </aside>
    </div>
  );
}
