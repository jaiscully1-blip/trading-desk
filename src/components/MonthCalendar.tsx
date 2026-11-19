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
import { historyLines, specialDays } from '../lib/specialDays';
import { pastReactions } from '../../shared/earnmove';
import type { TradeView } from '../lib/journal';
import { eventDayPnl } from '../lib/eventDayPnl';
import { sUsd } from '../lib/format';
import { alertTime, toggleEventAlert, useEventAlerts } from '../lib/eventAlerts';
import { addResearch } from '../lib/research';
import type { EventStat } from '../../shared/eventDays';

type Kind = 'earn' | 'econ' | 'fed' | 'ipo' | 'hol' | 'day';
interface Ev { kind: Kind; key: string; label: string; sub?: string; sym?: string; mine?: boolean; big?: boolean; time?: string; move?: number; result?: 'beat' | 'miss'; rank: number; run: () => void }
const KINDS: { k: Kind; label: string }[] = [{ k: 'earn', label: 'Earnings' }, { k: 'econ', label: 'Economy' }, { k: 'fed', label: 'Fed' }, { k: 'ipo', label: 'IPOs' }, { k: 'hol', label: 'Holidays' }, { k: 'day', label: 'Special days' }];
const WHEN: Record<string, string> = { bmo: 'before open', amc: 'after close', dmh: 'during market' };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const cap = (v: number | null) => (v == null ? '' : v >= 1e12 ? `$${(v / 1e12).toFixed(1)}T` : v >= 1e9 ? `$${(v / 1e9).toFixed(0)}B` : `$${(v / 1e6).toFixed(0)}M`);

/** How market-moving a day looks: Fed and top-tier releases weigh most, then big and your own reports, measured special
 *  days a little. 0 = quiet; about 10+ = a heavy day. */
export function heatOf(evs: Ev[]): number {
  let h = 0;
  for (const e of evs) h += e.kind === 'fed' ? 6 : e.kind === 'econ' ? (e.big ? 4 : 1.5) : e.kind === 'earn' ? (e.mine ? 2 : 0) + (e.big ? 1.5 : 0.08) : e.kind === 'day' ? (e.big ? 1 : 0.2) : e.kind === 'ipo' ? 0.3 : 0;
  return h;
}
/** Which part of the day an event belongs to, for the week view. */
const slotOf = (e: Ev): 'pre' | 'mid' | 'post' | 'all' => {
  const t = (e.time ?? '').toLowerCase();
  if (e.kind === 'fed') return 'mid';
  if (/before open/.test(t)) return 'pre'; if (/after close/.test(t)) return 'post'; if (/during market/.test(t)) return 'mid';
  const x = /(\d{1,2}):(\d{2})/.exec(t); if (x) { const h = +x[1] + (/pm/.test(t) && +x[1] < 12 ? 12 : 0); return h < 9 || (h === 9 && +x[2] < 30) ? 'pre' : h >= 16 ? 'post' : 'mid'; }
  return 'all';
};
/** A past day: how SPY and QQQ closed, and which reports beat or missed. */
function DayReplay({ day, evs }: { day: string; evs: Ev[] }) {
  const [m, setM] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    let off = false;
    Promise.all(['SPY', 'QQQ'].map((s) => fetch(`/api/research?fn=bars&symbol=${s}&tf=1d`).then((r) => r.json()).then((j) => {
      const bars: { time: number; close: number }[] = j.bars ?? [], i = bars.findIndex((b) => new Date(b.time * 1000).toISOString().slice(0, 10) === day);
      return [s, i > 0 ? (bars[i].close / bars[i - 1].close - 1) * 100 : NaN] as const;
    }))).then((xs) => { if (!off) setM(Object.fromEntries(xs)); }).catch(() => {});
    return () => { off = true; };
  }, [day]);
  const beats = evs.filter((e) => e.result === 'beat').length, misses = evs.filter((e) => e.result === 'miss').length;
  return (
    <div className="mcal-replay">
      <span className="small muted">That day:</span>
      {m ? ['SPY', 'QQQ'].map((s) => Number.isFinite(m[s]) ? <b key={s} className={`num ${m[s] >= 0 ? 'up' : 'dn'}`}>{s} {m[s] >= 0 ? '+' : ''}{m[s].toFixed(2)}%</b> : <span key={s} className="small muted">{s} n/a</span>) : <span className="small muted">loading…</span>}
      {(beats + misses) > 0 && <span className="small">{beats} beat · {misses} missed estimates</span>}
    </div>
  );
}

