// Smart money: what big investors (13F), ARK (daily) and members of Congress (disclosures) are buying and selling.
import { useMemo, useState, type ReactNode } from 'react';
import { FAMOUS_POLS, FUNDS, usd, type Change, type F13Pos } from '../../shared/smartmoney';
import { MEMBERS } from '../../shared/data/congress';
import { useApi } from '../data/apis';
import type { DataMode } from '../data/live';
import { usePersisted } from '../lib/store';
import { Fresh, Seg, PageTabs } from './common';

type Tab = 'funds' | 'ark' | 'pols';
// what each change means, shown on hover (EXITED rows show last quarter's value and shares, since they now hold none)
const CHG_HINT: Record<Change, string> = { new: 'New position this quarter', added: 'Bought more shares than last quarter', trimmed: 'Sold some shares, still holds the rest', sold: 'Sold the whole position: held it last quarter, holds none now. Value and shares are from last quarter.', same: 'Same number of shares as last quarter' };
const CHG_LABEL: Record<Change, string> = { new: 'NEW', added: 'ADDED', trimmed: 'TRIMMED', sold: 'EXITED', same: 'HELD' };
const fmtDate = (d: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const Sym = ({ s, onChart }: { s: string | null; onChart: (s: string) => void }) => (s ? <button className="sym-chip" onClick={() => onChart(s)} title="Open chart">{s}</button> : <span className="muted">—</span>);

interface F13Resp { filer: string; period: string; filed: string; prevPeriod: string | null; total: number; count: number; positions: (F13Pos & { sym: string | null })[]; url: string; asOf: number; stale?: boolean; source: string }

function Funds({ onChart }: { onChart: (s: string) => void }) {
  const [cik, setCik] = usePersisted<string>('smFund', FUNDS[0].cik);
  const [flt, setFlt] = useState<'all' | Change>('all');
  const r = useApi<F13Resp>(`/api/research?fn=13f&cik=${cik}`, 0, 6 * 3600_000);
  const fund = FUNDS.find((f) => f.cik === cik)!;
  const d = r.data;
  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const p of d?.positions ?? []) c[p.change] = (c[p.change] ?? 0) + 1; return c; }, [d]);
  const rows = (d?.positions ?? []).filter((p) => flt === 'all' || p.change === flt);
  const top10 = (d?.positions ?? []).filter((p) => p.change !== 'sold').slice(0, 10).reduce((s, p) => s + p.weight, 0);
  return (
    <div className="sm-split">
      <aside className="sm-list">
        {FUNDS.map((f) => (
          <button key={f.cik} className={`sm-fund ${f.cik === cik ? 'on' : ''}`} onClick={() => { setCik(f.cik); setFlt('all'); }}>
            <b>{f.who}</b><span>{f.firm}</span><span className="muted small">{f.style}</span>
          </button>
        ))}
      </aside>
      <section className="sm-main">
        <div className="sm-head">
          <div>
            <h3>{fund.who} <span className="muted">· {d?.filer || fund.firm}</span></h3>
            {d && <p className="small muted">Holdings as of <b>{fmtDate(d.period)}</b> (filed {fmtDate(d.filed)}){d.prevPeriod ? `, compared with ${fmtDate(d.prevPeriod)}` : ''}. 13Fs come out up to 45 days after each quarter, so these are not live positions, and they only show US-listed longs (plus puts/calls).</p>}
          </div>
          {d && <Fresh kind="eod" at={d.asOf} src={d.source} />}
        </div>
        {r.loading && !d && <p className="muted">Reading the filing from SEC EDGAR… (first load can take ~10 s)</p>}
        {r.error && !d && <p className="down small">{r.error}</p>}
        {d && (
          <>
            <div className="sm-stats">
              <div><span className="muted small">Reported value</span><b>{usd(d.total)}</b></div>
              <div><span className="muted small">Positions</span><b>{d.count}</b></div>
              <div><span className="muted small">Top 10 = </span><b>{Math.round(top10 * 100)}%</b></div>
              <div className="sm-flt">
                {(['all', 'new', 'added', 'trimmed', 'sold'] as const).map((k) => (
                  <button key={k} className={`chip sm ${flt === k ? 'on' : ''} ${k !== 'all' ? `c-${k}` : ''}`} onClick={() => setFlt(k)}>{k === 'all' ? 'All' : CHG_LABEL[k]} {k !== 'all' && <span className="muted">{counts[k] ?? 0}</span>}</button>
                ))}
              </div>
            </div>
            <div className="sm-tblwrap">
              <table className="sm-tbl">
                <thead><tr><th>Ticker</th><th>Company</th><th className="r">% of fund</th><th className="r">Value</th><th className="r">Shares</th><th>Change vs last qtr</th></tr></thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.key} className={p.change === 'sold' ? 'dim' : ''}>
                      <td><Sym s={p.sym} onChart={onChart} />{p.putCall && <span className="tag">{p.putCall}</span>}</td>
                      <td className="sm-name" title={`${p.name} · ${p.cls} · CUSIP ${p.cusip}`}>{p.name}</td>
                      <td className="r"><span className="sm-wbar"><i style={{ width: `${Math.min(100, p.weight * 100 * 2)}%` }} /></span>{(p.weight * 100).toFixed(1)}%</td>
                      <td className="r num">{usd(p.change === 'sold' ? p.prevValue : p.value)}</td>
                      <td className="r num">{(p.change === 'sold' ? p.prevShares : p.shares).toLocaleString()}</td>
                      <td><span className={`sm-chg c-${p.change}`} title={CHG_HINT[p.change]}>{CHG_LABEL[p.change]}</span>{p.chgPct != null && p.change !== 'sold' && p.change !== 'same' && <span className="small muted"> {p.chgPct > 0 ? '+' : ''}{p.chgPct.toFixed(0)}% shares</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && <p className="muted small hw-pad">Nothing in this group.</p>}
            </div>
            <p className="note">Top 60 holdings plus the biggest sell-outs. <a href={d.url} target="_blank" rel="noreferrer noopener">All filings on SEC EDGAR</a>. Tickers are matched from CUSIPs (OpenFIGI) or issuer names; a dash means no match.</p>
          </>
        )}
      </section>
    </div>
  );
}

