// Calendars → Month: a bright month grid with every earnings report, economic release, Fed meeting, IPO and market
// holiday in its day tile. Colors by kind (earnings mint, economy sky, Fed gold, IPO violet, holiday coral), your own
// tickers starred and sorted first, company logos on earnings, today glowing. Click a company for its peek, any other
// event for what it is and why it matters, or a day for everything on it.
import { useEffect, useMemo, useState } from 'react';
import type { EarnItem, IpoItem } from '../../shared/eventsCal';
import type { EconEvent } from '../data/news';
import { FOMC } from '../../shared/calendar';
import { NYSE_HOLIDAYS } from '../../shared/marketCalendar';
import { usePersisted } from '../lib/store';
import { openPeek } from './CompanyPeek';
import { openExplain } from './InfoDrawer';
import { Fresh } from './common';

type Kind = 'earn' | 'econ' | 'fed' | 'ipo' | 'hol';
interface Ev { kind: Kind; key: string; label: string; sub?: string; sym?: string; mine?: boolean; big?: boolean; time?: string; rank: number; run: () => void }
const KINDS: { k: Kind; label: string }[] = [{ k: 'earn', label: 'Earnings' }, { k: 'econ', label: 'Economy' }, { k: 'fed', label: 'Fed' }, { k: 'ipo', label: 'IPOs' }, { k: 'hol', label: 'Holidays' }];
const WHEN: Record<string, string> = { bmo: 'before open', amc: 'after close', dmh: 'during market' };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const cap = (v: number | null) => (v == null ? '' : v >= 1e12 ? `$${(v / 1e12).toFixed(1)}T` : v >= 1e9 ? `$${(v / 1e9).toFixed(0)}B` : `$${(v / 1e6).toFixed(0)}M`);

interface MonthData { earnings: EarnItem[]; ipos: IpoItem[]; asOf: number; from: string; to: string; source: string }
function useMonthEvents(live: boolean, mine: string[]) {
  const [d, setD] = useState<MonthData | null>(null), [err, setErr] = useState('');
  const key = mine.slice(0, 40).join(',');
  useEffect(() => {
    if (!live) return;
    let off = false;
    fetch(`/api/research?fn=eventcal&span=month&symbols=${encodeURIComponent(key)}`).then((r) => r.json()).then((j) => { if (off) return; if (j.error) setErr(j.error); else setD({ earnings: j.earnings ?? [], ipos: j.ipos ?? [], asOf: j.asOf, from: j.from, to: j.to, source: j.sources?.earnings ?? '' }); }).catch((e) => !off && setErr(String(e.message ?? e)));
    return () => { off = true; };
  }, [live, key]);
  return { d, err };
}