function Bell({ e, day }: { e: Ev; day: string }) {
  const alerts = useEventAlerts(), on = alerts.some((a) => a.id === `${day}:${e.key}`), at = alertTime(day, e.kind === 'fed' ? '2:00 pm' : e.time ?? '');
  if (at < Date.now()) return null;
  return <button className={`mcal-bell ${on ? 'on' : ''}`} title={on ? 'Alert set: the desk pings you 10 minutes before. Click to remove.' : 'Ping me 10 minutes before'} aria-pressed={on} onClick={(ev) => { ev.stopPropagation(); toggleEventAlert({ id: `${day}:${e.key}`, label: `${e.label}${e.time ? ` (${e.time})` : ''}`, sym: e.sym, at, when: day }); }}>{on ? '🔔' : '🔕'}</button>;
}

const until = (k: string) => { const ms = Date.parse(`${k}T09:30:00-05:00`) - Date.now(); if (ms <= 0) return 'today'; const d = Math.floor(ms / 86400_000), h = Math.floor((ms % 86400_000) / 3600_000); return d ? `in ${d}d ${h}h` : `in ${h}h`; };

/** Click on an earnings pill: what options price in, and how the stock reacted the last 8 times. */
async function earningsCard(e: EarnItem, move?: number) {
  const base = { kind: 'Earnings', title: `${e.sym} reports ${WHEN[e.when] ?? ''}`.trim(), sym: e.sym, sub: `${e.name} · ${e.date}${e.epsEst != null ? ` · EPS estimate $${e.epsEst.toFixed(2)}` : ''}`, src: 'Expected move: Cboe delayed options (at-the-money straddle). Past reactions: SEC 8-K earnings releases + Yahoo daily closes.', actions: [{ label: `Open ${e.sym} peek`, run: () => openPeek(e.sym) }] };
  const head = move != null ? [`Options price in about ±${move.toFixed(1)}% for the reaction day.`] : [];
  openExplain({ ...base, lines: [...head, 'Loading past reactions…'] });
  try {
    const j = await fetch(`/api/research?fn=qlevents&symbol=${encodeURIComponent(e.sym)}`).then((r) => r.json());
    const rs = pastReactions(j.stock ?? [], j.earnings ?? [], 8);
    if (!rs.length) { openExplain({ ...base, lines: [...head, 'No past reactions found.'] }); return; }
    const avg = rs.reduce((a, r) => a + Math.abs(r.move), 0) / rs.length, beat = move != null ? rs.filter((r) => Math.abs(r.move) > move).length : null;
    openExplain({ ...base, what: `Last ${rs.length} reports: the stock moved ${avg.toFixed(1)}% on average (either way)${move != null ? `, vs about ±${move.toFixed(1)}% priced in now; it moved more than that ${beat} of ${rs.length} times` : ''}.`,
      lines: [...head, ...rs.map((r) => `${r.date}: ${r.move >= 0 ? '+' : ''}${r.move.toFixed(1)}% on ${r.day}${r.drift5 != null ? `, then ${r.drift5 >= 0 ? '+' : ''}${r.drift5.toFixed(1)}% over the next 5 days` : ''}`)] });
  } catch { openExplain({ ...base, lines: [...head, 'Past reactions unavailable right now.'] }); }
}

interface MonthData { earnings: EarnItem[]; ipos: IpoItem[]; asOf: number; from: string; to: string; source: string; totals: Record<string, number> }
function useMonthEvents(live: boolean, mine: string[]) {
  const [d, setD] = useState<MonthData | null>(null), [err, setErr] = useState('');
  const key = mine.slice(0, 40).join(',');
  useEffect(() => {
    if (!live) return;
    let off = false;
    fetch(`/api/research?fn=eventcal&span=month&symbols=${encodeURIComponent(key)}`).then((r) => r.json()).then((j) => { if (off) return; if (j.error) setErr(j.error); else setD({ earnings: j.earnings ?? [], ipos: j.ipos ?? [], asOf: j.asOf, from: j.from, to: j.to, source: j.sources?.earnings ?? '', totals: j.totals ?? {} }); }).catch((e) => !off && setErr(String(e.message ?? e)));
    return () => { off = true; };
  }, [live, key]);
  return { d, err };
}

