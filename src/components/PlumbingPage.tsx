// Shorts & Supply (was Market Plumbing): how a stock actually trades and who is supplying or absorbing shares. Per ticker: short volume, dark-pool and
// off-exchange share, borrow fee and availability, fails to deliver, unusual options, buybacks and dilution filings. Market-wide:
// index rebalance dates, IPO lockups ending, merger votes and tender offers, and a merger-arbitrage spread calculator.
import { useEffect, useMemo, useState } from 'react';
import type { DataMode } from '../data/live';
import { usePersisted } from '../lib/store';
import { Fresh } from './common';
import { arbSpread, offExchangeShare } from '../../shared/plumbing';

const SYM_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const pc = (v: number | null | undefined, dp = 1) => (v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(dp)}%`);
const big = (v: number) => (Math.abs(v) >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : `${Math.round(v)}`);
const uid = () => Math.random().toString(36).slice(2, 9);
const FORM_NOTE: Record<string, string> = { 'S-3': 'shelf registration: can sell new shares later', 'S-3ASR': 'automatic shelf (large companies): can sell any time', 'F-3': 'shelf (foreign issuer)', '424B5': 'prospectus supplement: often an at-the-market or follow-on sale', '424B4': 'final prospectus for an offering', '424B3': 'prospectus (resales, deals)', '424B2': 'prospectus (notes or shares)', '424B1': 'prospectus', 'S-1': 'registration (IPO or resale)', 'S-8': 'employee stock plan shares' };

function Card({ title, src, children }: { title: string; src?: string; children: React.ReactNode }) {
  return <section className="ad-card"><header className="ad-h"><h3>{title}</h3>{src && <Fresh kind="delayed" src={src} />}</header>{children}</section>;
}
function Bars({ v, max, color = 'var(--accent)' }: { v: number[]; max?: number; color?: string }) {
  const m = max ?? Math.max(1, ...v);
  return <div className="pl-bars">{v.map((x, i) => <i key={i} style={{ height: `${Math.max(2, (x / m) * 100)}%`, background: color }} />)}</div>;
}

function Ticker({ sym, live }: { sym: string; live: boolean }) {
  const [d, setD] = useState<any>(null);
  const [bars, setBars] = useState<{ time: number; volume: number }[]>([]);
  useEffect(() => { if (!live) return; setD(null); fetch(`/api/research?fn=plumb&symbol=${sym}`).then((r) => r.json()).then(setD).catch((e) => setD({ errors: { all: String(e) } })); fetch(`/api/research?fn=bars&symbol=${sym}&tf=1d`).then((r) => r.json()).then((j) => setBars(j.bars ?? [])).catch(() => {}); }, [sym, live]);
  const weekVol = useMemo(() => { const m = new Map<string, number>(); for (const b of bars) { const t = new Date(b.time * 1000); const mon = new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * 86400_000).toISOString().slice(0, 10); m.set(mon, (m.get(mon) ?? 0) + b.volume); } return m; }, [bars]);
  if (!live) return <p className="small muted">Live data only.</p>;
  if (!d) return <p className="small muted">Reading FINRA, SEC, Cboe and Interactive Brokers data for {sym}…</p>;
  const short: { date: string; short: number; total: number }[] = d.short ?? [];
  const off: { week: string; ats: number; otc: number }[] = d.off ?? [];
  const ftd: { date: string; qty: number; price: number | null }[] = d.ftd?.rows ?? [];
  const sec = d.sec, b = d.borrow, o = d.options;
  const avgShort = short.length ? short.reduce((s, x) => s + x.short / x.total, 0) / short.length * 100 : null;
  return (
    <div className="ad-grid">
      <Card title="Short volume · FINRA daily" src="FINRA Reg SHO daily short sale volume">
        {d.errors?.short && <p className="small down">{d.errors.short}</p>}
        {short.length > 0 && <>
          <div className="ad-stats"><div className="ad-stat"><span className="ad-k">Short share of volume, last session</span><b className="num">{pc((short.at(-1)!.short / short.at(-1)!.total) * 100)}</b><span className="small muted">10-session average {pc(avgShort)}</span></div></div>
          <Bars v={short.map((x) => (x.short / x.total) * 100)} max={100} />
          <p className="note">Short volume isn't short interest: market makers sell short to fill buy orders all day, so 40-55% is normal for most stocks. Watch for unusual jumps, not the level.</p>
        </>}
      </Card>
      <Card title="Dark pools and off-exchange · FINRA weekly" src="FINRA OTC transparency: ATS (dark pools) and other off-exchange (wholesalers), 2-4 weeks delayed">
        {d.errors?.offExchange && <p className="small down">{d.errors.offExchange}</p>}
        {off.length > 0 ? (
          <table className="ad-table"><thead><tr><th>Week of</th><th className="r">Dark pools (ATS)</th><th className="r">Other off-exchange</th><th className="r">Share of all volume</th></tr></thead><tbody>
            {off.slice(-8).reverse().map((w) => { const tot = weekVol.get(w.week); const sh = tot ? offExchangeShare(w.ats, w.otc, tot) : null; return <tr key={w.week}><td>{w.week}</td><td className="r num">{big(w.ats)}</td><td className="r num">{big(w.otc)}</td><td className="r num">{sh == null ? '—' : pc(sh * 100, 0)}</td></tr>; })}
          </tbody></table>
        ) : !d.errors?.offExchange && <p className="small muted">No FINRA weekly data for {sym} (it covers exchange-listed stocks; the latest weeks lag).</p>}
        <p className="note">About 40-50% of US volume trades off-exchange. A rising dark-pool share can mean big holders working orders quietly; direction isn't reported.</p>
      </Card>
      <Card title="Borrow · fee and shares available" src="Interactive Brokers short stock file (saved daily)">
        {b?.fee == null ? <p className="small muted">{b?.date ? `${sym} isn't in the Interactive Brokers borrow file.` : 'The daily borrow snapshot hasn\'t run yet.'}</p> : <>
          <div className="ad-stats">
            <div className="ad-stat"><span className="ad-k">Borrow fee (annual)</span><b className={`num ${b.fee >= 10 ? 'down' : ''}`}>{pc(b.fee, 2)}</b><span className="small muted">{b.fee < 1 ? 'easy to borrow' : b.fee < 10 ? 'getting harder' : 'hard to borrow'}</span></div>
            <div className="ad-stat"><span className="ad-k">Shares available</span><b className="num">{b.available >= 10_000_000 ? '>10M' : big(b.available)}</b><span className="small muted">as of {b.date}</span></div>
          </div>
          {b.history.length > 1 && <Bars v={b.history.map((x: any) => x.value)} />}
        </>}
        {b?.top?.length > 0 && <><h5>Costliest to borrow now</h5><div className="tl-chips">{b.top.slice(0, 12).map((t: any) => <span key={t.sym} className="chip sm">{t.sym} <span className="down">{t.fee.toFixed(0)}%</span></span>)}</div></>}
        <p className="note">High fees and few shares left mean shorts are crowded; with rising Reddit mentions (Alt Data) that's the squeeze setup to research.</p>
      </Card>
      <Card title="Fails to deliver · SEC" src={`SEC fails-to-deliver files (${(d.ftd?.files ?? []).join(', ')}), twice a month`}>
        {d.errors?.ftd && <p className="small down">{d.errors.ftd}</p>}
        {ftd.length === 0 ? <p className="small muted">No fails recorded for {sym} in the last two files.</p> : <>
          <div className="ad-stats"><div className="ad-stat"><span className="ad-k">Total fails, last two files</span><b className="num">{big(ftd.reduce((s, x) => s + x.qty, 0))} shares</b><span className="small muted">≈ ${big(ftd.reduce((s, x) => s + x.qty * (x.price ?? 0), 0))}</span></div></div>
          <Bars v={ftd.map((x) => x.qty)} color="var(--warn)" />
        </>}
        <p className="note">Shares sold but not delivered on settlement day. Persistent large fails can put a stock on the Reg SHO threshold list.</p>
      </Card>
      <Card title="Unusual options · Cboe delayed" src="Cboe delayed option chain (~15 min)">
        {d.errors?.options && <p className="small down">{d.errors.options}</p>}
        {o && <>
          <div className="ad-stats"><div className="ad-stat"><span className="ad-k">Contracts traded today</span><b className="num">{big(o.totalVolume)}</b><span className="small muted">put / call {o.putCall?.toFixed(2) ?? '—'}</span></div></div>
          {o.unusual.length === 0 ? <p className="small muted">Nothing unusual: no contract traded more than its open interest with real size.</p> : (
            <table className="ad-table"><thead><tr><th>Expiry</th><th className="r">Strike</th><th>Type</th><th className="r">Volume</th><th className="r">Open int.</th><th className="r">Premium</th></tr></thead><tbody>
              {o.unusual.slice(0, 10).map((u: any, i: number) => <tr key={i}><td>{u.exp}</td><td className="r num">{u.K}</td><td className={u.cp === 'C' ? 'up' : 'down'}>{u.cp === 'C' ? 'Call' : 'Put'}</td><td className="r num">{big(u.vol)}</td><td className="r num">{big(u.oi)}</td><td className="r num">${big(u.premium)}</td></tr>)}
            </tbody></table>
          )}
          <p className="note">Volume above open interest usually means new positions. It doesn't say whether they were bought or sold, or whether they hedge stock.</p>
        </>}
      </Card>
      <Card title="Buybacks and dilution · SEC" src="SEC XBRL company facts and the company's filing list">
        {!sec ? <p className="small muted">{d.errors?.sec ?? `${sym} isn't an SEC filer with XBRL data (funds and some foreign companies).`}</p> : <>
          {sec.buybacks.quarterly.length > 0 ? <><h5>Cash spent on buybacks, by quarter</h5><div className="pl-q">{sec.buybacks.quarterly.slice(-8).map((q: any) => <span key={q.period}><b className="num">${big(q.value)}</b><span className="small muted">{q.period.replace('CY', '')}</span></span>)}</div></> : <p className="small muted">No buyback spending reported.</p>}
          {sec.shareCount.length > 1 && <p className="small">Shares outstanding: {big(sec.shareCount[0].value)} ({sec.shareCount[0].end}) → <b>{big(sec.shareCount.at(-1).value)}</b> ({sec.shareCount.at(-1).end}), <span className={sec.shareCount.at(-1).value <= sec.shareCount[0].value ? 'up' : 'down'}>{pc((sec.shareCount.at(-1).value / sec.shareCount[0].value - 1) * 100)}</span></p>}
          <h5>Filings that can add shares (2 years)</h5>
          {sec.dilution.length === 0 ? <p className="small muted">None: no shelf, offering prospectus or employee-plan registration.</p> : <ul className="es-news">{sec.dilution.slice(0, 10).map((f: any, i: number) => <li key={i}><span className="num small muted">{f.date}</span> <a href={f.url} target="_blank" rel="noreferrer noopener">{f.form}</a> <span className="small muted">{FORM_NOTE[f.form] ?? ''}</span></li>)}</ul>}
        </>}
      </Card>
    </div>
  );
}

