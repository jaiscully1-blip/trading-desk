// Insiders & positioning: who is buying and selling their own company's stock (SEC Form 4, market-wide), plus short-sale volume (FINRA)
// and a pointer to what big funds did (13F). Facts from public filings, delayed by days: for context and patterns, not a signal or advice.
import { useMemo, useState } from 'react';
import { byTicker, clusterBuys, topBuys, topSells, weekly, type InsidersFile, type Row } from '../../shared/insiderMarket';
import { boards, type F13File } from '../../shared/f13agg';
import type { HighSi } from '../../shared/extras';
import { usd } from '../../shared/smartmoney';
import { useApi } from '../data/apis';
import type { DataMode } from '../data/live';
import { usePersisted } from '../lib/store';
import { Fresh, PageTabs, Seg } from './common';

type Tab = 'insiders' | 'positioning';
const fmtDate = (d: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—');
const Sym = ({ s, onChart }: { s: string; onChart: (s: string) => void }) => <button className="sym-chip" onClick={() => onChart(s)} title="Open chart">{s}</button>;

function RowTable({ rows, onChart, title, note }: { rows: Row[]; onChart: (s: string) => void; title: string; note: string }) {
  return (
    <section className="ins-sec">
      <h4>{title}</h4><p className="small muted">{note}</p>
      <div className="sm-tblwrap"><table className="sm-tbl">
        <thead><tr><th>Date</th><th>Ticker</th><th>Who</th><th className="r">Shares</th><th className="r">Price</th><th className="r">Value</th><th /></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}><td className="small">{fmtDate(r.d)}</td><td><Sym s={r.sym} onChart={onChart} /></td>
            <td className="small">{r.who}<span className="muted"> · {r.role || 'insider'}</span>{r.plan && <span className="tag" title="Sold under a pre-arranged 10b5-1 plan: set up earlier, so it says less about today's view">planned</span>}</td>
            <td className="r num">{r.sh.toLocaleString()}</td><td className="r num">{r.px != null ? `$${r.px.toFixed(2)}` : '—'}</td><td className="r num">{usd(r.val)}</td>
            <td><a href={r.url} target="_blank" rel="noreferrer noopener" className="small">filing</a></td></tr>
        ))}</tbody></table></div>
      {!rows.length && <p className="muted small">None in this window.</p>}
    </section>
  );
}

