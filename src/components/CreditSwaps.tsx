// Credit & Swaps tab (Credit page): ratings ladder, the DTCC CDS tape (single names, sovereigns, CDX / iTraxx),
// who holds / lends to a name and its debt + distance to default, tranche and loan proxies, Treasury futures positioning.
// Real data only. Facts and estimates, not advice.
import { useEffect, useMemo, useState } from 'react';
import { paceMs } from '../lib/pace';
import type { CdsTrade, NameSum } from '../../shared/cds';
import { tiwKey } from '../../shared/tiw';
import { usePersisted } from '../lib/store';
import { Fresh, Q } from './common';
import { LeverageW } from './XAsset';

const bp = (x: number | null | undefined) => (x == null ? '—' : `${Math.round(x)}bp`);
const pp = (x: number | null | undefined) => (x == null ? '—' : `${x.toFixed(2)}%`);
const chg = (a: number | null | undefined, b: number | null | undefined, mult = 100) => (a == null || b == null ? '—' : `${a - b >= 0 ? '+' : ''}${Math.round((a - b) * mult)}bp`);
const pc = (x: number | null | undefined) => (x == null ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(1)}%`);
const usd = (x: number | null | undefined) => (x == null ? '—' : Math.abs(x) >= 1e9 ? `$${(x / 1e9).toFixed(1)}B` : `$${(x / 1e6).toFixed(0)}M`);
function useJson<T>(url: string | null, every = 0): { d: T | null; err: string; loading: boolean } {
  const [s, setS] = useState<{ d: T | null; err: string; loading: boolean }>({ d: null, err: '', loading: !!url });
  useEffect(() => {
    if (!url) return; let stop = false;
    const go = () => { setS((x) => ({ ...x, loading: true })); fetch(url).then(async (r) => { const j = await r.json(); if (!stop) setS(r.ok && !j.error ? { d: j, err: '', loading: false } : { d: null, err: j.error ?? `HTTP ${r.status}`, loading: false }); }).catch((e) => !stop && setS({ d: null, err: String(e), loading: false })); };
    go(); const id = every ? setInterval(go, paceMs(every)) : 0;
    return () => { stop = true; if (id) clearInterval(id); };
  }, [url, every]);
  return s;
}

interface C2 { ladder: { grade: string; oas: D; yld: D }[]; moodys: ({ id: string; label: string } & D)[]; proxies: { sym: string; what: string; last: number | null; m1: number | null; m3: number | null; y1: number | null }[]; hy: D; divergence: { bp: number | null; spy: number | null; flag: string | null }; cot: { label: string; date: string; assetNet: number; levNet: number; levNetChg: number; oi: number }[]; errors: Record<string, string>; asOf: number; source: string }
interface D { last: number | null; date: string | null; m1: number | null; y1: number | null }
interface Cds { days: string[]; trades: number; singles: NameSum[]; sovs: NameSum[]; indexes: NameSum[]; names: string[]; detail?: CdsTrade[]; errors: string[]; asOf: number; source: string }
// DTCC activity files: quarter[key] = [dealers, avg daily notional, trades a day, index member 1/0]; six[key] = [avg weekly
// notional, trades a week, last 8 weeks' pace / average]
interface Act { quarter: Record<string, [number, number, number, number]>; six: Record<string, [number, number, number | null]>; quarterLabel: string | null; sixLabel: string | null; quarterUrl: string | null; sixUrl: string | null; pickUp: { name: string; ratio: number; week: number }[]; slowDown: { name: string; ratio: number; week: number }[]; errors: string[]; asOf: number; source: string }
const pace = (r: number | null | undefined) => (r == null ? null : r >= 1.5 ? <span className="up small" title="Last 8 weeks vs its six-month weekly average (DTCC Top 1,000 file)"> {r.toFixed(1)}× lately</span> : r <= 0.5 ? <span className="muted small" title="Last 8 weeks vs its six-month weekly average (DTCC Top 1,000 file)"> {r.toFixed(1)}× lately</span> : null);
function ActCell({ act, name }: { act: Act | null; name: string }) {
  if (!act) return <td className="num muted">…</td>;
  const k = tiwKey(name), q = act.quarter[k], sx = act.six[k];
  if (!q && !sx) return <td className="num muted small" title="Not in DTCC's quarterly or Top 1,000 activity files">—</td>;
  return <td className="num small" title={q ? `${act.quarterLabel}: ${q[0]} dealers, ${q[2]} trades a day` : act.sixLabel ?? ''}>{q ? `${usd(q[1])}/day` : `${usd(sx![0])}/wk`}{pace(sx?.[2])}</td>;
}

interface Look { funds: { total: number; hits: { who: string; date: string; url: string }[] } | null; lenders: { total: number; hits: { who: string; date: string; form: string; url: string }[] } | null; company: { name: string; price: number | null; vol: number | null; equity: number | null; totalDebt: { val: number; end: string } | null; stDebt: { val: number; end: string } | null; maturities: { label: string; val: number }[]; debtHistory: [string, number][]; merton: { dd: number; pd: number } | null } | null; errors: Record<string, string>; asOf: number; source: string }

function NameTable({ rows, pick, onPick, title, act }: { rows: NameSum[]; pick: string; onPick: (n: string) => void; title: string; act?: Act | null }) {
  return (
    <table className="cs-t"><thead><tr><th>{title}</th><th>Trades</th><th>5y spread</th><th>5-day change</th>{act !== undefined && <th title="How much CDS on this name usually trades (DTCC quarterly file)">Usual activity</th>}</tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.name} className={pick === r.name ? 'on' : ''} onClick={() => onPick(r.name)}>
          <td>{r.name}</td><td className="num">{r.n}{r.capped ? <span className="muted small"> ({r.capped} capped)</span> : null}</td>
          <td className="num">{bp(r.last5y)}{r.last5ySrc === 'implied' ? <span className="muted small" title="Backed out of the upfront payment"> est.</span> : null}</td>
          <td className={`num ${r.last5y != null && r.first5y != null ? (r.last5y > r.first5y ? 'down' : 'up') : ''}`}>{r.last5y != null && r.first5y != null ? `${r.last5y - r.first5y >= 0 ? '+' : ''}${Math.round(r.last5y - r.first5y)}bp` : '—'}</td>
          {act !== undefined && <ActCell act={act} name={r.name} />}
        </tr>))}</tbody></table>
  );
}

function Detail({ name, trades, act }: { name: string; trades: CdsTrade[]; act: Act | null }) {
  const q = act?.quarter[tiwKey(name)], sx = act?.six[tiwKey(name)];
  const five = trades.filter((t) => t.spreadBp != null && t.spreadSrc !== 'ambiguous' && t.years >= 4.4 && t.years <= 5.6);
  const curve = useMemo(() => { const m = new Map<string, CdsTrade>(); for (const t of trades) if (t.spreadBp != null && t.spreadSrc !== 'ambiguous') m.set(t.maturity.slice(0, 4), t); return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])); }, [trades]);
  const W = 520, H = 140, lo = Math.min(...five.map((t) => t.spreadBp!)), hi = Math.max(...five.map((t) => t.spreadBp!)), pad = (hi - lo) * 0.15 || 5;
  const x = (i: number) => 30 + (i / Math.max(1, five.length - 1)) * (W - 40), y = (v: number) => H - 14 - ((v - lo + pad) / (hi - lo + 2 * pad)) * (H - 24);
  return (
    <div className="cs-detail">
      <b>{name}</b> <span className="small muted">{trades.length} trades in 5 days · {trades.filter((t) => t.capped).length} above the size cap · {trades.filter((t) => t.cleared).length} cleared</span>
      {five.length > 1 && <svg viewBox={`0 0 ${W} ${H}`} className="cs-svg" role="img" aria-label={`${name} 5-year CDS spread by trade`} data-hover data-y={`${y(hi + pad)},${y(lo - pad)},${hi + pad},${lo - pad},0,bp`}>
        <path d={five.map((t, i) => `${i ? 'L' : 'M'}${x(i)},${y(t.spreadBp!)}`).join('')} className="cs-line" data-name="5y spread" />
        {five.map((t, i) => <circle key={t.id} cx={x(i)} cy={y(t.spreadBp!)} r={2.5} className={t.spreadSrc === 'quoted' ? 'cs-q' : 'cs-i'}><title>{new Date(t.t).toLocaleString('en-US', { timeZone: 'America/New_York' })} · {t.spreadBp}bp ({t.spreadSrc})</title></circle>)}
        <text x={2} y={y(hi) + 4} className="gt-ax">{Math.round(hi)}</text><text x={2} y={y(lo) + 4} className="gt-ax">{Math.round(lo)}</text>
      </svg>}
      {curve.length > 1 && <p className="small">Curve (latest trade per maturity year): {curve.map(([yr, t]) => `${yr}: ${t.spreadBp}bp`).join(' · ')}</p>}
      <p className="small muted">Filled dots = spread DTCC printed; hollow = estimated from the upfront payment. 5-year trades shown.</p>
      {act && <p className="small">{q || sx ? <>Usual activity (DTCC): {q && <>about {usd(q[1])} a day, {q[2]} trades a day, {q[0]} dealers{q[3] ? ', in an index' : ''} <span className="muted">({act.quarterLabel})</span></>}{q && sx && ' · '}{sx && <>{usd(sx[0])} a week on average{sx[2] != null && <>, last 8 weeks {sx[2].toFixed(1)}× that pace</>} <span className="muted">(six months to {act.sixLabel?.replace(/^.*through week ending /, '') ?? '—'})</span></>}</> : <span className="muted">Not in DTCC's activity files (quarterly list or Top 1,000).</span>}</p>}
    </div>
  );
}

function Lookup({ initial }: { initial: { q: string; ticker: string } }) {
  const [q, setQ] = useState(initial.q), [tk, setTk] = useState(initial.ticker), [go, setGo] = useState(initial);
  useEffect(() => { setQ(initial.q); setTk(initial.ticker); setGo(initial); }, [initial.q, initial.ticker]); // eslint-disable-line react-hooks/exhaustive-deps
  const { d, err, loading } = useJson<Look>(go.q || go.ticker ? `/api/research?fn=credlook&q=${encodeURIComponent(go.q)}&ticker=${encodeURIComponent(go.ticker)}` : null);
  const c = d?.company;
  const maxM = Math.max(1, ...(c?.maturities ?? []).map((m) => m.val));
  return (
    <section className="panel">
      <div className="gx-h"><Q k="delayed" src="SEC EDGAR full-text search, SEC XBRL company facts, Yahoo prices (unofficial)" /><b>Who holds it, who lends to it, how much it owes</b>{d && <Fresh kind="eod" at={d.asOf} src={d.source} />}</div>
      <form className="cs-form" onSubmit={(e) => { e.preventDefault(); setGo({ q: q.trim(), ticker: tk.trim().toUpperCase() }); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company name as filed, e.g. Oracle Corporation" aria-label="Company name" />
        <input value={tk} onChange={(e) => setTk(e.target.value)} placeholder="Ticker" aria-label="Ticker" maxLength={10} className="cs-tk" />
        <button className="btn">Look up</button>
      </form>
      {loading && <p className="small muted gx-pad">Searching SEC filings…</p>}
      {err && <p className="small down gx-pad">{err}</p>}
      {d && <div className="cs-look">
        {c && <div><h4>{c.name}: debt and distance to default</h4>
          <p className="small">Total debt {usd(c.totalDebt?.val)} <span className="muted">({c.totalDebt?.end})</span> · due within a year {usd(c.stDebt?.val)} · stock {c.price?.toFixed(2) ?? '—'} · 1-year stock volatility {c.vol != null ? `${(c.vol * 100).toFixed(0)}%` : '—'} · market value {usd(c.equity)}</p>
          {c.debtHistory.length > 1 && <p className="small">Debt by fiscal year: {c.debtHistory.map(([d, v]) => `${d.slice(0, 4)} ${usd(v)}`).join(' → ')}</p>}
          {c.maturities.length > 0 && <div className="cs-mat">{c.maturities.map((m) => <div key={m.label}><span className="small">{m.label}</span><i style={{ width: `${(m.val / maxM) * 100}%` }} /><b className="small num">{usd(m.val)}</b></div>)}</div>}
          {c.merton && <p className="small"><b>Distance to default: {c.merton.dd.toFixed(1)}</b> standard deviations (model 1-year default odds {(c.merton.pd * 100).toPrecision(2)}%). Stock-based model: assets = stock value + debt, default point = short-term debt + half the long-term debt. Under 2 is weak, over 4 is strong. CDS traders can price a name far riskier than this model; when they disagree, that gap is the story.</p>}
        </div>}
        <div><h4>Funds that report holding it (N-PORT, last ~6 months)</h4>
          {d.funds ? <><p className="small muted">{d.funds.total >= 10000 ? '10,000+' : d.funds.total.toLocaleString('en-US')} fund filings mention the name (bonds, CDS, loans or stock). Open a filing to see the position and, for swaps, the bank on the other side.</p><ul className="small cs-ul">{d.funds.hits.map((h) => <li key={h.who}><a href={h.url} target="_blank" rel="noreferrer">{h.who}</a> <span className="muted">{h.date}</span></li>)}</ul></> : <p className="small muted">Not searched.</p>}
        </div>
        <div><h4>Lenders and filers that list it (10-Q / 10-K, incl. BDC loan schedules)</h4>
          {d.lenders ? <><p className="small muted">{d.lenders.total} filings. Business development companies (private credit funds) list every loan with its rate and fair value; the same borrower marked lower by one lender is an early warning.</p><ul className="small cs-ul">{d.lenders.hits.map((h) => <li key={h.who}><a href={h.url} target="_blank" rel="noreferrer">{h.who}</a> <span className="muted">{h.form} {h.date}</span></li>)}</ul></> : <p className="small muted">Not searched.</p>}
        </div>
      </div>}
    </section>
  );
}

export default function CreditSwaps({ live }: { live: boolean }) {
  const c2 = useJson<C2>(live ? '/api/research?fn=credit2' : null, 30 * 60_000);
  const [saved, setPick] = usePersisted<string>('csPick', 'ORACLE CORPORATION');
  const pick = /[¿]/.test(saved) || !saved.trim() ? 'ORACLE CORPORATION' : saved; // a name saved before DTCC's blanked names were fixed
  const [find, setFind] = useState('');
  const actR = useJson<Act>(live ? '/api/research?fn=cdsactivity' : null, 6 * 3600_000), act = actR.d;
  const cds = useJson<Cds>(live ? `/api/research?fn=cds&name=${encodeURIComponent(pick)}` : null, 10 * 60_000);
  if (!live) return <p className="hw-pad muted">Credit & Swaps reads real data only, so it needs the live desk.</p>;
  const d = c2.d, k = cds.d;
  const lad = d?.ladder ?? [];
  const bbb = lad.find((l) => l.grade === 'BBB')?.oas.last, bb = lad.find((l) => l.grade === 'BB')?.oas.last;
  const div = d?.divergence;
  return (
    <div className="cs">
      {div?.flag && <section className={`panel cs-banner ${div.flag === 'credit-warns' ? 'warn' : ''}`}>
        <b>{div.flag === 'credit-warns' ? 'Credit is warning while stocks rise' : div.flag === 'credit-confirms-selloff' ? 'Credit is confirming the stock selloff' : 'Credit and stocks are calm together'}</b>
        <span className="small"> · high-yield spread {div.bp != null ? `${div.bp >= 0 ? '+' : ''}${div.bp}bp` : '—'} over a month, S&P 500 {pc(div.spy)}. Widening spreads have often come before stock drops, but not every time.</span>
      </section>}
      <div className="cs-grid">
        <section className="panel">
          <div className="gx-h"><Q k="eod" src="FRED: ICE BofA US corporate indices by rating, Moody's Aaa / Baa" /><b>Ratings ladder</b><span className="small muted">spread over Treasuries and total yield, AAA to CCC</span>{d && <Fresh kind="eod" at={d.asOf} src={d.source} />}</div>
          {c2.err && <p className="small down gx-pad">{c2.err}</p>}
          {d && <table className="cs-t"><thead><tr><th>Rating</th><th>Spread</th><th>1 mo</th><th>1 yr</th><th>Yield</th><th>Yield 1 yr ago</th></tr></thead><tbody>
            {lad.map((l) => <tr key={l.grade} className={l.grade === 'BB' ? 'cliff' : ''}><td><b>{l.grade}</b></td><td className="num">{bp(l.oas.last != null ? l.oas.last * 100 : null)}</td><td className="num">{chg(l.oas.last, l.oas.m1)}</td><td className="num">{chg(l.oas.last, l.oas.y1)}</td><td className="num">{pp(l.yld.last)}</td><td className="num muted">{pp(l.yld.y1)}</td></tr>)}
            {d.moodys.map((m) => <tr key={m.id}><td>{m.label}</td><td className="num" colSpan={3}>{m.id === 'BAA10Y' ? bp(m.last != null ? m.last * 100 : null) : ''}</td><td className="num">{m.id !== 'BAA10Y' ? pp(m.last) : ''}</td><td className="num muted">{m.id !== 'BAA10Y' ? pp(m.y1) : chg(m.last, m.y1)}</td></tr>)}
          </tbody></table>}
          {bbb != null && bb != null && <p className="small gx-pad">The jump from BBB to BB (investment grade to junk) is {Math.round((bb - bbb) * 100)}bp. When that gap widens fast, buyers are fleeing anything near the edge.</p>}
        </section>
        <section className="panel">
          <div className="gx-h"><Q k="delayed" src="DTCC public swap data: anonymized, sizes capped" /><b>Index CDS</b><span className="small muted">5 trading days · CDX (North America), iTraxx (Europe)</span>{k && <Fresh kind="delayed" at={k.asOf} src={k.source} />}</div>
          {cds.err && <p className="small down gx-pad">{cds.err}</p>}
          {k && <NameTable rows={k.indexes.slice(0, 10)} pick={pick} onPick={setPick} title="Index" />}
          <p className="small muted gx-pad">CDX IG ≈ investment-grade companies, CDX HY ≈ junk; rising = buying protection got more expensive. HY and EM trade on price; the desk converts that to a spread.</p>
        </section>
      </div>
      <section className="panel">
        <div className="gx-h"><Q k="delayed" src="DTCC SEC security-based swap data" /><b>Single-name CDS tape</b><span className="small muted">{k ? `${k.trades.toLocaleString('en-US')} trades, ${k.days.at(-1)} to ${k.days[0]}` : 'loading…'} · click a name · no counterparties are public</span>
          <input className="cs-find" list="cs-names" value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && find.trim()) { setPick(find.trim().toUpperCase()); setFind(''); } }} placeholder="Find a name ↵" aria-label="Find a CDS name" />
          <datalist id="cs-names">{(k?.names ?? []).map((n) => <option key={n} value={n} />)}</datalist></div>
        {k && <div className="cs-grid">
          <div><NameTable rows={k.singles.slice(0, 25)} pick={pick} onPick={setPick} title="Company" act={act} /></div>
          <div>{k.detail && k.detail.length ? <Detail name={pick} trades={k.detail} act={act} /> : <p className="small muted gx-pad">{pick}: no trades in the last 5 days.{pick !== 'ORACLE CORPORATION' && <> <button className="linkish" onClick={() => setPick('ORACLE CORPORATION')}>Back to Oracle</button></>}</p>}
            <NameTable rows={k.sovs.slice(0, 10)} pick={pick} onPick={setPick} title="Country" act={act} /></div>
        </div>}
      </section>
      <section className="panel">
        <div className="gx-h"><Q k="eod" src="DTCC Trade Information Warehouse public activity reports, quarterly and six-monthly" /><b>CDS trading picking up or slowing</b><span className="small muted">last 8 weeks vs each name's six-month weekly average · names trading $100M+ a week</span>{act && <Fresh kind="eod" at={act.asOf} src={act.source} />}</div>
        {actR.err && <p className="small down gx-pad">{actR.err}</p>}
        {act && <div className="cs-grid">
          {([['Picking up', act.pickUp], ['Slowing', act.slowDown]] as const).map(([t, xs]) => (
            <table key={t} className="cs-t"><thead><tr><th>{t}</th><th>Usual week</th><th>Last 8 weeks</th></tr></thead>
              <tbody>{xs.map((x) => <tr key={x.name} className={pick === x.name ? 'on' : ''} onClick={() => setPick(x.name)}><td>{x.name}</td><td className="num">{usd(x.week)}</td><td className={`num ${x.ratio >= 1.5 ? 'up' : x.ratio <= 0.5 ? 'muted' : ''}`}>{x.ratio.toFixed(2)}× pace</td></tr>)}</tbody></table>
          ))}
        </div>}
        {act && <p className="small muted gx-pad">This is how much protection changed hands, not how much is outstanding (DTCC's outstanding-positions numbers are in a paid service). A name trading far above its usual pace often has news, hedging or a downgrade fear behind it; it says nothing about direction. Files: <a href={act.sixUrl ?? 'https://www.dtcc.com/repository-otc-data'} target="_blank" rel="noreferrer">{act.sixLabel}</a>{act.quarterUrl && <> · <a href={act.quarterUrl} target="_blank" rel="noreferrer">quarterly, {act.quarterLabel}</a></>}. Updated quarterly, so this is background, not today's market.</p>}
        {act && act.errors.length > 0 && <p className="small muted gx-pad">Not loaded this time: {act.errors.join(' · ')}</p>}
      </section>
      <LeverageW live={live} />
      <Lookup initial={pick === 'ORACLE CORPORATION' ? { q: 'Oracle Corporation', ticker: 'ORCL' } : { q: pick.replace(/\b(INC|CORP|CORPORATION|LLC|PLC|CO|LTD)\.?$/i, '').trim(), ticker: '' }} />
      <div className="cs-grid">
        <section className="panel">
          <div className="gx-h"><Q k="delayed" src="Yahoo Finance ETF prices (unofficial)" /><b>Tranche and loan proxies</b><span className="small muted">ETFs that hold each slice</span></div>
          {d && <table className="cs-t"><thead><tr><th>ETF</th><th>Holds</th><th>1 mo</th><th>3 mo</th><th>1 yr</th></tr></thead><tbody>{d.proxies.map((p) => <tr key={p.sym}><td><b>{p.sym}</b></td><td className="small">{p.what}</td><td className={`num ${(p.m1 ?? 0) < 0 ? 'down' : 'up'}`}>{pc(p.m1)}</td><td className="num">{pc(p.m3)}</td><td className="num">{pc(p.y1)}</td></tr>)}</tbody></table>}
          <p className="small muted gx-pad">JBBB falling while JAAA holds = stress in the riskier CLO tranches. Tranche-level prices themselves are paid data (Intex, Bloomberg).</p>
        </section>
        <section className="panel">
          <div className="gx-h"><Q k="eod" src="CFTC Traders in Financial Futures, weekly (Tuesday positions, released Friday)" /><b>Treasury futures: who is positioned</b></div>
          {d && <table className="cs-t"><thead><tr><th>Contract</th><th>Asset managers net</th><th>Hedge funds net</th><th>HF weekly change</th></tr></thead><tbody>{d.cot.map((c) => <tr key={c.label}><td>{c.label}</td><td className="num up">{c.assetNet.toLocaleString('en-US')}</td><td className="num down">{c.levNet.toLocaleString('en-US')}</td><td className="num">{c.levNetChg >= 0 ? '+' : ''}{c.levNetChg.toLocaleString('en-US')}</td></tr>)}</tbody></table>}
          <p className="small muted gx-pad">Contracts, as of {d?.cot[0]?.date ?? '—'}. Hedge funds short futures against bonds they own (the "basis trade", often with heavy borrowing). Very large shorts can unwind fast in a selloff.</p>
        </section>
      </div>
      <section className="panel">
        <div className="gx-h"><b>More free sources (open in your browser)</b></div>
        <ul className="small cs-ul gx-pad">
          <li>Rating histories, every rating incl. CLO / CMBS tranches (SEC Rule 17g-7): <a href="https://ratings.moodys.com/sec-17g-7b" target="_blank" rel="noreferrer">Moody's</a> · <a href="https://www.fitchratings.com/ratings-history-disclosure" target="_blank" rel="noreferrer">Fitch</a> · <a href="https://disclosure.spglobal.com/ratings/en/regulatory/ratings-history" target="_blank" rel="noreferrer">S&P</a> (S&P blocks the desk's automated requests; it opens fine in a browser)</li>
          <li><a href="https://www.dtcc.com/repository-otc-data" target="_blank" rel="noreferrer">DTCC CDS activity reports</a>: how much trades per name (now on the desk, above). DTCC's gross / net protection outstanding is only in its paid CDS Kinetics service.</li>
          <li><a href="https://www.occ.gov/publications-and-resources/publications/quarterly-report-on-bank-trading-and-derivatives-activities/index-quarterly-report-on-bank-trading.html" target="_blank" rel="noreferrer">OCC bank derivatives report</a>: how much credit protection the big banks bought and sold</li>
          <li><a href="https://www.finra.org/finra-data/fixed-income" target="_blank" rel="noreferrer">FINRA TRACE</a>: corporate bond trades (a free FINRA account unlocks the API; then the desk can show bond-implied spreads)</li>
          <li><a href="https://www.sec.gov/data-research/sec-markets-data/form-n-port-data-sets" target="_blank" rel="noreferrer">SEC N-PORT data sets</a>: every fund's full holdings each quarter, incl. CDS with counterparties</li>
        </ul>
      </section>
    </div>
  );
}