interface Deal { id: string; target: string; acquirer: string; cash: number; ratio: number; close: string }
function Market({ live }: { live: boolean }) {
  const [m, setM] = useState<any>(null);
  const [deals, setDeals] = usePersisted<Deal[]>('plDeals', []);
  const [f, setF] = useState({ target: '', acquirer: '', cash: '', ratio: '', close: '' });
  const [px, setPx] = useState<Record<string, number>>({});
  useEffect(() => { if (live) fetch('/api/research?fn=plumbmkt').then((r) => r.json()).then(setM).catch(() => {}); }, [live]);
  const syms = [...new Set(deals.flatMap((d) => [d.target, d.acquirer]).filter(Boolean))];
  useEffect(() => { if (!live || !syms.length) return; fetch(`/api/quotes?symbols=${syms.join(',')}`).then((r) => r.json()).then((j) => setPx(Object.fromEntries((j.quotes ?? []).map((q: any) => [q.symbol, q.last])))).catch(() => {}); }, [live, syms.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = (e: React.FormEvent) => { e.preventDefault(); const t = f.target.trim().toUpperCase(), a = f.acquirer.trim().toUpperCase(); if (!SYM_RE.test(t) || (a && !SYM_RE.test(a))) return; setDeals([...deals, { id: uid(), target: t, acquirer: a, cash: Number(f.cash) || 0, ratio: Number(f.ratio) || 0, close: f.close }]); setF({ target: '', acquirer: '', cash: '', ratio: '', close: '' }); };
  return (
    <div className="ad-grid">
      <Card title="Index rebalances coming up" src={m?.source}>
        {m?.rebalances && <table className="ad-table"><thead><tr><th>Date</th><th>Index</th><th>What happens</th></tr></thead><tbody>{m.rebalances.map((r: any, i: number) => <tr key={i} title={r.flows}><td className="num">{r.date}</td><td>{r.index}</td><td className="small">{r.what}</td></tr>)}</tbody></table>}
        <p className="note">Effective after the close; additions and deletions are announced 1-2 weeks before. Dates follow each provider's usual schedule (the MSCI dates are approximate).</p>
      </Card>
      <Card title="IPO lockups ending" src="SEC EDGAR: final IPO prospectuses (424B4) from ~5-7 months ago">
        {m?.errors?.lockups && <p className="small down">{m.errors.lockups}</p>}
        {m?.lockups && (m.lockups.length === 0 ? <p className="small muted">No lockups ending in the next few weeks.</p> : <table className="ad-table"><thead><tr><th>Company</th><th>IPO</th><th>Lockup ends (est.)</th></tr></thead><tbody>{m.lockups.slice(0, 15).map((x: any) => <tr key={x.ticker}><td><b>{x.ticker}</b> <span className="small muted">{x.name}</span></td><td className="num">{x.ipo}</td><td className="num">{x.lockupEnds}</td></tr>)}</tbody></table>)}
        <p className="note">Estimated at 180 days after pricing; check the prospectus for each deal's exact terms. Insiders can sell after the lockup, which often weighs on the stock.</p>
      </Card>
      <Card title="Mergers · votes and tender offers" src="SEC EDGAR full-text search (DEFM14A merger proxies, SC TO-T tender offers)">
        {m?.errors?.mergers && <p className="small down">{m.errors.mergers}</p>}
        {m?.mergers && <ul className="es-news">{m.mergers.slice(0, 14).map((x: any, i: number) => <li key={i}><span className="num small muted">{x.date}</span> {x.url ? <a href={x.url} target="_blank" rel="noreferrer noopener">{x.name}</a> : x.name}{x.ticker && <b> {x.ticker}</b>} <span className="small muted">{x.kind}</span></li>)}</ul>}
      </Card>
      <Card title="Merger arbitrage · your deals" src="Live quotes; terms you enter from the merger announcement">
        <form className="tl-form" onSubmit={add}>
          <input value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} placeholder="Target" aria-label="Target ticker" />
          <input value={f.acquirer} onChange={(e) => setF({ ...f, acquirer: e.target.value })} placeholder="Acquirer (stock deals)" aria-label="Acquirer ticker" />
          <input value={f.cash} onChange={(e) => setF({ ...f, cash: e.target.value })} placeholder="Cash per share $" aria-label="Cash per share" />
          <input value={f.ratio} onChange={(e) => setF({ ...f, ratio: e.target.value })} placeholder="Acquirer shares per share" aria-label="Exchange ratio" />
          <input type="date" value={f.close} onChange={(e) => setF({ ...f, close: e.target.value })} aria-label="Expected close" />
          <button className="btn" type="submit">Add deal</button>
        </form>
        {deals.length > 0 && <table className="ad-table"><thead><tr><th>Deal</th><th className="r">Target price</th><th className="r">Deal value</th><th className="r">Spread</th><th className="r">Annualized</th><th /></tr></thead><tbody>
          {deals.map((d) => { const s = arbSpread({ targetPx: px[d.target], cash: d.cash, ratio: d.ratio, acquirerPx: px[d.acquirer], closeDate: d.close || undefined });
            return <tr key={d.id}><td><b>{d.target}</b>{d.acquirer ? ` ← ${d.acquirer}` : ''} <span className="small muted">{[d.cash ? `$${d.cash}` : '', d.ratio ? `${d.ratio}×` : ''].filter(Boolean).join(' + ')}{d.close ? ` · close ${d.close}` : ''}</span></td><td className="r num">{px[d.target]?.toFixed(2) ?? '—'}</td><td className="r num">{s ? s.value.toFixed(2) : '—'}</td><td className={`r num ${s && s.spread >= 0 ? 'up' : 'down'}`}>{s ? pc(s.spread, 2) : '—'}</td><td className="r num">{s?.annualized != null ? pc(s.annualized) : '—'}</td><td><button className="hw-btn" onClick={() => setDeals(deals.filter((x) => x.id !== d.id))} aria-label="Remove">×</button></td></tr>; })}
        </tbody></table>}
        <p className="note">The spread is what the market charges for the risk the deal breaks (regulators, financing, votes). A wide spread usually means real doubt, not free money.</p>
      </Card>
    </div>
  );
}

export default function PlumbingPage({ mode, sel }: { mode: DataMode; sel: string }) {
  const live = mode.kind === 'live';
  const [sym, setSym] = usePersisted<string>('plSym', 'HOOD');
  const [draft, setDraft] = useState(sym);
  const go = (s: string) => { const v = s.trim().toUpperCase(); if (SYM_RE.test(v)) { setSym(v); setDraft(v); } };
  return (
    <div className="page ad">
      <div className="ad-top">
        <h2>Shorts &amp; Supply</h2>
        <form onSubmit={(e) => { e.preventDefault(); go(draft); }}><input value={draft} onChange={(e) => setDraft(e.target.value.toUpperCase())} aria-label="Ticker" maxLength={10} /></form>
        {sel && sel !== sym && <button className="chip sm" onClick={() => go(sel)}>Use {sel}</button>}
        <span className="small muted">How {sym} trades: shorts, dark pools, borrow, fails, options flow, buybacks and new shares. Data, not advice.</span>
      </div>
      <Ticker sym={sym} live={live} />
      <h3 className="pl-sec">Across the market</h3>
      <Market live={live} />
    </div>
  );
}