export function MonthCalendar({ live, econ, mySyms, trades = [], onWatch }: { live: boolean; econ: EconEvent[] | null; mySyms: Set<string>; trades?: TradeView[]; onWatch?: (sym: string) => void }) {
  // your realized P&L per day (ET), from the journal
  const dayPnl = useMemo(() => { const m = new Map<string, number>(); for (const v of trades) { if (v.t.deleted || v.status !== 'closed' || v.closedAt == null) continue; const k = new Date(v.closedAt).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); m.set(k, (m.get(k) ?? 0) + v.realized); } return m; }, [trades]);
  const pnlMax = useMemo(() => Math.max(1, ...[...dayPnl.values()].map(Math.abs)), [dayPnl]);
  const groups = useMemo(() => eventDayPnl(dayPnl), [dayPnl]);
  const now = new Date(), today = ymd(now);
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [on0, setOn] = usePersisted<Record<Kind, boolean>>('mcalKinds', { earn: true, econ: true, fed: true, ipo: true, hol: true, day: true });
  const on = { ...on0, day: on0.day ?? true } as Record<Kind, boolean>;
  // measured history of each day type (S&P 500 since 1928, SPY since 1993), built daily by the day-cases job
  const [stats, setStats] = useState<Record<string, EventStat[]> | null>(null);
  useEffect(() => { fetch('/api/research?fn=daycases').then((r) => r.json()).then((j) => setStats(j.file?.stats ?? null)).catch(() => {}); }, []);
  const [mineOnly, setMineOnly] = usePersisted('mcalMine', false);
  const [day, setDay] = useState<string | null>(null);
  const { d, err } = useMonthEvents(live, [...mySyms]);
  const [moves, setMoves] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!d) return;
    const soon = d.earnings.filter((e) => e.date >= today && e.date <= ymd(new Date(Date.now() + 14 * 86400_000))).sort((a, b) => Number(mySyms.has(b.sym)) - Number(mySyms.has(a.sym)) || (b.mcap ?? 0) - (a.mcap ?? 0)).slice(0, 12);
    if (!soon.length) return;
    fetch(`/api/research?fn=qlimpmove&items=${encodeURIComponent(soon.map((e) => `${e.sym}:${e.date}:${e.when}`).join(','))}`).then((r) => r.json()).then((j) => setMoves(Object.fromEntries((j.moves ?? []).filter((m: any) => m.pct > 0).map((m: any) => [m.sym, m.pct])))).catch(() => {});
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps

  const byDay = useMemo(() => {
    const m = new Map<string, Ev[]>(), add = (k: string, e: Ev) => m.set(k, [...(m.get(k) ?? []), e]);
    for (const e of d?.earnings ?? []) {
      const mine = mySyms.has(e.sym); if (mineOnly && !mine) continue;
      const mv = moves[e.sym];
      const result = e.epsAct != null && e.epsEst != null ? (e.epsAct >= e.epsEst ? 'beat' as const : 'miss' as const) : undefined;
      add(e.date, { kind: 'earn', key: `e:${e.sym}`, label: e.sym, sym: e.sym, mine, big: (e.mcap ?? 0) >= 1e11, move: mv, result, time: WHEN[e.when] ?? '', sub: `${e.name}${e.epsEst != null ? ` · EPS est $${e.epsEst.toFixed(2)}` : ''}${e.mcap ? ` · ${cap(e.mcap)}` : ''}${mv ? ` · options price ±${mv.toFixed(1)}%` : ''}`, rank: (mine ? 3e12 : 0) + (e.mcap ?? 0), run: () => void earningsCard(e, mv) });
    }
    if (!mineOnly) {
      for (const x of econ ?? []) add(x.date, { kind: 'econ', key: `c:${x.key}:${x.date}`, label: x.label, time: x.time, big: x.impact >= 3, rank: 4e12 + x.impact, run: () => openExplain({ kind: 'Economic release', title: x.label, sub: `${x.date}${x.time ? ` · ${x.time} ET` : ''} · impact ${'●'.repeat(x.impact)}`, what: x.note, lines: x.usual ? [`On the last ${x.usual.n} of these days SPY moved ${(x.usual.avgAbsMove * 100).toFixed(2)}% on average (either way), vs ${(x.usual.baseline * 100).toFixed(2)}% on a normal day, and closed up ${(x.usual.upPct * 100).toFixed(0)}% of the time.`] : [], src: 'FRED release calendar' }) });
      for (const f of FOMC) add(f.date, { kind: 'fed', key: `f:${f.date}`, label: `FOMC${f.sep ? ' + dots' : ''}`, time: '2:00 pm', big: true, rank: 5e12, run: () => openExplain({ kind: 'Fed meeting', title: `FOMC decision${f.sep ? ' with projections (dot plot)' : ''}`, sub: `${f.date} · statement 2:00 pm ET, press conference 2:30 pm${f.tentative ? ' · tentative date' : ''}`, what: 'The Federal Reserve announces its interest-rate decision. Stocks, bonds and the dollar often move sharply at 2:00 pm and again during the press conference.', src: 'Federal Reserve meeting calendar' }) });
      for (const i of d?.ipos ?? []) if (i.date) add(i.date, { kind: 'ipo', key: `i:${i.key}`, label: i.sym || i.name.slice(0, 10), sym: i.sym || undefined, sub: `${i.name} · ${i.status}${i.price ? ` · ${i.price}` : ''}${i.exchange ? ` · ${i.exchange}` : ''}`, rank: 1e12, run: () => openExplain({ kind: 'IPO', title: i.name, sym: i.sym || undefined, sub: `${i.date} · ${i.status}`, lines: [i.price && `Price range: ${i.price}`, i.exchange && `Exchange: ${i.exchange}`, i.shares && `Shares: ${i.shares.toLocaleString()}`, i.amount && `Deal size: ${cap(i.amount)}`].filter(Boolean) as string[], src: 'Nasdaq IPO calendar (unofficial) + Finnhub' }) });
      for (const [h, name] of Object.entries(NYSE_HOLIDAYS)) add(h, { kind: 'hol', key: `h:${h}`, label: name, rank: 6e12, run: () => openExplain({ kind: 'Market holiday', title: name, sub: `${h} · US stock market closed`, what: 'NYSE and Nasdaq are closed. Futures and some bond markets can have shortened hours.' }) });
    }
    if (!mineOnly) {
      const from = ymd(new Date(ym.y, ym.m - 1, 20)), to = ymd(new Date(ym.y, ym.m + 1, 10));
      for (const sd of specialDays(from, to)) {
        const h = historyLines(sd.kind, stats);
        add(sd.date, { kind: 'day', key: `d:${sd.kind}:${sd.date}`, label: sd.label.replace(/\s*\(.*?\)\s*/g, ' ').trim(), big: h.measured, sub: h.lines[0], rank: 2e12 + (h.measured ? 1 : 0), run: () => openExplain({ kind: sd.cat === 'religious' ? 'Religious holiday' : sd.cat === 'federal' ? 'Federal day (market open)' : 'Market day', title: sd.label, sub: `${sd.date}${sd.approx ? ' · approximate date' : ''}`, what: sd.note, lines: h.lines.length ? h.lines : ['History not loaded yet (built daily by the day-cases job).'], src: 'Calculated from daily closes: S&P 500 index (Yahoo, 1928 on, price only) and SPY / QQQ (dividend-adjusted). History, not a forecast.' }) });
      }
    }
    for (const [k, xs] of m) m.set(k, xs.filter((e) => on[e.kind]).sort((a, b) => b.rank - a.rank));
    return m;
  }, [d, econ, mySyms, mineOnly, on0, stats, ym.y, ym.m, moves]); // eslint-disable-line react-hooks/exhaustive-deps

  const [heatOn, setHeatOn] = usePersisted('mcalHeat', true);
  const [view, setView] = usePersisted<'month' | 'week'>('mcalView', 'month');
  const [wk, setWk] = useState(() => { const x = new Date(); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x); });
  const weekDays = useMemo(() => Array.from({ length: 5 }, (_, i) => ymd(new Date(Date.parse(`${wk}T12:00:00`) + i * 86400_000))), [wk]);
  const moveWeek = (k: number) => { const x = new Date(Date.parse(`${wk}T12:00:00`) + k * 7 * 86400_000); setWk(ymd(x)); setYm({ y: x.getFullYear(), m: x.getMonth() }); };
  const heat = useMemo(() => new Map([...byDay].map(([k, xs]) => [k, heatOf(xs)])), [byDay]);
  // your week: the next five trading days, your names plus the heaviest events
  const week = useMemo(() => {
    const out: { k: string; evs: Ev[] }[] = [];
    for (let x = new Date(); out.length < 5; x.setDate(x.getDate() + 1)) {
      const k = ymd(x); if (x.getDay() === 0 || x.getDay() === 6 || NYSE_HOLIDAYS[k]) continue;
      const xs = (byDay.get(k) ?? []).filter((e) => e.kind !== 'hol');
      out.push({ k, evs: [...xs.filter((e) => e.mine), ...xs.filter((e) => !e.mine && (e.kind === 'fed' || (e.kind === 'econ' && e.big) || (e.kind === 'earn' && e.big) || (e.kind === 'day' && e.big)))].slice(0, 4) });
    }
    return out;
  }, [byDay]);
  // earnings season meter: reports per week across the loaded window
  const season = useMemo(() => {
    const wk = new Map<string, number>();
    for (const [k, n] of Object.entries(d?.totals ?? {})) { const x = new Date(`${k}T12:00:00`); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); const w = ymd(x); wk.set(w, (wk.get(w) ?? 0) + n); }
    return [...wk].sort((a, b) => a[0].localeCompare(b[0]));
  }, [d]);
  const smax = Math.max(1, ...season.map((x) => x[1]));
  const first = new Date(ym.y, ym.m, 1), last = new Date(ym.y, ym.m + 1, 0);
  const start = new Date(first); start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const cells: Date[] = []; for (const x = new Date(start); x <= last || cells.length % 5; x.setDate(x.getDate() + 1)) if (x.getDay() > 0 && x.getDay() < 6) cells.push(new Date(x));
  const move = (k: number) => setYm(({ y, m }) => { const n = m + k; return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 }; });
  const covered = (k: string) => !d || (k >= d.from && k <= d.to);
  const sel = day ? byDay.get(day) ?? [] : [];

  return (
    <div className="mcal">
      <div className="mcal-head">
        <span className="chips">{(['month', 'week'] as const).map((v) => <button key={v} className={`chip sm ${view === v ? 'on' : ''}`} onClick={() => setView(v)}>{v === 'month' ? 'Month' : 'Week'}</button>)}</span>
        <button className="btn sm" onClick={() => (view === 'week' ? moveWeek(-1) : move(-1))} aria-label="Previous">‹</button>
        <b className="mcal-month">{view === 'week' ? `Week of ${new Date(`${wk}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b>
        <button className="btn sm" onClick={() => (view === 'week' ? moveWeek(1) : move(1))} aria-label="Next">›</button>
        <button className="btn sm" onClick={() => { setYm({ y: now.getFullYear(), m: now.getMonth() }); const x = new Date(); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); setWk(ymd(x)); }}>Today</button>
        <span className="mcal-legend">{KINDS.map((x) => <button key={x.k} className={`mcal-key k-${x.k} ${on[x.k] ? 'on' : ''}`} onClick={() => setOn({ ...on, [x.k]: !on[x.k] })} aria-pressed={on[x.k]}>{x.label}</button>)}
          <button className={`mcal-key k-mine ${mineOnly ? 'on' : ''}`} onClick={() => setMineOnly(!mineOnly)} aria-pressed={mineOnly}>★ My tickers only</button>
          <button className={`mcal-key k-heat ${heatOn ? 'on' : ''}`} onClick={() => setHeatOn(!heatOn)} aria-pressed={heatOn} title="Tiles glow brighter on market-moving days">Heat</button></span>
        {d && <Fresh kind="delayed" at={d.asOf} src={`${d.source}. Economic dates: FRED release calendar. Fed: Federal Reserve schedule. Earnings dates can move; companies confirm them a few weeks ahead.`} />}
      </div>
      <div className="mcal-top">
        <div className="mcal-week" aria-label="Your week">
          {week.map((w) => <div key={w.k} className={`mcal-wd ${heatOn ? '' : 'noheat'}`} style={{ ['--h' as string]: Math.min(1, (heat.get(w.k) ?? 0) / 12) }} onClick={() => setDay(w.k)}>
            <div className="mcal-wdh"><b>{new Date(`${w.k}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}</b><span className="small muted">{until(w.k)}</span></div>
            {w.evs.length ? w.evs.map((e) => <button key={e.key} className={`mcal-ev k-${e.kind} ${e.mine ? 'mine' : ''}`} data-sym={e.kind === 'earn' ? e.sym : undefined} onClick={(ev) => { ev.stopPropagation(); e.run(); }}>{e.mine && '★ '}{e.label}{e.move != null && <span className="mcal-mv">±{e.move.toFixed(1)}%</span>}</button>) : <span className="small muted">quiet</span>}
          </div>)}
        </div>
        {season.length > 1 && <div className="mcal-season" title="Earnings reports per week (Nasdaq calendar): the tall bars are earnings season">
          <span className="small muted">Earnings season</span>
          <div className="mcal-sbars">{season.map(([w, n]) => <i key={w} style={{ height: `${Math.max(6, (n / smax) * 100)}%` }} className={w <= today && today < ymd(new Date(Date.parse(`${w}T12:00:00`) + 7 * 86400_000)) ? 'now' : ''} title={`Week of ${w}: ${n} reports`} />)}</div>
        </div>}
      </div>
      {err && <p className="small down">{err}</p>}
      {!live && <p className="small muted">Live data only: Fed meetings and holidays still show.</p>}
      {view === 'week' && <div className="mcal-wk">
        {weekDays.map((k) => {
          const evs = byDay.get(k) ?? [], hol = evs.find((e) => e.kind === 'hol');
          return (
            <div key={k} className={`mcal-col ${k === today ? 'today' : ''} ${k < today ? 'past' : ''}`} style={heatOn ? { ['--h' as string]: Math.min(1, (heat.get(k) ?? 0) / 12) } : undefined}>
              <div className="mcal-colh"><b>{new Date(`${k}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric' })}</b>{dayPnl.has(k) && <span className={`mcal-pnl ${dayPnl.get(k)! >= 0 ? 'up' : 'dn'}`}>{sUsd(dayPnl.get(k)!)}</span>}{hol && <span className="mcal-hol">{hol.label} · closed</span>}</div>
              {([['all', 'All day · or time not set'], ['pre', '🌅 Before the open'], ['mid', '🏛 During the session'], ['post', '🌙 After the close']] as const).map(([slot, name]) => {
                const xs = evs.filter((e) => e.kind !== 'hol' && slotOf(e) === slot);
                return xs.length ? <div key={slot} className="mcal-slot"><span className="mcal-slotn">{name}</span>{xs.slice(0, 14).map((e) => (
                  <div key={e.key} className={`mcal-card k-${e.kind} ${e.mine ? 'mine' : ''}`} onClick={() => e.run()} role="button" tabIndex={0}>
                    <div className="mcal-cardh"><b data-sym={e.kind === 'earn' ? e.sym : undefined} className={e.kind === 'earn' ? 'mcal-sym' : ''}>{e.mine && '★ '}{e.label}</b>{e.move != null && <span className="mcal-mv">±{e.move.toFixed(1)}%</span>}<Bell e={e} day={k} /></div>
                    {(e.sub || (e.kind !== 'earn' && e.time)) && <span className="small muted">{[e.kind !== 'earn' ? e.time : '', e.sub].filter(Boolean).join(' · ')}</span>}
                  </div>))}{xs.length > 14 && <span className="mcal-more">+{xs.length - 14} more (click the day in Month view)</span>}</div> : null;
              })}
              {!evs.length && <span className="small muted">Nothing scheduled.</span>}
            </div>
          );
        })}
      </div>}
      {view === 'month' && <div className="mcal-grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((x) => <div key={x} className="mcal-dow">{x}</div>)}
        {cells.map((c) => {
          const k = ymd(c), evs = byDay.get(k) ?? [], out = c.getMonth() !== ym.m, hol = evs.find((e) => e.kind === 'hol');
          const shown = evs.filter((e) => e.kind !== 'hol').slice(0, 6), more = evs.filter((e) => e.kind !== 'hol').length - shown.length;
          return (
            <div key={k} className={`mcal-day ${out ? 'out' : ''} ${k === today ? 'today' : ''} ${k < today ? 'past' : ''} ${hol ? 'hol' : ''} ${day === k ? 'sel' : ''} ${heatOn ? 'heat' : ''}`} style={heatOn ? { ['--h' as string]: Math.min(1, (heat.get(k) ?? 0) / 12) } : undefined} onClick={() => setDay(day === k ? null : k)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setDay(k); }}>
              <div className="mcal-dn"><span>{c.getDate()}</span>{dayPnl.has(k) && <span className={`mcal-pnl ${dayPnl.get(k)! >= 0 ? 'up' : 'dn'}`} style={{ ['--s' as string]: 0.45 + 0.55 * Math.min(1, Math.abs(dayPnl.get(k)!) / pnlMax) }} title={`Your realized P&L: ${sUsd(dayPnl.get(k)!)}`}>{sUsd(dayPnl.get(k)!)}</span>}{hol && <span className="mcal-hol" title={hol.label}>closed</span>}{!covered(k) && !out && live && <span className="mcal-nc" title="Outside the loaded window (about a week back to five weeks ahead): earnings and IPOs not loaded for this day">·</span>}</div>
              <div className="mcal-evs">
                {shown.map((e) => <button key={e.key} className={`mcal-ev k-${e.kind} ${e.mine ? 'mine' : ''} ${e.big ? 'big' : ''} ${e.result ?? ''}`} data-sym={e.kind === 'earn' ? e.sym : undefined} title={`${e.label}${e.time ? ` · ${e.time}` : ''}${e.sub ? ` · ${e.sub}` : ''}`} onClick={(ev) => { ev.stopPropagation(); e.run(); }}>{e.mine && '★ '}{e.label}{e.move != null && <span className="mcal-mv" title="Options-implied move for the report">±{e.move.toFixed(1)}%</span>}{e.kind !== 'earn' && e.time ? <span className="mcal-t"> {e.time}</span> : null}</button>)}
                {more > 0 && <span className="mcal-more">+{more} more</span>}
              </div>
            </div>
          );
        })}
      </div>}
      {groups.some((g) => g.days) && <details className="mcal-you">
        <summary>Your trading on event days <span className="small muted">· from your journal, {dayPnl.size} trading days</span></summary>
        <table className="ql-t"><thead><tr><th>Kind of day</th><th className="r">Days traded</th><th className="r">Green days</th><th className="r">Average day</th><th className="r">Total</th></tr></thead><tbody>
          {groups.filter((g) => g.days).map((g) => <tr key={g.key} className={g.days < 3 ? 'thin' : ''}><td>{g.label}</td><td className="r num">{g.days}</td><td className="r num">{Math.round(g.green * 100)}%</td><td className={`r num ${g.avg >= 0 ? 'up' : 'dn'}`}>{sUsd(g.avg)}</td><td className={`r num ${g.total >= 0 ? 'up' : 'dn'}`}>{sUsd(g.total)}</td></tr>)}
        </tbody></table>
        <p className="small muted">Compare each row with "All other days". A few days is not a pattern: rows with under 3 days are dimmed. Your history, not advice.</p>
      </details>}
      {day && <div className="mcal-dayview">
        <div className="mcal-dvh"><b>{new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</b><span className="small muted">{sel.length} event{sel.length === 1 ? '' : 's'}</span><button className="icon-btn" onClick={() => setDay(null)} aria-label="Close day">×</button></div>
        {day < today && <DayReplay day={day} evs={sel} />}
        {!sel.length ? <p className="small muted">Nothing on this day{!covered(day) ? ' (outside the loaded window)' : ''}.</p> :
          <div className="mcal-list">{sel.map((e) => <div key={e.key} className={`mcal-row k-${e.kind}`} onClick={e.run} role="button" tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter') e.run(); }}><span className={`mcal-dot k-${e.kind}`} /><b data-sym={e.kind === 'earn' ? e.sym : undefined} className={e.kind === 'earn' ? 'mcal-sym' : ''}>{e.mine ? '★ ' : ''}{e.label}</b><span className="small muted">{[e.time, e.sub].filter(Boolean).join(' · ')}</span>{e.kind === 'earn' && e.sym && day >= today && <button className="mcal-watch" title={`Add ${e.sym} to your watchlist and a note to Journal → Research`} onClick={(ev) => { ev.stopPropagation(); onWatch?.(e.sym!); addResearch({ sym: e.sym, title: `Watch ${e.sym} into earnings ${day}`, body: `${e.sym} reports ${e.time || ''} on ${day}.${e.move != null ? ` Options price about ±${e.move.toFixed(1)}%.` : ''} Added from the calendar.`, kind: 'Watch' }); (ev.currentTarget as HTMLButtonElement).textContent = '✓ Watching'; }}>+ Watch</button>}<Bell e={e} day={day} /></div>)}</div>}
      </div>}
    </div>
  );
}
