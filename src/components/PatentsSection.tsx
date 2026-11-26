// Patents section on the Company page: filed vs granted per quarter (5 years), trend, peers, tech areas and the latest
// filings, from the USPTO Open Data Portal. Opens on demand. The server counts one quarter at a time (the USPTO key allows
// one call at a time), so a first look can take a few rounds; this keeps asking until every quarter is in.
import { Fragment, useEffect, useRef, useState } from 'react';
import { Fresh } from './common';

interface Q { label: string; done: boolean; filed: number | null; granted: number | null }
interface Row { gp?: string | null; fda?: string[] | null; pubNo?: string | null; cpc?: string[]; app: string; title: string; filed: string | null; published: string | null; granted: string | null; patentNo: string | null; status: string; kind: string; areas: string[] }
interface Data {
  error?: string; needsKey?: boolean; name?: string; names?: string[]; subsidiaries?: number; qForm?: string; complete?: boolean;
  quarters?: Q[]; trend?: { last: number; prior: number; pct: number; word: string } | null; latest?: Row[];
  mix?: { area: string; n: number; isNew: boolean }[]; peers?: { sym: string; name: string; last: number | null; prior: number | null }[];
  fda?: Drug[] | null; obAsOf?: string | null; nightly?: string; notes?: string[];
  errors?: Record<string, string>; source?: string;
}

const KIND: Record<string, string> = { granted: 'Granted', pending: 'Pending', abandoned: 'Abandoned', expired: 'Dropped (fees not paid)', other: '—' };
const pct = (a: number | null, b: number | null) => (a == null || b == null || b === 0 ? '—' : `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}%`);

/** JSON from a desk endpoint, or a plain-English error (a timeout or error page is HTML, not JSON). */
export async function getDeskJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const text = await r.text();
  try { return JSON.parse(text) as T; } catch {
    throw new Error(r.status === 504 ? 'The patent lookup took too long this time. It carries on where it stopped: try again in a minute.' : `The patent lookup did not answer properly (HTTP ${r.status}). Try again in a minute.`);
  }
}

/** Two lines over 20 quarters. Recent filed quarters are shaded: applications only become public ~18 months after filing. */
function Chart({ qs }: { qs: Q[] }) {
  const W = 640, H = 170, L = 34, R = 8, T = 10, B = 22;
  const max = Math.max(1, ...qs.flatMap((q) => [q.filed ?? 0, q.granted ?? 0]));
  const x = (i: number) => L + (i / Math.max(1, qs.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const line = (k: 'filed' | 'granted') => qs.map((q, i) => (q[k] == null ? '' : `${x(i).toFixed(1)},${y(q[k]!).toFixed(1)}`)).filter(Boolean).join(' ');
  const shadeFrom = x(Math.max(0, qs.length - 6));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="pt-chart" role="img" aria-label="Patents filed and granted per quarter">
      <rect x={shadeFrom} y={T} width={W - R - shadeFrom} height={H - T - B} className="pt-shade"><title>Filed counts for the last 18 months are still filling in: applications become public about 18 months after filing.</title></rect>
      {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} className="pt-grid" /><text x={L - 4} y={y(max * f) + 3} className="pt-ax" textAnchor="end">{Math.round(max * f)}</text></g>)}
      {qs.map((q, i) => (i % 4 === 0 ? <text key={q.label} x={x(i)} y={H - 6} className="pt-ax" textAnchor="middle">{q.label.slice(0, 4)}</text> : null))}
      <polyline points={line('filed')} className="pt-filed" />
      <polyline points={line('granted')} className="pt-granted" />
      {qs.map((q, i) => <g key={i}>{(['filed', 'granted'] as const).map((k) => (q[k] == null ? null : <circle key={k} cx={x(i)} cy={y(q[k]!)} r={2.6} className={`pt-dot pt-${k}`}><title>{`${q.label}: ${q[k]!.toLocaleString()} ${k}${q.done ? '' : ' (quarter in progress)'}`}</title></circle>))}</g>)}
    </svg>
  );
}

