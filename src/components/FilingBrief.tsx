// Filing brief on the Company page: pick a recent 10-Q, 10-K or earnings release and get the official numbers (SEC XBRL),
// a short AI brief whose every point quotes the filing (quotes checked on the server), and recent insider buys and sells.
// Opens on demand. Facts from filings, not advice.
import { useEffect, useState } from 'react';
import { getDeskJson } from './PatentsSection';
import { Fresh } from './common';

interface Pt { end: string; label: string; revenue: number | null; netIncome: number | null; eps: number | null; grossMargin: number | null; opMargin: number | null; netMargin: number | null; fcf: number | null; shares: number | null; cash: number | null; debt: number | null }
interface Resp {
  error?: string; name?: string; choices?: { acc: string; kind: string; date: string; form: string }[];
  filing?: { acc: string; kind: string; date: string; url: string; period: string | null };
  numbers?: { cur: Pt; yearAgo: Pt | null; prior: Pt | null; basis: 'quarter' | 'year' } | null;
  brief?: { headline: string; points: { topic: string; text: string; quote: string }[]; dropped: number; model: string | null } | null;
  insiders?: { since: string; buys: { n: number; value: number }; sells: { n: number; value: number }; rows: { date: string; who: string; role: string; code: string; shares: number; price: number | null; value: number | null; url: string }[] } | null;
  errors?: Record<string, string>; source?: string;
}

const money = (v: number | null | undefined) => (v == null ? '—' : Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${Math.round(v).toLocaleString()}`);
const pct = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1)}%`);
const chg = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null || b === 0 ? null : ((a - b) / Math.abs(b)) * 100);
const ROWS: { k: keyof Pt; label: string; fmt: (v: number | null) => string; isPct?: boolean }[] = [
  { k: 'revenue', label: 'Revenue', fmt: money }, { k: 'netIncome', label: 'Net income', fmt: money }, { k: 'eps', label: 'EPS (diluted)', fmt: (v) => (v == null ? '—' : `$${v.toFixed(2)}`) },
  { k: 'grossMargin', label: 'Gross margin', fmt: pct, isPct: true }, { k: 'opMargin', label: 'Operating margin', fmt: pct, isPct: true }, { k: 'fcf', label: 'Free cash flow', fmt: money },
  { k: 'cash', label: 'Cash', fmt: money }, { k: 'debt', label: 'Debt', fmt: money }, { k: 'shares', label: 'Shares out', fmt: (v) => (v == null ? '—' : `${(v / 1e6).toFixed(0)}M`) },
];
const KIND: Record<string, string> = { '10-Q': 'Quarterly report (10-Q)', '10-K': 'Annual report (10-K)', earnings: 'Earnings release (8-K)' };

function Change({ a, b, isPct }: { a: number | null; b: number | null | undefined; isPct?: boolean }) {
  if (a == null || b == null) return <span className="muted">—</span>;
  if (isPct) { const d = a - b; return <span className={d > 0 ? 'up' : d < 0 ? 'down' : ''}>{d >= 0 ? '+' : ''}{d.toFixed(1)} pts</span>; }
  const c = chg(a, b);
  if (c == null) return <span className="muted">—</span>;
  const r = Math.round(c);
  return <span className={r > 0 ? 'up' : r < 0 ? 'down' : ''}>{r > 0 ? '+' : ''}{r === 0 ? '0' : r}%</span>; // no "-0%" for tiny drops
}

