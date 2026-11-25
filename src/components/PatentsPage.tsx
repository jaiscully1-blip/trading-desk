// Patents & Tech page: look up any company's patents, a theme radar across every sector (made public and granted in the
// last 90 days vs a year earlier, and who files most), and the watchlist's granted-patent trend. Official USPTO data.
// The USPTO key allows one call at a time, so first looks fill in over a few rounds; everything is saved after that.
import { useEffect, useState } from 'react';
import { RADAR_GROUPS } from '../../shared/patentRadar';
import { PatentsView, getDeskJson } from './PatentsSection';
import { Fresh } from './common';

/** Fetch until the server says complete (it stops each request after ~25 s and carries on next time). */
function usePoll<T extends { complete?: boolean; error?: string; needsKey?: boolean; unavailable?: boolean }>(url: string | null) {
  const [d, setD] = useState<T | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => { setD(null); setN(0); }, [url]);
  useEffect(() => {
    if (!url || (d && (d.complete || d.error || d.needsKey || d.unavailable)) || n > 40) return;
    let stop = false;
    const t = setTimeout(() => getDeskJson<T>(url).then((j: T) => { if (!stop) { setD(j); setN((x) => x + 1); } })
      .catch((e) => { if (!stop) setD({ error: (e as Error).message ?? String(e) } as T); }), d ? 3000 : 0);
    return () => { stop = true; clearTimeout(t); };
  }, [url, d, n]);
  return d;
}

const pctTxt = (cur: number | null, prev: number | null) => (cur == null || prev == null || prev === 0 ? '—' : `${cur >= prev ? '+' : ''}${Math.round(((cur - prev) / prev) * 100)}%`);
const pctCls = (cur: number | null, prev: number | null) => (cur == null || prev == null || prev === 0 ? '' : cur > prev * 1.1 ? 'up' : cur < prev * 0.9 ? 'down' : '');
const chg = (cur: number | null, prev: number | null) => (cur == null || prev == null || prev === 0 ? null : ((cur - prev) / prev) * 100);
/** Theme change minus the overall change, in points: is this theme gaining share of all patenting? */
function Rel({ t, b }: { t: number | null; b: number | null }) {
  if (t == null || b == null) return <span className="muted">—</span>;
  const d = t - b;
  return <span className={d >= 5 ? 'up' : d <= -5 ? 'down' : ''} title={`Theme ${t >= 0 ? '+' : ''}${Math.round(t)}% vs all patents ${b >= 0 ? '+' : ''}${Math.round(b)}%`}>{d >= 0 ? '+' : ''}{Math.round(d)} pts</span>;
}
const num = (v: number | null) => (v == null ? '…' : v.toLocaleString());