interface Drug { trade: string; ingredient: string; applicant: string; patents: { no: string; expires: string | null }[]; lastExpiry: string | null }
/** FDA Orange Book: the company's listed brand drugs and when their patents run out (a "patent cliff" view). */
function FdaBox({ drugs, asOf }: { drugs: Drug[]; asOf: string | null }) {
  const today = new Date().toISOString().slice(0, 10);
  const next = (d: Drug) => d.patents.find((p) => p.expires && p.expires >= today)?.expires ?? null;
  return (
    <div className="fi-box pt-wide">
      <h5>FDA-listed drugs · patent expiries <Fresh kind="eod" src={`FDA Orange Book${asOf ? `, file read ${asOf}` : ''} (updated about monthly)`} /></h5>
      <table className="ad-table"><thead><tr><th>Drug</th><th className="r">Listed patents</th><th>Next expiry</th><th>Last expiry</th></tr></thead><tbody>
        {drugs.map((d) => (
          <tr key={d.trade} title={`${d.applicant} · patents: ${d.patents.map((p) => `${p.no} (${p.expires ?? '?'})`).join(', ')}`}>
            <td><b>{d.trade}</b> <span className="small muted">{d.ingredient.toLowerCase()}</span></td>
            <td className="r num">{d.patents.length}</td><td className="num small">{next(d) ?? 'all past'}</td>
            <td className={`num small${d.lastExpiry && d.lastExpiry < String(new Date().getFullYear() + 3) ? ' down' : ''}`}>{d.lastExpiry ?? '—'}</td>
          </tr>
        ))}
      </tbody></table>
      <p className="note small">Hard evidence: these patents cover drugs the FDA has approved. Red = the last listed patent runs out within about 3 years (generics can follow; other protections such as exclusivity are not shown). The Orange Book lists pill-type (small-molecule) drugs only: vaccines and antibodies are not in it.</p>
    </div>
  );
}

type Ev = { app: string; verdict: 'in_products' | 'in_development' | 'no_evidence'; quote: string; dropped: boolean };
const EV: Record<Ev['verdict'], string> = { in_products: 'In products (AI guess)', in_development: 'In development (AI guess)', no_evidence: 'No 10-K evidence' };

