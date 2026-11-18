// Filings Intel on the Company page: what changed in the filings and calls. Executive changes, 10-K risk factors added and
// dropped, customer concentration, earnings-call tone and words that changed, guidance vs what happened, analyst rating
// trend, efficiency vs peers, patents and lawsuits. Opens on demand (the calls and guidance use small free daily budgets).
import { useEffect, useState } from 'react';
import { Fresh } from './common';

const pc = (v: number | null | undefined, dp = 1) => (v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(dp)}%`);
const big = (v: number | null | undefined) => (v == null ? '—' : Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${Math.round(v).toLocaleString()}`);
const tone = (v: number | null | undefined) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}`);

function Calls({ sym }: { sym: string }) {
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); setD(await fetch(`/api/research?fn=intelcalls&symbol=${sym}`).then((r) => r.json()).catch((e) => ({ error: String(e) }))); setBusy(false); };
  return (
    <div className="fi-box">
      <h5>Earnings calls · tone and words that changed</h5>
      {!d && <button className="btn sm" onClick={run} disabled={busy}>{busy ? 'Reading two transcripts…' : 'Compare the last two calls'}</button>}
      {d?.error && <p className="small down">{d.error}</p>}
      {d && !d.error && <>
        <table className="ad-table"><thead><tr><th>Call</th><th className="r">Overall tone</th><th className="r">Management</th><th className="r">Analysts</th><th className="r">Questions</th></tr></thead><tbody>
          {[d.cur, d.prev].map((c: any) => <tr key={c.quarter}><td>{c.quarter}</td><td className="r num">{tone(c.tone)}</td><td className="r num">{tone(c.mgmt)}</td><td className="r num">{tone(c.analysts)}</td><td className="r num">{c.questions}</td></tr>)}
        </tbody></table>
        <div className="fi-words"><div><span className="small muted">Said more:</span> {d.words.up.map((w: any) => <span key={w.w} className="chip sm up">{w.w}</span>)}</div><div><span className="small muted">Said less:</span> {d.words.down.map((w: any) => <span key={w.w} className="chip sm down">{w.w}</span>)}</div></div>
        <p className="note">{d.source}</p>
      </>}
    </div>
  );
}

function Guidance({ sym }: { sym: string }) {
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); setD(await fetch(`/api/research?fn=intelguide&symbol=${sym}`).then((r) => r.json()).catch((e) => ({ error: String(e) }))); setBusy(false); };
  return (
    <div className="fi-box">
      <h5>Guidance · what they promised vs what happened</h5>
      {!d && <button className="btn sm" onClick={run} disabled={busy}>{busy ? 'Reading the last four earnings releases…' : 'Check their guidance record'}</button>}
      {d?.error && <p className="small down">{d.error}</p>}
      {d?.rows && (d.rows.filter((r: any) => r.found).length === 0 ? <p className="small muted">No numeric next-quarter revenue guidance found in the last four earnings releases (many companies don't give it).</p> : (
        <table className="ad-table"><thead><tr><th>Release</th><th>For</th><th className="r">Guided revenue</th><th className="r">Reported</th><th>Result</th></tr></thead><tbody>
          {d.rows.filter((r: any) => r.found).map((r: any) => <tr key={r.date} title={r.quote}><td><a href={r.url} target="_blank" rel="noreferrer noopener">{r.date}</a></td><td>{r.quarter ?? '—'}</td><td className="r num">{r.low === r.high ? big(r.low) : `${big(r.low)}–${big(r.high)}`}</td><td className="r num">{big(r.actual)}</td><td className={r.result === 'above' ? 'up' : r.result === 'below' ? 'down' : ''}>{r.result ? { above: 'beat the top', inside: 'inside the range', below: 'missed the bottom' }[r.result as 'above'] : 'not reported yet'}</td></tr>)}
        </tbody></table>
      ))}
      {d?.source && <p className="note">{d.source}</p>}
    </div>
  );
}

export function FilingsIntel({ sym }: { sym: string }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<any>(null);
  useEffect(() => { setD(null); }, [sym]);
  useEffect(() => { if (open && !d) fetch(`/api/research?fn=intel&symbol=${sym}`).then((r) => r.json()).then(setD).catch((e) => setD({ errors: { all: String(e) } })); }, [open, d, sym]);
  return (
    <section className="fi">
      <button className="fi-toggle" onClick={() => setOpen(!open)} aria-expanded={open}><h4>Filings Intel <span className="muted small">· risk factors, executives, calls, guidance, analysts, peers, patents, lawsuits</span></h4><span>{open ? '▾' : '▸'}</span></button>
      {open && !d && <p className="small muted">Reading SEC filings for {sym}…</p>}
      {open && d && (
        <div className="fi-grid">
          <div className="fi-box">
            <h5>Risk factors · new vs last year's 10-K <Fresh kind="eod" src="SEC EDGAR 10-K filings, Item 1A, compared paragraph by paragraph" /></h5>
            {d.errors?.risk && <p className="small down">{d.errors.risk}</p>}
            {!d.risk ? <p className="small muted">Needs two annual reports on EDGAR.</p> : <>
              <p className="small muted"><a href={d.risk.newer.url} target="_blank" rel="noreferrer noopener">{d.risk.newer.date}</a> vs <a href={d.risk.older.url} target="_blank" rel="noreferrer noopener">{d.risk.older.date}</a>: {d.risk.newCount} paragraphs now, {d.risk.oldCount} before.</p>
              <details open><summary className="small"><b className="down">Added ({d.risk.added.length})</b></summary><ul className="fi-list">{d.risk.added.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul></details>
              <details><summary className="small"><b className="up">Dropped ({d.risk.removed.length})</b></summary><ul className="fi-list">{d.risk.removed.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul></details>
            </>}
          </div>
          <div className="fi-box">
            <h5>Customer concentration</h5>
            {!d.risk?.customers?.length ? <p className="small muted">The latest 10-K doesn't name a customer's share of revenue.</p> : <ul className="fi-list">{d.risk.customers.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>}
            <h5>Executive changes · 8-K item 5.02</h5>
            {!d.execs.length ? <p className="small muted">None filed recently.</p> : <ul className="es-news">{d.execs.map((x: any) => <li key={x.url}><a href={x.url} target="_blank" rel="noreferrer noopener">{x.date}</a> <span className="small muted">officer or director change</span></li>)}</ul>}
          </div>
          <Calls sym={sym} />
          <Guidance sym={sym} />
          <div className="fi-box">
            <h5>Analyst ratings · last 4 months <Fresh kind="eod" src="Finnhub recommendation trends (free)" /></h5>
            {!d.keys.finnhub ? <p className="small muted">Needs the Finnhub key.</p> : !d.recs?.length ? <p className="small muted">{d.errors?.recs ?? 'No ratings.'}</p> : (
              <table className="ad-table"><thead><tr><th>Month</th><th className="r">Buy</th><th className="r">Hold</th><th className="r">Sell</th></tr></thead><tbody>
                {d.recs.map((r: any) => <tr key={r.period}><td>{r.period.slice(0, 7)}</td><td className="r num up">{r.strongBuy + r.buy}</td><td className="r num">{r.hold}</td><td className="r num down">{r.sell + r.strongSell}</td></tr>)}
              </tbody></table>
            )}
          </div>
          <div className="fi-box">
            <h5>Efficiency vs peers · trailing 12 months <Fresh kind="eod" src="Finnhub basic financials (free)" /></h5>
            {!d.peers?.length ? <p className="small muted">{d.errors?.peers ?? 'No peer data.'}</p> : (
              <table className="ad-table"><thead><tr><th>Ticker</th><th className="r">Revenue / employee</th><th className="r">Gross margin</th><th className="r">Operating margin</th><th className="r">Net margin</th><th className="r">Revenue growth</th></tr></thead><tbody>
                {d.peers.map((p: any) => <tr key={p.sym} className={p.sym === sym ? 'fi-me' : ''}><td><b>{p.sym}</b></td><td className="r num">{p.revPerEmployee == null ? '—' : `$${Math.round(p.revPerEmployee).toLocaleString()}`}</td><td className="r num">{pc(p.grossMargin)}</td><td className="r num">{pc(p.opMargin)}</td><td className="r num">{pc(p.netMargin)}</td><td className="r num">{pc(p.revGrowth)}</td></tr>)}
              </tbody></table>
            )}
          </div>
          <div className="fi-box">
            <h5>Patents granted</h5>
            {!d.keys.patents ? <p className="small muted">Needs a free USPTO key: request one at <a href="https://patentsview.org/apis/keyrequest" target="_blank" rel="noreferrer noopener">patentsview.org</a>, add <code>PATENTSVIEW_API_KEY</code> in Vercel and redeploy.</p>
              : d.patents ? <div className="pl-q">{d.patents.years.map((y: any) => <span key={y.year}><b className="num">{y.n.toLocaleString()}</b><span className="small muted">{y.year}{y.year === new Date().getFullYear() ? ' so far' : ''}</span></span>)}<span className="small muted">as "{d.patents.org}"</span></div> : <p className="small down">{d.errors?.patents}</p>}
          </div>
          <div className="fi-box">
            <h5>Lawsuits · federal courts</h5>
            {!d.keys.lawsuits ? <p className="small muted">Needs a free CourtListener token: sign up at <a href="https://www.courtlistener.com/sign-in/" target="_blank" rel="noreferrer noopener">courtlistener.com</a>, copy the API token from your profile, add <code>COURTLISTENER_TOKEN</code> in Vercel and redeploy.</p>
              : d.lawsuits ? <><p className="small">{d.lawsuits.total.toLocaleString()} dockets mention "{d.lawsuits.org}". Latest:</p><ul className="es-news">{d.lawsuits.cases.map((c: any, i: number) => <li key={i}><span className="num small muted">{c.filed}</span> {c.url ? <a href={c.url} target="_blank" rel="noreferrer noopener">{c.name}</a> : c.name} <span className="small muted">{c.court}{c.nature ? ` · ${c.nature}` : ''}</span></li>)}</ul></> : <p className="small down">{d.errors?.lawsuits}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