function Insiders({ onChart }: { onChart: (s: string) => void }) {
  const r = useApi<InsidersFile & { asOf: number; error?: string }>('/api/research?fn=insiders', 0, 1800_000);
  const [days, setDays] = usePersisted<'7' | '14' | '30'>('insDays', '30');
  const [noPlan, setNoPlan] = usePersisted<boolean>('insNoPlan', false);
  const [open, setOpen] = useState<string | null>(null);
  const d = r.data && !r.data.error ? r.data : null;
  const today = d ? d.built.slice(0, 10) : '';
  const n = Number(days);
  const ticks = useMemo(() => (d ? byTicker(d.rows, today, n, noPlan) : []), [d, today, n, noPlan]);
  const clusters = useMemo(() => clusterBuys(ticks).slice(0, 15), [ticks]);
  const wk = useMemo(() => (d ? weekly(d.rows.filter((x) => !(noPlan && x.plan && x.code === 'S')), today, 6) : []), [d, today, noPlan]);
  const buys = useMemo(() => (d ? topBuys(d.rows, today, n, 15) : []), [d, today, n]);
  const sells = useMemo(() => (d ? topSells(d.rows, today, n, 15, noPlan) : []), [d, today, n, noPlan]);
  if (r.loading && !d) return <p className="hw-pad muted">Loading insider filings…</p>;
  if (!d) return <p className="hw-pad muted">{r.error || r.data?.error || 'No insider file yet.'} It is built each morning from SEC filings, and can be started by hand from the GitHub Actions tab.</p>;
  const totBuy = ticks.reduce((a, t) => a + t.buyVal, 0), totSell = ticks.reduce((a, t) => a + t.sellVal, 0);
  const max = Math.max(1, ...wk.flatMap((w) => [w.buy, w.sell]));
  return (
    <div className="ins">
      <div className="sm-head">
        <div>
          <h3>Insider buying and selling <span className="muted">· last {days} days · {d.days.length} filing days read</span></h3>
          <p className="small muted">Open-market purchases by officers, directors and 10% owners, plus sales over $250,000, from SEC Form 4 (filed within 2 business days of the trade). Awards, option exercises and tax withholding are left out.</p>
        </div>
        <Fresh kind="eod" at={d.asOf} src={d.source} />
      </div>
      <div className="sm-row"><Seg value={days} onChange={setDays} options={[{ id: '7', label: '7 days' }, { id: '14', label: '14 days' }, { id: '30', label: '30 days' }]} />
        <label className="small"><input type="checkbox" checked={noPlan} onChange={(e) => setNoPlan(e.target.checked)} /> Hide planned (10b5-1) sales</label></div>
      <div className="sm-stats">
        <div><span className="muted small">Bought (open market)</span><b className="up">{usd(totBuy)}</b></div>
        <div><span className="muted small">Sold (over $250K)</span><b className="down">{usd(totSell)}</b></div>
        <div><span className="muted small">Companies with 3+ buyers</span><b>{clusters.length}</b></div>
      </div>
      <h4>Weekly totals</h4>
      <div className="ins-wk">{wk.map((w) => (
        <div key={w.start} className="ins-wcol" title={`Week from ${w.start}: bought ${usd(w.buy)}, sold ${usd(w.sell)}`}>
          <div className="ins-bars"><i className="bg-up" style={{ height: `${(w.buy / max) * 100}%` }} /><i className="bg-down" style={{ height: `${(w.sell / max) * 100}%` }} /></div>
          <span className="small muted">{fmtDate(w.start)}</span>
        </div>))}<span className="small muted ins-leg"><i className="bg-up" /> bought <i className="bg-down" /> sold</span></div>
      <section className="ins-sec">
        <h4>Cluster buys: 3 or more insiders buying the same stock</h4>
        <p className="small muted">Several people buying with their own money at once is the pattern researchers watch most. It still isn’t a guarantee.</p>
        <div className="sm-tblwrap"><table className="sm-tbl">
          <thead><tr><th>Ticker</th><th>Company</th><th className="r">Buyers</th><th className="r">Bought</th><th>CEO/CFO/Chair?</th><th>Last buy</th></tr></thead>
          <tbody>{clusters.map((t) => (<>
            <tr key={t.sym} onClick={() => setOpen(open === t.sym ? null : t.sym)} className="ins-click"><td><Sym s={t.sym} onChart={onChart} /></td><td className="small">{t.co}</td><td className="r">{t.buyers}</td><td className="r num">{usd(t.buyVal)}</td><td>{t.topBuy ? 'yes' : ''}</td><td className="small">{fmtDate(t.lastBuy)}</td></tr>
            {open === t.sym && <tr key={`${t.sym}-d`}><td colSpan={6}><ul className="ins-det">{t.rows.filter((x) => x.code === 'P').map((x, i) => <li key={i} className="small">{fmtDate(x.d)} · {x.who} <span className="muted">({x.role || 'insider'})</span> · {x.sh.toLocaleString()} sh @ {x.px != null ? `$${x.px.toFixed(2)}` : '—'} = {usd(x.val)} · <a href={x.url} target="_blank" rel="noreferrer noopener">filing</a></li>)}</ul></td></tr>}
          </>))}</tbody></table></div>
        {!clusters.length && <p className="muted small">No stock had 3 or more insider buyers in this window.</p>}
      </section>
      <RowTable rows={buys} onChart={onChart} title="Largest insider purchases" note="Biggest single open-market buys. Click a ticker for its chart." />
      <RowTable rows={sells} onChart={onChart} title="Largest insider sales" note="Insiders sell for many reasons that say little about the company: taxes, diversification, a house, a pre-set schedule." />
      <div className="ins-both">
        <div><h4>Why it may matter</h4><ul className="small"><li>Buying with your own money is a real cost to the buyer. People usually buy for one reason: they expect the stock to rise.</li><li>Studies of cluster buys and buys by CEOs and CFOs have found some tendency to precede better-than-average returns, mostly in smaller companies.</li></ul></div>
        <div><h4>Why it may not</h4><ul className="small"><li>Insiders are often early or wrong, and a buy can reflect confidence in a turnaround that never comes.</li><li>Most sales are routine, and planned (10b5-1) sales are set months ahead. Small buys can be symbolic.</li><li>The data is days old by the time you see it, and the price may already have moved.</li></ul></div>
      </div>
      {Object.keys(d.errors).length > 0 && <p className="note">Some filings could not be read: {Object.keys(d.errors).length}. Counts may be a little low.</p>}
    </div>
  );
}