interface ArkResp { trades: { fund: string; date: string; sym: string; company: string; dir: 'Buy' | 'Sell'; shares: number; pct: number }[]; net: { sym: string; company: string; buys: number; sells: number; netShares: number; days: number; last: string; funds: string[] }[]; asOf: number; source: string }
function Ark({ onChart }: { onChart: (s: string) => void }) {
  const r = useApi<ArkResp>('/api/research?fn=ark', 30 * 60_000, 20 * 60_000);
  const [fund, setFund] = usePersisted<string>('smArkFund', 'all');
  const d = r.data;
  const trades = (d?.trades ?? []).filter((t) => fund === 'all' || t.fund === fund);
  const byDay = useMemo(() => { const m = new Map<string, typeof trades>(); for (const t of trades) m.set(t.date, [...(m.get(t.date) ?? []), t]); return [...m.entries()]; }, [trades]);
  return (
    <div className="sm-ark">
      <div className="sm-head">
        <div><h3>Cathie Wood · ARK daily trades</h3><p className="small muted">ARK publishes every buy and sell each evening. "% of ETF" is how big the trade was relative to that fund.</p></div>
        {d ? <Fresh kind="eod" at={d.asOf} src={d.source} /> : null}
      </div>
      {r.loading && !d && <p className="muted">Loading…</p>}
      {r.error && !d && <p className="down small">{r.error}</p>}
      {d && (
        <div className="sm-ark-grid">
          <section>
            <h4>Most active, last 5 weeks</h4>
            <table className="sm-tbl">
              <thead><tr><th>Ticker</th><th>Buys</th><th>Sells</th><th>Days</th><th className="r">Net shares</th><th>Last</th></tr></thead>
              <tbody>{d.net.slice(0, 25).map((n) => (
                <tr key={n.sym || n.company}><td><Sym s={n.sym} onChart={onChart} /> <span className="small muted">{n.company.slice(0, 22)}</span></td><td className="up">{n.buys || ''}</td><td className="down">{n.sells || ''}</td><td>{n.days}</td><td className={`r num ${n.netShares >= 0 ? 'up' : 'down'}`}>{n.netShares >= 0 ? '+' : ''}{n.netShares.toLocaleString()}</td><td className="small muted">{n.last.slice(5)}</td></tr>
              ))}</tbody>
            </table>
          </section>
          <section>
            <div className="sm-row"><h4>Trade log</h4><Seg value={fund} onChange={setFund} options={[{ id: 'all', label: 'All' }, ...['ARKK', 'ARKW', 'ARKG', 'ARKQ', 'ARKF', 'ARKX'].map((f) => ({ id: f, label: f }))]} /></div>
            <div className="sm-log">{byDay.slice(0, 15).map(([day, ts]) => (
              <div key={day} className="sm-day"><div className="sm-dayh">{fmtDate(day)}</div>
                {ts.map((t, i) => <div key={i} className="sm-trade"><span className={`sm-dir ${t.dir === 'Buy' ? 'up' : 'down'}`}>{t.dir.toUpperCase()}</span><Sym s={t.sym} onChart={onChart} /><span className="small muted sm-co">{t.company}</span><span className="small">{t.shares.toLocaleString()} sh</span><span className="tag">{t.fund}</span><span className="small muted">{t.pct.toFixed(2)}%</span></div>)}
              </div>
            ))}</div>
          </section>
        </div>
      )}
    </div>
  );
}