interface Radar {
  base?: { cur: { published: number | null; granted: number | null }; prev: { published: number | null; granted: number | null } };
  error?: string; needsKey?: boolean; unavailable?: boolean; why?: string; complete?: boolean; windows?: { cur: { from: string; to: string }; prev: { from: string; to: string } };
  themes?: { id: string; label: string; group: string; cur: { published: number | null; granted: number | null }; prev: { published: number | null; granted: number | null }; top: { name: string; n: number }[]; unmatched?: boolean }[];
  errors?: Record<string, string>; source?: string;
}
function RadarPanel() {
  const d = usePoll<Radar>('/api/research?fn=patentradar');
  const done = (d?.themes ?? []).filter((t) => t.unmatched || t.cur.published != null && t.cur.granted != null && t.prev.published != null && t.prev.granted != null).length;
  return (
    <section className="panel">
      <div className="gx-h"><b>Theme radar</b><span className="small muted">US patents made public and granted, last 90 days vs the same 90 days a year earlier</span><Fresh kind="eod" src="USPTO Open Data Portal (official, refreshed daily)" /></div>
      <div className="gx-pad">
        {!d && <p className="small muted">Counting by theme…</p>}
        {d?.error && <p className="small down">{d.error}</p>}
        {d?.needsKey && <p className="small muted">Needs the free USPTO key (<code>USPTO_API_KEY</code> in Vercel).</p>}
        {d?.unavailable && <p className="small down">The radar can't count by theme yet: {d.why}</p>}
        {d?.themes && <>
          {!d.complete && <p className="small muted">Filling in ({done} of {d.themes.length} themes)… the USPTO allows one lookup at a time. Saved for 12 hours after this.</p>}
          <table className="ad-table pr-table"><thead><tr><th>Theme</th><th className="r">Made public</th><th className="r">vs year ago</th><th className="r" title="Change minus the change for all US patents">vs all patents</th><th className="r">Granted</th><th className="r">vs year ago</th><th className="r" title="Change minus the change for all US patents">vs all patents</th><th>Top filers (made public)</th></tr></thead>
            {RADAR_GROUPS.map((g) => (
              <tbody key={g}>
                <tr className="pr-group"><td colSpan={8}>{g}</td></tr>
                {d.themes!.filter((t) => t.group === g).map((t) => (
                  <tr key={t.id}>
                    <td>{t.label}{t.unmatched && <span className="small muted" title="The USPTO search could not be pointed at this sub-category reliably, so it is left out rather than shown wrong."> · not available</span>}</td>
                    <td className="r num">{num(t.cur.published)}</td><td className={`r num ${pctCls(t.cur.published, t.prev.published)}`}>{pctTxt(t.cur.published, t.prev.published)}</td><td className="r num"><Rel t={chg(t.cur.published, t.prev.published)} b={d.base ? chg(d.base.cur.published, d.base.prev.published) : null} /></td>
                    <td className="r num">{num(t.cur.granted)}</td><td className={`r num ${pctCls(t.cur.granted, t.prev.granted)}`}>{pctTxt(t.cur.granted, t.prev.granted)}</td><td className="r num"><Rel t={chg(t.cur.granted, t.prev.granted)} b={d.base ? chg(d.base.cur.granted, d.base.prev.granted) : null} /></td>
                    <td className="small">{t.top.length ? t.top.slice(0, 3).map((f) => `${f.name} (${f.n})`).join(' · ') : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
          {d.base && <p className="small">All US utility patents: made public <b className="num">{num(d.base.cur.published)}</b> vs <span className="num">{num(d.base.prev.published)}</span> ({pctTxt(d.base.cur.published, d.base.prev.published)}), granted <b className="num">{num(d.base.cur.granted)}</b> vs <span className="num">{num(d.base.prev.granted)}</span> ({pctTxt(d.base.cur.granted, d.base.prev.granted)}). "vs all patents" = the theme's change minus this: positive means the theme is gaining share.</p>}
          {d.windows && <p className="note small">Last 90 days: {d.windows.cur.from} to {d.windows.cur.to}, compared with {d.windows.prev.from} to {d.windows.prev.to}. "Made public" = applications published (usually ~18 months after filing): the newest look at what companies are building. A patent can sit in more than one theme.</p>}
          {d.errors && Object.keys(d.errors).length > 0 && <p className="small muted">Some counts did not load: {Object.values(d.errors).join(' · ')}</p>}
        </>}
      </div>
    </section>
  );
}

interface Watch { error?: string; needsKey?: boolean; complete?: boolean; rows?: { sym: string; name: string; names: string[]; last: number | null; prior: number | null; error: string | null }[] }
function WatchPanel({ syms, onOpen }: { syms: string[]; onOpen: (s: string) => void }) {
  const list = syms.slice(0, 30);
  const d = usePoll<Watch>(list.length ? `/api/research?fn=patentwatch&symbols=${list.join(',')}` : null);
  const rows = [...(d?.rows ?? [])].sort((a, b) => (b.last ?? -1) - (a.last ?? -1));
  return (
    <section className="panel">
      <div className="gx-h"><b>My watchlist</b><span className="small muted">patents granted, last 12 months vs the year before</span><Fresh kind="eod" src="USPTO Open Data Portal (official, refreshed daily)" /></div>
      <div className="gx-pad">
        {!list.length && <p className="small muted">Your watchlist is empty. Add tickers on the Desk to track their patents here.</p>}
        {list.length > 0 && !d && <p className="small muted">Looking up {list.length} companies…</p>}
        {d?.error && <p className="small down">{d.error}</p>}
        {d?.rows && <>
          {!d.complete && <p className="small muted">Filling in… first looks take a moment (one USPTO lookup at a time).</p>}
          <table className="ad-table"><thead><tr><th>Company</th><th className="r">Last 12 mo</th><th className="r">Year before</th><th className="r">Change</th><th /></tr></thead><tbody>
            {rows.map((r) => (
              <tr key={r.sym} title={r.names.length ? `Searched as: ${r.names.join(', ')}` : undefined}>
                <td><b>{r.sym}</b> <span className="small muted">{r.name !== r.sym ? r.name : ''}</span>{r.error && <span className="small down"> {r.error}</span>}</td>
                <td className="r num">{num(r.last)}</td><td className="r num">{num(r.prior)}</td><td className={`r num ${pctCls(r.last, r.prior)}`}>{pctTxt(r.last, r.prior)}</td>
                <td className="r"><button className="btn sm" onClick={() => onOpen(r.sym)}>Details</button></td>
              </tr>
            ))}
          </tbody></table>
          <p className="note small">Hover a row to see the names searched. Weekly notes (new filings, new tech areas) arrive with the nightly check.</p>
        </>}
      </div>
    </section>
  );
}

export default function PatentsPage({ watchlist, initial }: { watchlist: string[]; initial?: string }) {
  const [sym, setSym] = useState(initial ?? '');
  const [text, setText] = useState(initial ?? '');
  const open = (s: string) => { const t = s.trim().toUpperCase(); if (/^[A-Z][A-Z0-9.\-]{0,9}$/.test(t)) { setSym(t); setText(t); document.querySelector('.pp-look')?.scrollIntoView({ behavior: 'smooth' }); } };
  return (
    <div className="pp">
      <section className="panel pp-look">
        <div className="gx-h"><b>Patents &amp; Tech</b><span className="small muted">what companies are inventing, how fast, and where</span></div>
        <form className="gx-pad pp-search" onSubmit={(e) => { e.preventDefault(); open(text); }}>
          <input value={text} onChange={(e) => setText(e.target.value.toUpperCase())} placeholder="Ticker, e.g. NVDA" aria-label="Ticker" />
          <button className="btn primary" type="submit">Look up patents</button>
          {watchlist.slice(0, 8).map((s) => <button key={s} type="button" className="chip sm" onClick={() => open(s)}>{s}</button>)}
        </form>
        {sym && <div className="gx-pad"><h4 className="pp-sym">{sym}</h4><PatentsView sym={sym} /></div>}
      </section>
      <RadarPanel />
      <WatchPanel syms={watchlist} onOpen={open} />
      <p className="note small">Research only, not advice. Data: USPTO Open Data Portal, plus company subsidiary lists from SEC 10-K filings.</p>
    </div>
  );
}