function Positioning({ onChart, onPage }: { onChart: (s: string) => void; onPage: (p: 'smart') => void }) {
  const r = useApi<InsidersFile & { asOf: number; error?: string }>('/api/research?fn=insiders', 0, 1800_000);
  const f = useApi<F13File & { asOf: number; error?: string }>('/api/research?fn=f13agg', 0, 3600_000);
  const si = useApi<{ rows: HighSi[]; asOf: number; source: string; error?: string }>('/api/research?fn=hisi', 0, 6 * 3600_000);
  const sv = r.data && !r.data.error ? r.data.shortVol : null;
  const fd = f.data && !f.data.error ? f.data : null;
  const bs = useMemo(() => (fd ? boards(fd.stocks, 8) : []), [fd]);
  return (
    <div className="ins">
      <section className="ins-sec">
        <div className="sm-head"><div><h3>Most-shorted stocks (short interest)</h3>
          <p className="small muted">Shares sold short and not yet bought back, as a share of shares outstanding. FINRA publishes it twice a month with a lag of about a week, so it is slower than the daily volume below. “Days to cover” is how many average trading days it would take shorts to buy back.</p></div>
          {si.data && !si.data.error && <Fresh kind="eod" at={si.data.asOf} src={si.data.source} />}</div>
        {si.data?.rows?.length ? <div className="sm-tblwrap"><table className="sm-tbl"><thead><tr><th>Ticker</th><th>Company</th><th className="r">% of shares</th><th className="r">Days to cover</th><th className="r">Change</th><th>As of</th></tr></thead>
          <tbody>{si.data.rows.slice(0, 30).map((x) => <tr key={x.sym}><td><Sym s={x.sym} onChart={onChart} /></td><td className="small">{x.name.slice(0, 30)}</td>
            <td className="r">{x.pctOut == null ? '—' : <><span className="sm-wbar"><i style={{ width: `${Math.min(100, x.pctOut * 2)}%` }} /></span>{x.pctOut.toFixed(1)}%</>}</td>
            <td className="r num">{x.daysToCover >= 999 ? '—' : x.daysToCover.toFixed(1)}</td><td className="r num">{x.changePct == null ? '—' : `${x.changePct > 0 ? '+' : ''}${x.changePct.toFixed(0)}%`}</td><td className="small">{fmtDate(x.settlementDate)}</td></tr>)}</tbody></table></div>
          : <p className="muted small">{si.loading ? 'Loading short interest…' : si.error || 'No short interest list available right now.'}</p>}
        <div className="ins-both"><div><h4>Why heavy shorting may matter</h4><ul className="small"><li>Short sellers do research and risk unlimited losses, so some are well informed about weak businesses.</li><li>A crowded short can squeeze: if the price rises, shorts buying back to limit losses push it higher still.</li></ul></div>
          <div><h4>Why it may not</h4><ul className="small"><li>Shorts are often hedges or part of pair and arbitrage trades (for example against convertible bonds), not bets that the stock falls.</li><li>High short interest can last for years on stocks that keep falling, and squeezes are the exception.</li><li>The numbers are about two weeks old when published.</li></ul></div></div>
        <p className="note">Sources: FINRA consolidated short interest (free API) divided by shares outstanding from SEC filings (% is of shares outstanding, not float).</p>
      </section>
      <section className="ins-sec">
        <div className="sm-head"><div><h3>Heaviest short-sale volume</h3>
          <p className="small muted">Share of a stock’s trading volume that was short sales on {sv ? fmtDate(sv.date) : 'the latest day'} (FINRA daily file, stocks over 1 million shares). <b>This is not short interest.</b> Market makers short as part of normal trading, so the typical stock sits around 40 to 50%; only unusually high numbers over many days are worth a look.</p></div>
          {r.data && <Fresh kind="eod" at={r.data.asOf} src="FINRA daily short sale volume" />}</div>
        {sv ? <div className="sm-tblwrap"><table className="sm-tbl"><thead><tr><th>Ticker</th><th className="r">Short volume %</th><th className="r">Total volume</th></tr></thead>
          <tbody>{sv.rows.slice(0, 25).map((x) => <tr key={x.sym}><td><Sym s={x.sym} onChart={onChart} /></td><td className="r"><span className="sm-wbar"><i style={{ width: `${Math.min(100, x.ratio * 100)}%` }} /></span>{(x.ratio * 100).toFixed(0)}%</td><td className="r num">{x.vol.toLocaleString()}</td></tr>)}</tbody></table></div>
          : <p className="muted small">{r.error || r.data?.error || 'No short volume file yet.'}</p>}
        <p className="note">Both sides: heavy shorting can mean traders expect a decline, or that they are hedging a position or a market-making inventory. It can also fuel squeezes. It predicts less than it seems to.</p>
      </section>
      <section className="ins-sec">
        <h3>What big funds did last quarter</h3>
        {fd ? <div className="pt-grid">{bs.filter((b) => ['bought', 'sold', 'fav', 'crowd'].includes(b.key)).map((b) => (
          <div key={b.key} className="pt-board"><h4>{b.title}</h4>{b.rows.slice(0, 6).map((s) => <div key={s.cusip} className="pt-row"><span className="pt-sym">{s.sym ? <Sym s={s.sym} onChart={onChart} /> : '—'}</span><span className="small">{s.name.slice(0, 26)}</span><span /><span className="pt-val num small">{b.fmt === 'usd' ? (b.key === 'crowd' ? usd(b.val(s)) : `${b.val(s) < 0 ? '-' : '+'}${usd(Math.abs(b.val(s)))}`) : `${b.key === 'fav' && b.val(s) > 0 ? '+' : ''}${b.val(s)}`}</span></div>)}</div>
        ))}</div> : <p className="muted small">The 13F pattern file isn’t built yet.</p>}
        <button className="btn" onClick={() => onPage('smart')}>Open the 13F Tracker (investors, Patterns, ARK, Congress)</button>
        <p className="note">13F filings arrive up to 45 days after quarter-end and show long US positions only.</p>
      </section>
    </div>
  );
}

export default function InsiderPage({ mode, onChart, onPage }: { mode: DataMode; onChart: (s: string) => void; onPage: (p: 'smart') => void }) {
  const [tab, setTab] = usePersisted<Tab>('insTab', 'insiders');
  const live = mode.kind === 'live';
  return (
    <div className="overlay" role="dialog" aria-label="Insiders and positioning">
      <div className="overlay-in sm">
        <div className="phead">
          <div className="phead-title">Insiders &amp; positioning</div>
          <div className="phead-ctl"><PageTabs value={tab} onChange={setTab} options={[{ id: 'insiders', label: 'Insider buying and selling' }, { id: 'positioning', label: 'Shorts and big funds' }]} /></div>
        </div>
        <div className="sm-body">
          {!live ? <p className="hw-pad muted"><Fresh kind="demo" /> This page reads real filings only, so it needs the live desk (the deployed site with its server).</p>
            : tab === 'insiders' ? <Insiders onChart={onChart} /> : <Positioning onChart={onChart} onPage={onPage} />}
        </div>
      </div>
    </div>
  );
}
