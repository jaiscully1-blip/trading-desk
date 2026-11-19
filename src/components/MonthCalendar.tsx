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
import type { EventStat } from '../../shared/eventDays';

type Kind = 'earn' | 'econ' | 'fed' | 'ipo' | 'hol' | 'day';
interface Ev { kind: Kind; key: string; label: string; sub?: string; sym?: string; mine?: boolean; big?: boolean; time?: string; move?: number; rank: number; run: () => void }
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

export function MonthCalendar({ live, econ, mySyms, trades = [] }: { live: boolean; econ: EconEvent[] | null; mySyms: Set<string>; trades?: TradeView[] }) {
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
      add(e.date, { kind: 'earn', key: `e:${e.sym}`, label: e.sym, sym: e.sym, mine, big: (e.mcap ?? 0) >= 1e11, move: mv, time: WHEN[e.when] ?? '', sub: `${e.name}${e.epsEst != null ? ` · EPS est $${e.epsEst.toFixed(2)}` : ''}${e.mcap ? ` · ${cap(e.mcap)}` : ''}${mv ? ` · options price ±${mv.toFixed(1)}%` : ''}`, rank: (mine ? 3e12 : 0) + (e.mcap ?? 0), run: () => void earningsCard(e, mv) });
    }
    if (!mineOnly) {
      for (const x of econ ?? []) add(x.date, { kind: 'econ', key: `c:${x.key}:${x.date}`, label: x.label, time: x.time, big: x.impact >= 3, rank: 4e12 + x.impact, run: () => openExplain({ kind: 'Economic release', title: x.label, sub: `${x.date}${x.time ? ` · ${x.time} ET` : ''} · impact ${'●'.repeat(x.impact)}`, what: x.note, lines: x.usual ? [`How SPY usually moves that day: ${JSON.stringify(x.usual).slice(0, 160)}`] : [], src: 'FRED release calendar' }) });
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
        <button className="btn sm" onClick={() => move(-1)} aria-label="Previous month">‹</button>
        <b className="mcal-month">{first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b>
        <button className="btn sm" onClick={() => move(1)} aria-label="Next month">›</button>
        <button className="btn sm" onClick={() => setYm({ y: now.getFullYear(), m: now.getMonth() })}>Today</button>
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
      <div className="mcal-grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((x) => <div key={x} className="mcal-dow">{x}</div>)}
        {cells.map((c) => {
          const k = ymd(c), evs = byDay.get(k) ?? [], out = c.getMonth() !== ym.m, hol = evs.find((e) => e.kind === 'hol');
          const shown = evs.filter((e) => e.kind !== 'hol').slice(0, 6), more = evs.filter((e) => e.kind !== 'hol').length - shown.length;
          return (
            <div key={k} className={`mcal-day ${out ? 'out' : ''} ${k === today ? 'today' : ''} ${k < today ? 'past' : ''} ${hol ? 'hol' : ''} ${day === k ? 'sel' : ''} ${heatOn ? 'heat' : ''}`} style={heatOn ? { ['--h' as string]: Math.min(1, (heat.get(k) ?? 0) / 12) } : undefined} onClick={() => setDay(day === k ? null : k)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setDay(k); }}>
              <div className="mcal-dn"><span>{c.getDate()}</span>{dayPnl.has(k) && <span className={`mcal-pnl ${dayPnl.get(k)! >= 0 ? 'up' : 'dn'}`} style={{ ['--s' as string]: 0.45 + 0.55 * Math.min(1, Math.abs(dayPnl.get(k)!) / pnlMax) }} title={`Your realized P&L: ${sUsd(dayPnl.get(k)!)}`}>{sUsd(dayPnl.get(k)!)}</span>}{hol && <span className="mcal-hol" title={hol.label}>closed</span>}{!covered(k) && !out && live && <span className="mcal-nc" title="Outside the loaded window (about a week back to five weeks ahead): earnings and IPOs not loaded for this day">·</span>}</div>
              <div className="mcal-evs">
                {shown.map((e) => <button key={e.key} className={`mcal-ev k-${e.kind} ${e.mine ? 'mine' : ''} ${e.big ? 'big' : ''}`} data-sym={e.kind === 'earn' ? e.sym : undefined} title={`${e.label}${e.time ? ` · ${e.time}` : ''}${e.sub ? ` · ${e.sub}` : ''}`} onClick={(ev) => { ev.stopPropagation(); e.run(); }}>{e.mine && '★ '}{e.label}{e.move != null && <span className="mcal-mv" title="Options-implied move for the report">±{e.move.toFixed(1)}%</span>}{e.kind !== 'earn' && e.time ? <span className="mcal-t"> {e.time}</span> : null}</button>)}
                {more > 0 && <span className="mcal-more">+{more} more</span>}
              </div>
            </div>
          );
        })}
      </div>
      {groups.some((g) => g.days) && <details className="mcal-you">
        <summary>Your trading on event days <span className="small muted">· from your journal, {dayPnl.size} trading days</span></summary>
        <table className="ql-t"><thead><tr><th>Kind of day</th><th className="r">Days traded</th><th className="r">Green days</th><th className="r">Average day</th><th className="r">Total</th></tr></thead><tbody>
          {groups.filter((g) => g.days).map((g) => <tr key={g.key} className={g.days < 3 ? 'thin' : ''}><td>{g.label}</td><td className="r num">{g.days}</td><td className="r num">{Math.round(g.green * 100)}%</td><td className={`r num ${g.avg >= 0 ? 'up' : 'dn'}`}>{sUsd(g.avg)}</td><td className={`r num ${g.total >= 0 ? 'up' : 'dn'}`}>{sUsd(g.total)}</td></tr>)}
        </tbody></table>
        <p className="small muted">Compare each row with "All other days". A few days is not a pattern: rows with under 3 days are dimmed. Your history, not advice.</p>
      </details>}
      {day && <div className="mcal-dayview">
        <div className="mcal-dvh"><b>{new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</b><span className="small muted">{sel.length} event{sel.length === 1 ? '' : 's'}</span><button className="icon-btn" onClick={() => setDay(null)} aria-label="Close day">×</button></div>
        {!sel.length ? <p className="small muted">Nothing on this day{!covered(day) ? ' (outside the loaded window)' : ''}.</p> :
          <div className="mcal-list">{sel.map((e) => <button key={e.key} className={`mcal-row k-${e.kind}`} onClick={e.run}><span className={`mcal-dot k-${e.kind}`} /><b data-sym={e.kind === 'earn' ? e.sym : undefined} className={e.kind === 'earn' ? 'mcal-sym' : ''}>{e.mine ? '★ ' : ''}{e.label}</b><span className="small muted">{[e.time, e.sub].filter(Boolean).join(' · ')}</span></button>)}</div>}
      </div>}
    </div>
  );
}