export function MonthCalendar({ live, econ, mySyms }: { live: boolean; econ: EconEvent[] | null; mySyms: Set<string> }) {
  const now = new Date(), today = ymd(now);
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [on, setOn] = usePersisted<Record<Kind, boolean>>('mcalKinds', { earn: true, econ: true, fed: true, ipo: true, hol: true });
  const [mineOnly, setMineOnly] = usePersisted('mcalMine', false);
  const [day, setDay] = useState<string | null>(null);
  const { d, err } = useMonthEvents(live, [...mySyms]);

  const byDay = useMemo(() => {
    const m = new Map<string, Ev[]>(), add = (k: string, e: Ev) => m.set(k, [...(m.get(k) ?? []), e]);
    for (const e of d?.earnings ?? []) {
      const mine = mySyms.has(e.sym); if (mineOnly && !mine) continue;
      add(e.date, { kind: 'earn', key: `e:${e.sym}`, label: e.sym, sym: e.sym, mine, big: (e.mcap ?? 0) >= 1e11, time: WHEN[e.when] ?? '', sub: `${e.name}${e.epsEst != null ? ` · EPS est $${e.epsEst.toFixed(2)}` : ''}${e.mcap ? ` · ${cap(e.mcap)}` : ''}`, rank: (mine ? 3e12 : 0) + (e.mcap ?? 0), run: () => openPeek(e.sym) });
    }
    if (!mineOnly) {
      for (const x of econ ?? []) add(x.date, { kind: 'econ', key: `c:${x.key}:${x.date}`, label: x.label, time: x.time, big: x.impact >= 3, rank: 4e12 + x.impact, run: () => openExplain({ kind: 'Economic release', title: x.label, sub: `${x.date}${x.time ? ` · ${x.time} ET` : ''} · impact ${'●'.repeat(x.impact)}`, what: x.note, lines: x.usual ? [`How SPY usually moves that day: ${JSON.stringify(x.usual).slice(0, 160)}`] : [], src: 'FRED release calendar' }) });
      for (const f of FOMC) add(f.date, { kind: 'fed', key: `f:${f.date}`, label: `FOMC${f.sep ? ' + dots' : ''}`, time: '2:00 pm', big: true, rank: 5e12, run: () => openExplain({ kind: 'Fed meeting', title: `FOMC decision${f.sep ? ' with projections (dot plot)' : ''}`, sub: `${f.date} · statement 2:00 pm ET, press conference 2:30 pm${f.tentative ? ' · tentative date' : ''}`, what: 'The Federal Reserve announces its interest-rate decision. Stocks, bonds and the dollar often move sharply at 2:00 pm and again during the press conference.', src: 'Federal Reserve meeting calendar' }) });
      for (const i of d?.ipos ?? []) if (i.date) add(i.date, { kind: 'ipo', key: `i:${i.key}`, label: i.sym || i.name.slice(0, 10), sym: i.sym || undefined, sub: `${i.name} · ${i.status}${i.price ? ` · ${i.price}` : ''}${i.exchange ? ` · ${i.exchange}` : ''}`, rank: 1e12, run: () => openExplain({ kind: 'IPO', title: i.name, sym: i.sym || undefined, sub: `${i.date} · ${i.status}`, lines: [i.price && `Price range: ${i.price}`, i.exchange && `Exchange: ${i.exchange}`, i.shares && `Shares: ${i.shares.toLocaleString()}`, i.amount && `Deal size: ${cap(i.amount)}`].filter(Boolean) as string[], src: 'Nasdaq IPO calendar (unofficial) + Finnhub' }) });
      for (const [h, name] of Object.entries(NYSE_HOLIDAYS)) add(h, { kind: 'hol', key: `h:${h}`, label: name, rank: 6e12, run: () => openExplain({ kind: 'Market holiday', title: name, sub: `${h} · US stock market closed`, what: 'NYSE and Nasdaq are closed. Futures and some bond markets can have shortened hours.' }) });
    }
    for (const [k, xs] of m) m.set(k, xs.filter((e) => on[e.kind]).sort((a, b) => b.rank - a.rank));
    return m;
  }, [d, econ, mySyms, mineOnly, on]);

  const first = new Date(ym.y, ym.m, 1), last = new Date(ym.y, ym.m + 1, 0);
  const start = new Date(first); start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const cells: Date[] = []; for (const x = new Date(start); x <= last || cells.length % 5; x.setDate(x.getDate() + 1)) if (x.getDay() > 0 && x.getDay() < 6) cells.push(new Date(x));
  const move = (k: number) => setYm(({ y, m }) => { const n = m + k; return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 }; });
  const covered = (k: string) => !d || (k >= d.from && k <= d.to);
  const sel = day ? byDay.get(day) ?? [] : [];

  return (
    <div className="mcal">
      <div className="mcal-head">
        <button className="btn sm" onClick={() => move(-1)} aria-label="Previous month">‹</button>
        <b className="mcal-month">{first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b>
        <button className="btn sm" onClick={() => move(1)} aria-label="Next month">›</button>
        <button className="btn sm" onClick={() => setYm({ y: now.getFullYear(), m: now.getMonth() })}>Today</button>
        <span className="mcal-legend">{KINDS.map((x) => <button key={x.k} className={`mcal-key k-${x.k} ${on[x.k] ? 'on' : ''}`} onClick={() => setOn({ ...on, [x.k]: !on[x.k] })} aria-pressed={on[x.k]}>{x.label}</button>)}
          <button className={`mcal-key k-mine ${mineOnly ? 'on' : ''}`} onClick={() => setMineOnly(!mineOnly)} aria-pressed={mineOnly}>★ My tickers only</button></span>
        {d && <Fresh kind="delayed" at={d.asOf} src={`${d.source}. Economic dates: FRED release calendar. Fed: Federal Reserve schedule. Earnings dates can move; companies confirm them a few weeks ahead.`} />}
      </div>
      {err && <p className="small down">{err}</p>}
      {!live && <p className="small muted">Live data only: Fed meetings and holidays still show.</p>}
      <div className="mcal-grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((x) => <div key={x} className="mcal-dow">{x}</div>)}
        {cells.map((c) => {
          const k = ymd(c), evs = byDay.get(k) ?? [], out = c.getMonth() !== ym.m, hol = evs.find((e) => e.kind === 'hol');
          const shown = evs.filter((e) => e.kind !== 'hol').slice(0, 6), more = evs.filter((e) => e.kind !== 'hol').length - shown.length;
          return (
            <div key={k} className={`mcal-day ${out ? 'out' : ''} ${k === today ? 'today' : ''} ${k < today ? 'past' : ''} ${hol ? 'hol' : ''} ${day === k ? 'sel' : ''}`} onClick={() => setDay(day === k ? null : k)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setDay(k); }}>
              <div className="mcal-dn"><span>{c.getDate()}</span>{hol && <span className="mcal-hol" title={hol.label}>closed</span>}{!covered(k) && !out && live && <span className="mcal-nc" title="Outside the loaded window (about a week back to five weeks ahead): earnings and IPOs not loaded for this day">·</span>}</div>
              <div className="mcal-evs">
                {shown.map((e) => <button key={e.key} className={`mcal-ev k-${e.kind} ${e.mine ? 'mine' : ''} ${e.big ? 'big' : ''}`} data-sym={e.kind === 'earn' ? e.sym : undefined} title={`${e.label}${e.time ? ` · ${e.time}` : ''}${e.sub ? ` · ${e.sub}` : ''}`} onClick={(ev) => { ev.stopPropagation(); e.run(); }}>{e.mine && '★ '}{e.label}{e.kind !== 'earn' && e.time ? <span className="mcal-t"> {e.time}</span> : null}</button>)}
                {more > 0 && <span className="mcal-more">+{more} more</span>}
              </div>
            </div>
          );
        })}
      </div>
      {day && <div className="mcal-dayview">
        <div className="mcal-dvh"><b>{new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</b><span className="small muted">{sel.length} event{sel.length === 1 ? '' : 's'}</span><button className="icon-btn" onClick={() => setDay(null)} aria-label="Close day">×</button></div>
        {!sel.length ? <p className="small muted">Nothing on this day{!covered(day) ? ' (outside the loaded window)' : ''}.</p> :
          <div className="mcal-list">{sel.map((e) => <button key={e.key} className={`mcal-row k-${e.kind}`} onClick={e.run}><span className={`mcal-dot k-${e.kind}`} /><b data-sym={e.kind === 'earn' ? e.sym : undefined} className={e.kind === 'earn' ? 'mcal-sym' : ''}>{e.mine ? '★ ' : ''}{e.label}</b><span className="small muted">{[e.time, e.sub].filter(Boolean).join(' · ')}</span></button>)}</div>}
      </div>}
    </div>
  );
}
