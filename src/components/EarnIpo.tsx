// Earnings and IPO calendar panel, used by the Home widget and the Calendars page.
// Earnings: by day, biggest companies first, with timing, estimates, and actuals + surprise once reported.
// IPOs: upcoming / priced / filed / withdrawn, then IPO news (fresh SEC S-1 and 424B4 filings, plus IPO headlines from the desk's news feeds).
import { useMemo, useState } from 'react';
import type { DataMode } from '../data/live';
import { useEventCal } from '../data/eventcal';
import { useDesk } from '../lib/deskctx';
import type { NewsItem } from '../../shared/news';
import { isIpoHeadline, surprisePct, type EarnItem, type IpoItem } from '../../shared/eventsCal';
import { Fresh, PageTabs } from './common';
import type { HomeData } from './HomeWidgets';
import { etTime } from '../lib/clock';

const dayLabel = (d: string, today: string) => {
  if (d === today) return 'Today';
  if (new Date(`${d}T12:00:00Z`).getTime() === new Date(`${today}T12:00:00Z`).getTime() - 86400_000) return 'Yesterday';
  const t = new Date(`${d}T12:00:00Z`);
  const tomorrow = new Date(`${today}T12:00:00Z`).getTime() + 86400_000;
  if (t.getTime() === tomorrow) return 'Tomorrow';
  return t.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
};
const cap = (v: number | null) => (v == null ? '' : v >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${v.toFixed(0)}`);
const eps = (v: number | null) => (v == null ? '' : `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2)}`);
const rev = (v: number | null) => (v == null ? '' : Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : `$${(v / 1e6).toFixed(0)}M`);
const WHEN: Record<string, string> = { bmo: 'Before open', amc: 'After close', dmh: 'During day', unknown: '' };
const shortDate = (d: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');

export function EarnIpoPanel({ mode, mySyms, news, onSelect, compact = false }: { mode: DataMode; mySyms: Set<string>; news: NewsItem[]; onSelect: (s: string) => void; compact?: boolean }) {
  const { cal, error, loading } = useEventCal(mode, [...mySyms]);
  const { openArticle } = useDesk();
  const [tab, setTab] = useState<'earn' | 'ipo' | 'news'>('earn');
  const [day, setDay] = useState<string | null>(null);
  const [only, setOnly] = useState<'all' | 'mine'>('all');
  const today = new Date().toISOString().slice(0, 10);
  const ipoHeadlines = useMemo(() => news.filter((n) => isIpoHeadline(n.title)).slice(0, 12), [news]);

  if (mode.kind !== 'live') return <p className="hw-pad small muted">Needs live data. The calendar is never filled with sample numbers.</p>;
  if (loading) return <p className="hw-pad small muted">Loading the calendar…</p>;
  if (!cal) return <p className="hw-pad small down">{error || 'Calendar unavailable.'}</p>;

  const days = cal.days;
  const sel = day && days.includes(day) ? day : days.includes(today) ? today : days[0];
  const rows = cal.earnings.filter((e) => e.date === sel && (only === 'all' || mySyms.has(e.sym)));
  const total = cal.totals[sel] ?? 0;
  const ipos = (st: IpoItem['status']) => cal.ipos.filter((i) => i.status === st);
  const upcoming = ipos('upcoming');
  const priced = ipos('priced').filter((i) => !i.date || i.date >= new Date(Date.now() - 21 * 86400_000).toISOString().slice(0, 10)).sort((a, b) => b.date.localeCompare(a.date));
  const filed = ipos('filed').sort((a, b) => b.date.localeCompare(a.date));
  const errNames = Object.keys(cal.errors).filter((k) => !/finnhubEarnings|edgar/.test(k) || cal.errors[k] !== 'no FINNHUB_API_KEY');

  const EarnRow = ({ e }: { e: EarnItem }) => {
    const sp = surprisePct(e.epsAct, e.epsEst);
    return (
      <div className="ei-row" title={`${e.name || e.sym}${e.quarter ? ` · quarter ending ${e.quarter}` : ''}${e.nEsts ? ` · ${e.nEsts} analyst estimates` : ''} · ${e.source}`}>
        <button className={`wl-sym ${mySyms.has(e.sym) ? 'mine' : ''}`} onClick={() => onSelect(e.sym)}>{e.sym}</button>
        <span className="ei-name small muted">{e.name}</span>
        <span className="small ei-when">{WHEN[e.when]}</span>
        <span className="num small">{e.epsAct != null ? <><b>{eps(e.epsAct)}</b> <span className="muted">vs {eps(e.epsEst)}</span></> : e.epsEst != null ? <span className="muted">est {eps(e.epsEst)}</span> : ''}</span>
        <span className={`num small ${sp == null ? 'muted' : sp >= 0 ? 'up' : 'down'}`}>{sp != null ? `${sp >= 0 ? 'beat' : 'miss'} ${Math.abs(sp).toFixed(0)}%` : rev(e.revEst) ? `rev ${rev(e.revEst)}` : ''}</span>
        <span className="num small muted ei-cap">{cap(e.mcap)}</span>
      </div>
    );
  };
  const IpoRow = ({ i }: { i: IpoItem }) => (
    <div className="ei-row ei-ipo" title={`${i.name} · ${i.source}`}>
      <span className="num small">{shortDate(i.date)}</span>
      {i.sym ? <button className="wl-sym" onClick={() => onSelect(i.sym)}>{i.sym}</button> : <span className="small muted">no ticker</span>}
      <span className="ei-name small">{i.name}</span>
      <span className="small muted">{i.exchange}</span>
      <span className="num small">{i.price ? `$${i.price.replace(/^\$/, '')}` : ''}</span>
      <span className="num small muted ei-cap">{i.amount ? cap(i.amount) : i.shares ? `${(i.shares / 1e6).toFixed(1)}M sh` : ''}</span>
    </div>
  );

  return (
    <div className={`ei ${compact ? 'compact' : ''}`}>
      <div className="hw-bar">
        <PageTabs<'earn' | 'ipo' | 'news'> value={tab} onChange={setTab} options={[{ id: 'earn', label: 'Earnings' }, { id: 'ipo', label: 'IPOs', count: upcoming.length || undefined }, { id: 'news', label: 'IPO news' }]} />
        <Fresh kind="delayed" at={cal.asOf} src={`Earnings: ${cal.sources.earnings}. IPOs: ${cal.sources.ipos}. Filings: ${cal.sources.filings}. Nasdaq's calendar is unofficial; estimates come from analyst consensus and can change.`} />
      </div>

      {tab === 'earn' && (
        <>
          <div className="ei-days">
            {days.slice(0, 8).map((d) => <button key={d} className={`chip sm ${d === sel ? 'on' : ''}`} onClick={() => setDay(d)}>{dayLabel(d, today)}{cal.totals[d] ? <span className="muted"> {cal.totals[d]}</span> : null}</button>)}
            <span className="chips ei-only"><button className={`chip sm ${only === 'all' ? 'on' : ''}`} onClick={() => setOnly('all')}>All</button><button className={`chip sm ${only === 'mine' ? 'on' : ''}`} onClick={() => setOnly('mine')} title="Your starred and watchlist tickers">Mine</button></span>
          </div>
          <div className="ei-list">
            {rows.map((e) => <EarnRow key={e.date + e.sym} e={e} />)}
            {!rows.length && <p className="muted small hw-pad">{only === 'mine' ? 'None of your tickers report this day.' : 'Nobody reports this day.'}</p>}
            {only === 'all' && total > rows.length && <p className="muted small hw-pad">Showing the {rows.length} biggest of {total} reporting. Your starred tickers are always included.</p>}
          </div>
        </>
      )}

      {tab === 'ipo' && (
        <div className="ei-list">
          <div className="ei-sec">Upcoming <span className="muted">expected pricing date</span></div>
          {upcoming.map((i) => <IpoRow key={i.key} i={i} />)}
          {!upcoming.length && <p className="muted small hw-pad">No IPOs on the calendar for the coming weeks.</p>}
          <div className="ei-sec">Priced, last 3 weeks</div>
          {priced.map((i) => <IpoRow key={i.key} i={i} />)}
          {!priced.length && <p className="muted small hw-pad">None.</p>}
          <div className="ei-sec">Filed <span className="muted">registered, no pricing date yet</span></div>
          {filed.slice(0, compact ? 8 : 20).map((i) => <IpoRow key={i.key} i={i} />)}
          {!filed.length && <p className="muted small hw-pad">None.</p>}
          {ipos('withdrawn').length > 0 && <details className="small muted"><summary>Withdrawn ({ipos('withdrawn').length})</summary>{ipos('withdrawn').map((i) => <IpoRow key={i.key} i={i} />)}</details>}
        </div>
      )}

      {tab === 'news' && (
        <div className="ei-list">
          <div className="ei-sec">New SEC filings <span className="muted">S-1 = IPO registration · 424B4 = final prospectus, usually the pricing day</span></div>
          {cal.filings.slice(0, compact ? 10 : 25).map((f) => (
            <div key={f.url} className="ei-row ei-filing">
              <span className={`tag ${f.form === '424B4' ? 'up' : ''}`}>{f.form}</span>
              <a href={f.url} target="_blank" rel="noreferrer noopener" className="ei-name">{f.company}</a>
              <span className="num small muted">{shortDate(f.date)}</span>
            </div>
          ))}
          {!cal.filings.length && <p className="muted small hw-pad">{cal.errors.edgar ? `SEC feed unavailable: ${cal.errors.edgar}` : 'No new IPO filings right now.'}</p>}
          <div className="ei-sec">IPO headlines <span className="muted">from the desk's news feeds</span></div>
          {ipoHeadlines.map((n) => (
            <div key={n.id} className="ei-row ei-filing">
              <span className="num small muted">{etTime(n.t)}</span>
              <button className="link-plain news-hl ei-name" onClick={() => openArticle({ title: n.title, url: n.url, src: n.src, t: n.t, syms: n.syms, sentiment: n.sentiment })}>{n.title}</button>
              <span className="small muted">{n.src}</span>
            </div>
          ))}
          {!ipoHeadlines.length && <p className="muted small hw-pad">No IPO headlines in the current news.</p>}
        </div>
      )}
      {errNames.length > 0 && <p className="note">Some sources failed: {errNames.map((k) => `${k} (${cal.errors[k]})`).join(' · ')}</p>}
    </div>
  );
}

/** Home widget: the same panel, with your starred tickers as "Mine". */
export function EarnIpoW({ d }: { d: HomeData; cfg: Record<string, any>; set: (c: Record<string, any>) => void }) {
  const { stars } = useDesk();
  const mine = useMemo(() => new Set([...stars, d.sel]), [stars, d.sel]);
  return <EarnIpoPanel mode={d.mode} mySyms={mine} news={d.news.items} onSelect={d.onChart} compact />;
}