interface PolResp { id: string; name: string; party: string; state: string; chamber: string; trades: { sym: string | null; asset: string; type: string; traded: string; filed: string; min: number | null; max: number | null; owner: string; option: boolean }[]; book: { sym: string; asset: string; buys: number; sells: number; bought: number; sold: number; first: string; last: string; lastType: string; option: boolean; net: number; status: 'likely held' | 'sold' | 'mixed' }[]; asOf: number; source: string }
const range = (a: number | null, b: number | null) => (a == null ? '—' : `${usd(a)}–${b == null ? '?' : usd(b)}`);
function Pols({ onChart }: { onChart: (s: string) => void }) {
  const [id, setId] = usePersisted<string>('smPol', FAMOUS_POLS[0]);
  const [q, setQ] = useState('');
  const [view, setView] = usePersisted<'book' | 'trades'>('smPolView', 'book');
  const r = useApi<PolResp>(`/api/research?fn=politician&id=${id}`, 0, 6 * 3600_000);
  const ql = q.trim().toLowerCase();
  const hits = ql ? MEMBERS.filter((m) => m[1].toLowerCase().includes(ql) || m[3].toLowerCase() === ql).slice(0, 12) : [];
  const famous = FAMOUS_POLS.map((p) => MEMBERS.find((m) => m[0] === p)).filter((m): m is (typeof MEMBERS)[number] => !!m);
  const d = r.data?.id === id ? r.data : null;
  const pick = (x: string) => { setId(x); setQ(''); };
  return (
    <div className="sm-split">
      <aside className="sm-list">
        <input className="lib-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any member or state…" aria-label="Search members of Congress" />
        {(hits.length ? hits : famous).map((m) => (
          <button key={m[0]} className={`sm-fund ${m[0] === id ? 'on' : ''}`} onClick={() => pick(m[0])}>
            <b>{m[1]}</b><span className="small"><span className={`pty p-${m[2]}`}>{m[2]}</span> {m[3]} · {m[4] === 'S' ? 'Senate' : 'House'}</span>
          </button>
        ))}
      </aside>
      <section className="sm-main">
        <div className="sm-head">
          <div>
            <h3>{d?.name ?? MEMBERS.find((m) => m[0] === id)?.[1] ?? id} {d && <span className="small"><span className={`pty p-${d.party}`}>{d.party}</span> {d.state}</span>}</h3>
            <p className="small muted">Built from STOCK Act disclosures: amounts are ranges, trades are filed up to 45 days late, and spouse trades count. “Est. bought / sold” use the middle of each range, so they are estimates, not real balances.</p>
          </div>
          <div className="sm-row">
            <Seg value={view} onChange={setView} options={[{ id: 'book', label: 'Portfolio' }, { id: 'trades', label: 'All trades' }]} />
            {d && <Fresh kind="eod" at={d.asOf} src={d.source} />}
          </div>
        </div>
        {r.loading && !d && <p className="muted">Loading disclosures…</p>}
        {r.error && !d && <p className="down small">{r.error}</p>}
        {d && !d.trades.length && <p className="muted">No disclosed stock trades on file for this member.</p>}
        {d && d.trades.length > 0 && view === 'book' && (
          <div className="sm-tblwrap">
            <table className="sm-tbl">
              <thead><tr><th>Ticker</th><th>Status</th><th className="r">Est. bought</th><th className="r">Est. sold</th><th>Trades</th><th>Last trade</th></tr></thead>
              <tbody>{d.book.map((b) => (
                <tr key={b.sym} className={b.status === 'sold' ? 'dim' : ''}>
                  <td><Sym s={b.sym} onChart={onChart} />{b.option && <span className="tag">options</span>} <span className="small muted">{b.asset.replace(/\s*\[.*\]$/, '').slice(0, 34)}</span></td>
                  <td><span className={`sm-chg ${b.status === 'likely held' ? 'c-added' : b.status === 'sold' ? 'c-sold' : 'c-same'}`}>{b.status.toUpperCase()}</span></td>
                  <td className="r num">{b.bought ? usd(b.bought) : ''}</td><td className="r num">{b.sold ? usd(b.sold) : ''}</td>
                  <td className="small"><span className="up">{b.buys}B</span> / <span className="down">{b.sells}S</span></td>
                  <td className="small">{fmtDate(b.last)} <span className={b.lastType === 'BUY' ? 'up' : 'down'}>{b.lastType}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {d && d.trades.length > 0 && view === 'trades' && (
          <div className="sm-tblwrap">
            <table className="sm-tbl">
              <thead><tr><th>Traded</th><th>Ticker</th><th>Type</th><th className="r">Amount</th><th>Owner</th><th>Filed</th></tr></thead>
              <tbody>{d.trades.map((t, i) => (
                <tr key={i}><td className="small">{fmtDate(t.traded)}</td><td><Sym s={t.sym} onChart={onChart} />{t.option && <span className="tag">opt</span>} {!t.sym && <span className="small muted">{t.asset.slice(0, 40)}</span>}</td><td className={/BUY|PURCHASE/.test(t.type) ? 'up' : /SELL|SALE/.test(t.type) ? 'down' : ''}>{t.type}</td><td className="r num">{range(t.min, t.max)}</td><td className="small muted">{t.owner.toLowerCase()}</td><td className="small muted">{fmtDate(t.filed)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="note">Each member costs one Alpha Vantage call (25/day free), cached 12 hours.</p>
      </section>
    </div>
  );
}

export default function SmartMoney({ mode, onChart, extra }: { mode: DataMode; onChart: (s: string) => void; extra?: ReactNode }) {
  const [tab, setTab] = usePersisted<Tab>('smTab', 'funds');
  const live = mode.kind === 'live';
  return (
    <div className="overlay" role="dialog" aria-label="Institutional Holdings">
      <div className="overlay-in sm">
        <div className="phead">
          <div className="phead-title">Institutional Holdings</div>
          <div className="phead-ctl">{extra}<PageTabs value={tab} onChange={setTab} options={[{ id: 'funds', label: 'Big investors (13F)' }, { id: 'ark', label: 'ARK daily' }, { id: 'pols', label: 'Politicians' }]} /></div>
        </div>
        <div className="sm-body">
          {!live ? <p className="hw-pad muted"><Fresh kind="demo" /> These trackers read real filings only, so they need the live desk (the deployed site with its server).</p>
            : tab === 'funds' ? <Funds onChart={onChart} /> : tab === 'ark' ? <Ark onChart={onChart} /> : <Pols onChart={onChart} />}
        </div>
      </div>
    </div>
  );
}