export function FilingBrief({ sym }: { sym: string }) {
  const [open, setOpen] = useState(false);
  const [acc, setAcc] = useState('');
  const [d, setD] = useState<Resp | null>(null);
  useEffect(() => { setD(null); setAcc(''); }, [sym]);
  useEffect(() => {
    if (!open) return;
    let stop = false;
    setD(null);
    getDeskJson<Resp>(`/api/research?fn=filingbrief&symbol=${sym}${acc ? `&acc=${acc}` : ''}`).then((j) => { if (!stop) setD(j); }).catch((e) => { if (!stop) setD({ error: (e as Error).message }); });
    return () => { stop = true; };
  }, [open, sym, acc]);
  const n = d?.numbers;
  return (
    <section className="fi">
      <button className="fi-toggle" onClick={() => setOpen(!open)} aria-expanded={open}><h4>Filing brief <span className="muted small">· latest 10-Q, 10-K or earnings release: numbers, what changed, insider trades</span></h4><span>{open ? '▾' : '▸'}</span></button>
      {open && !d && <p className="small muted">Reading {sym}'s filing at the SEC… a first read can take up to a minute.</p>}
      {open && d?.error && <p className="small down">{d.error}</p>}
      {open && d && !d.error && (
        <div className="fi-grid fb">
          <div className="fi-box pt-wide">
            <div className="pt-ev-bar">
              <select value={d.filing?.acc ?? ''} onChange={(e) => setAcc(e.target.value)} aria-label="Filing">
                {(d.choices ?? []).map((c) => <option key={c.acc} value={c.acc}>{c.date} · {KIND[c.kind] ?? c.form}</option>)}
              </select>
              {d.filing && <a className="small" href={d.filing.url} target="_blank" rel="noreferrer noopener">Open the filing</a>}
              {d.filing?.period && <span className="small muted">period ended {d.filing.period}</span>}
            </div>
          </div>
          {n && (
            <div className="fi-box">
              <h5>Numbers · {n.basis === 'year' ? `fiscal year ${n.cur.label}` : n.cur.label} <Fresh kind="eod" src="SEC XBRL financial data (official, from the filings)" /></h5>
              <table className="ad-table"><thead><tr><th /><th className="r">This {n.basis}</th><th className="r">vs a year ago</th>{n.basis === 'quarter' && <th className="r">vs last quarter</th>}</tr></thead><tbody>
                {ROWS.filter((r) => n.cur[r.k] != null).map((r) => (
                  <tr key={r.k}><td>{r.label}</td><td className="r num">{r.fmt(n.cur[r.k] as number | null)}</td>
                    <td className="r num"><Change a={n.cur[r.k] as number | null} b={n.yearAgo?.[r.k] as number | null | undefined} isPct={r.isPct} /></td>
                    {n.basis === 'quarter' && <td className="r num"><Change a={n.cur[r.k] as number | null} b={n.prior?.[r.k] as number | null | undefined} isPct={r.isPct} /></td>}</tr>
                ))}
              </tbody></table>
              <p className="note small">Official numbers the company reported to the SEC (XBRL). Margins change in percentage points.</p>
            </div>
          )}
          {d.insiders && (
            <div className="fi-box">
              <h5>Insiders · open-market trades since {d.insiders.since} <Fresh kind="eod" src="SEC Form 4 filings" /></h5>
              <p className="small">Buys: <b className="num">{d.insiders.buys.n}</b> ({money(d.insiders.buys.value)}) · Sells: <b className="num">{d.insiders.sells.n}</b> ({money(d.insiders.sells.value)})</p>
              {d.insiders.rows.length > 0 && <table className="ad-table"><tbody>{d.insiders.rows.slice(0, 8).map((t, i) => (
                <tr key={i}><td className="num small">{t.date}</td><td className="small">{t.who} <span className="muted">{t.role}</span></td><td className={`small ${t.code === 'P' ? 'up' : 'down'}`}>{t.code === 'P' ? 'Buy' : 'Sell'}</td><td className="r num small">{money(t.value)}</td></tr>
              ))}</tbody></table>}
              <p className="note small">Open-market buys (code P) and sells (code S) only; option exercises, awards and tax withholding are left out. Planned sales (10b5-1) look the same here.</p>
            </div>
          )}
          {d.brief && (
            <div className="fi-box pt-wide">
              <h5>What the {d.filing?.kind === 'earnings' ? 'release' : 'filing'} says <span className="small muted">AI brief{d.brief.model ? ` · ${d.brief.model}` : ''}; every point quotes the filing</span></h5>
              {d.brief.headline && <p><b>{d.brief.headline}</b></p>}
              {d.brief.points.length ? <ul className="fb-points">{d.brief.points.map((p, i) => (
                <li key={i} title={`Filing: "${p.quote}"`}><span className="chip sm">{p.topic}</span> {p.text}</li>
              ))}</ul> : <p className="small muted">The AI found nothing it could back with a quote from this filing.</p>}
              <p className="note small">Hover a point to see the exact sentence from the filing. {d.brief.dropped ? `${d.brief.dropped} point${d.brief.dropped === 1 ? ' was' : 's were'} left out because the quote was not in the filing. ` : ''}AI summaries can be wrong: check the filing for anything you act on.</p>
            </div>
          )}
          {d.errors && Object.keys(d.errors).length > 0 && <p className="small muted pt-wide">Some parts did not load: {Object.entries(d.errors).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}
          {d.source && <p className="note small pt-wide">{d.source} Research only, not advice.</p>}
        </div>
      )}
    </section>
  );
}