/** Latest filings: evidence column (FDA, AI check on demand) and a "What is it?" line per patent. */
function Latest({ rows, sym }: { rows: Row[]; sym: string }) {
  const [ev, setEv] = useState<{ items?: Ev[]; error?: string; model?: string | null; filing?: { date: string; url: string }; note?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Record<string, { abstract?: string | null; plain?: string | null; model?: string | null; url?: string; error?: string } | 'loading'>>({});
  useEffect(() => { setEv(null); setOpen({}); }, [sym]);
  const check = () => { setBusy(true); getDeskJson<any>(`/api/research?fn=patentrollout&symbol=${sym}`).then(setEv).catch((e) => setEv({ error: (e as Error).message })).finally(() => setBusy(false)); };
  const what = (r: Row) => {
    if (!r.gp) return;
    if (open[r.app]) { const n = { ...open }; delete n[r.app]; setOpen(n); return; }
    setOpen((o) => ({ ...o, [r.app]: 'loading' }));
    getDeskJson<any>(`/api/research?fn=patentabstract&id=${encodeURIComponent(r.gp)}&title=${encodeURIComponent(r.title)}`).then((j) => setOpen((o) => ({ ...o, [r.app]: j })))
      .catch((e) => setOpen((o) => ({ ...o, [r.app]: { error: (e as Error).message } })));
  };
  const byApp = new Map((ev?.items ?? []).map((x) => [x.app, x]));
  return (
    <div className="fi-box pt-wide">
      <h5>Latest filings made public</h5>
      <div className="pt-ev-bar">
        {!ev && <button className="btn sm" onClick={check} disabled={busy}>{busy ? 'Reading the 10-K…' : 'Check which are in products (AI guess)'}</button>}
        {ev?.error && <span className="small down">{ev.error}</span>}
        {ev?.items && <span className="small muted">AI guess from the {ev.filing ? <a href={ev.filing.url} target="_blank" rel="noreferrer noopener">10-K filed {ev.filing.date}</a> : '10-K'}{ev.model ? ` · ${ev.model}` : ''}. Hover a verdict for the quote; every quote was checked to be in the filing.</span>}
      </div>
      <table className="ad-table pt-table"><thead><tr><th>Title</th><th>Filed</th><th>Public</th><th>Granted</th><th>Status</th><th>Evidence</th><th>Tech area</th></tr></thead><tbody>
        {rows.map((r) => {
          const e = byApp.get(r.app), o = open[r.app];
          return (
            <Fragment key={r.app}>
              <tr>
                <td><a href={`https://patentcenter.uspto.gov/applications/${encodeURIComponent(r.app)}`} target="_blank" rel="noreferrer noopener">{r.title || '(no title)'}</a>{r.patentNo && <span className="small muted"> · US {r.patentNo}</span>}
                  {r.gp && <> <button className="pt-what" onClick={() => what(r)} aria-expanded={!!o}>{o ? 'hide' : 'What is it?'}</button></>}</td>
                <td className="num small">{r.filed ?? '—'}</td><td className="num small">{r.published ?? '—'}</td><td className="num small">{r.granted ?? '—'}</td>
                <td className={`small pt-${r.kind}`} title={r.status}>{KIND[r.kind] ?? r.status}</td>
                <td className="small">
                  {r.fda?.length ? <span className="chip sm up" title="Listed in the FDA Orange Book for an approved drug">In use (FDA): {r.fda.slice(0, 2).join(', ')}</span>
                    : e ? <span className={`pt-ev pt-ev-${e.verdict}`} title={e.quote ? `10-K: "${e.quote}"` : e.dropped ? 'The AI gave a quote that is not in the 10-K, so it was discarded.' : 'The 10-K does not mention this technology. That does not mean it is unused.'}>{EV[e.verdict]}</span>
                    : <span className="muted">—</span>}
                </td>
                <td className="small" title={r.cpc?.length ? `Classification codes: ${r.cpc.join(', ')}` : undefined}>{r.areas.join(', ')}</td>
              </tr>
              {o && (
                <tr className="pt-what-row"><td colSpan={7}>
                  {o === 'loading' ? <span className="small muted">Opening the patent…</span> : o.error ? <span className="small down">{o.error}</span> : <>
                    {o.plain && <p className="small"><b>In plain English:</b> {o.plain} <span className="muted">(AI summary of the abstract{o.model ? `, ${o.model}` : ''}; can be wrong)</span></p>}
                    {o.abstract ? <p className="small muted">Abstract: {o.abstract}</p> : <p className="small muted">No abstract found on the public patent page.</p>}
                    {o.url && <a className="small" href={o.url} target="_blank" rel="noreferrer noopener">Full patent on Google Patents (public page)</a>}
                  </>}
                </td></tr>
              )}
            </Fragment>
          );
        })}
      </tbody></table>
      <p className="note small">Titles open the official record in USPTO Patent Center. "In use (FDA)" is hard evidence. AI verdicts are a guess from the latest 10-K and can be wrong; "No 10-K evidence" means the annual report does not say, not that the technology is unused.</p>
    </div>
  );
}

/** The whole patents view for one ticker. Asks the server until every quarter is counted. */
export function PatentsView({ sym, open = true }: { sym: string; open?: boolean }) {
  const [d, setD] = useState<Data | null>(null);
  const [live, setLive] = useState(false);
  const tries = useRef(0);
  useEffect(() => { setD(null); tries.current = 0; setLive(false); }, [sym]);
  useEffect(() => {
    if (!open || (d && (d.complete || d.error || d.needsKey))) return;
    let stop = false;
    const go = () => getDeskJson<Data>(`/api/research?fn=patents&symbol=${sym}${live ? '&live=1' : ''}`).then((j: Data) => { if (!stop) { tries.current += 1; setD(j); } })
      .catch((e) => { if (!stop) setD({ error: (e as Error).message ?? String(e) }); });
    // first ask now; while counting continues, ask again every 3 s (at most ~2 minutes)
    const t = setTimeout(go, d ? 3000 : 0);
    if (tries.current > 40) setD({ ...(d ?? {}), complete: true, errors: { ...(d?.errors ?? {}), counts: 'stopped waiting; open the section again to continue' } });
    return () => { stop = true; clearTimeout(t); };
  }, [open, d, sym, live]);

  const qs = d?.quarters ?? [];
  const have = qs.reduce((s, q) => s + (q.filed != null ? 1 : 0) + (q.granted != null ? 1 : 0), 0);
  return (
    <>
      {open && !d && <p className="small muted">Looking up {sym}'s patents at the USPTO…</p>}
      {open && d?.error && <p className="small down">{d.error}</p>}
      {open && d?.needsKey && <p className="small muted">Needs a free USPTO Open Data Portal key (<code>USPTO_API_KEY</code> in Vercel). Make a USPTO.gov account, then get a key at <a href="https://data.uspto.gov/apis/getting-started" target="_blank" rel="noreferrer noopener">data.uspto.gov</a>.</p>}
      {open && d && !d.error && !d.needsKey && (
        <div className="fi-grid pt">
          <div className="fi-box pt-wide">
            <h5>Filed vs granted per quarter · 5 years <Fresh kind="eod" src="USPTO Open Data Portal (official, refreshed daily)" /></h5>
            {d.nightly && <p className="small muted">From the nightly check, {new Date(d.nightly).toLocaleString()} · <button className="pt-what" onClick={() => { tries.current = 0; setLive(true); setD(null); }}>check the USPTO now</button></p>}
            {!!d.notes?.length && <ul className="small pt-notes">{d.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
            <p className="small muted">Searched as {d.names?.map((n) => <span key={n} className="chip sm">{n}</span>)} {d.subsidiaries ? `(company + matching names from ${d.subsidiaries} subsidiaries in its 10-K)` : '(no subsidiary list found in the 10-K)'} · {d.qForm}</p>
            {!d.complete && <p className="small muted">Counting quarter by quarter ({have} of {qs.length * 2} done)… the USPTO allows one lookup at a time, so a first look takes a moment. Saved after this.</p>}
            {qs.length > 0 && <Chart qs={qs} />}
            <p className="small"><span className="pt-key pt-filed" /> Filed (made public) <span className="pt-key pt-granted" /> Granted
              {d.trend && <> · Granted in the last 12 months: <b className="num">{d.trend.last.toLocaleString()}</b> vs <span className="num">{d.trend.prior.toLocaleString()}</span> the year before (<b className={d.trend.pct >= 0 ? 'up' : 'down'}>{d.trend.pct >= 0 ? '+' : ''}{Math.round(d.trend.pct)}%</b>, {d.trend.word})</>}</p>
            <p className="note small">Shaded: the last 18 months of filings are still filling in, because applications become public about 18 months after they are filed. Counts are US utility patents and applications naming one of the names above as applicant or owner.</p>
          </div>
          {!!d.peers?.length && (
            <div className="fi-box">
              <h5>Peers · granted, last 12 months</h5>
              <table className="ad-table"><thead><tr><th>Company</th><th className="r">Last 12 mo</th><th className="r">Year before</th><th className="r">Change</th></tr></thead><tbody>
                {(() => { const me = d.trend ? { sym, name: d.name ?? sym, last: d.trend.last, prior: d.trend.prior } : null; return [...(me ? [me] : []), ...d.peers!]; })().map((p) => (
                  <tr key={p.sym} className={p.sym === sym ? 'fi-me' : ''}><td><b>{p.sym}</b> <span className="small muted">{p.name}</span></td><td className="r num">{p.last?.toLocaleString() ?? '…'}</td><td className="r num">{p.prior?.toLocaleString() ?? '…'}</td><td className="r num">{pct(p.last, p.prior)}</td></tr>
                ))}
              </tbody></table>
              <p className="note small">Peers are searched the same way: company name plus matching subsidiaries from their 10-K. Patents held under unrelated names (acquired companies) can still be missed.</p>
            </div>
          )}
          {!!d.mix?.length && (
            <div className="fi-box">
              <h5>Tech areas · latest {d.latest?.length ?? 0} filings</h5>
              <div className="pt-mix">{d.mix.map((m) => <span key={m.area} className={`chip sm${m.isNew ? ' up' : ''}`} title={m.isNew ? 'Filed in this year, not in the older filings listed' : undefined}>{m.area} <b className="num">{m.n}</b>{m.isNew ? ' · new' : ''}</span>)}</div>
              <p className="note small">From the patents' official classification codes. "New" means it shows up this year and not in the older filings in this list.</p>
            </div>
          )}
          {!!d.fda?.length && <FdaBox drugs={d.fda} asOf={d.obAsOf ?? null} />}
          {!!d.latest?.length && <Latest rows={d.latest} sym={sym} />}
          {d.errors && Object.keys(d.errors).length > 0 && <p className="small muted pt-wide">Some parts did not load: {Object.entries(d.errors).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}
          {d.source && <p className="note small pt-wide">{d.source}. Research only, not advice.</p>}
        </div>
      )}
    </>
  );
}

export function PatentsSection({ sym }: { sym: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="fi">
      <button className="fi-toggle" onClick={() => setOpen(!open)} aria-expanded={open}><h4>Patents <span className="muted small">· filed vs granted, latest filings, tech areas, peers</span></h4><span>{open ? '▾' : '▸'}</span></button>
      {open && <PatentsView sym={sym} />}
    </section>
  );
}
