// Quant Lab event study card: how the stock moved beyond the market around each kind of dated event
// (earnings beats and misses, and later recalls and complaint spikes), averaged over every past event.
import { useEffect, useMemo, useState } from 'react';
import { Fresh } from './common';
import { MoveChart } from './MoveChart';
import { POST, PRE, earningsEvents, eventStudy, summarize, type DayClose, type EventIn, type EventOut } from '../../shared/eventstudy';

interface EResp { stock: DayClose[]; spy: DayClose[]; earnings: { date: string; eps: number | null; est: number | null; surprisePct: number | null; time?: string }[]; earnSource: string; asOf: number; source: string; error?: string }
const pc = (v: number, dp = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(dp)}%`;
const COLORS = ['var(--up)', 'var(--down)', 'var(--accent)', 'var(--warn)', 'var(--muted)'];
const sig = (t: number) => (Math.abs(t) >= 2 ? 'real' : Math.abs(t) >= 1.5 ? 'borderline' : 'could be noise');

export function QuantEvents({ sym, extra = [] }: { sym: string; extra?: { kind: string; source: string; events: EventIn[] }[] }) {
  const [d, setD] = useState<EResp | null>(null);
  const [err, setErr] = useState('');
  const [kind, setKind] = useState('Earnings');
  useEffect(() => {
    let off = false; setD(null); setErr('');
    fetch(`/api/research?fn=qlevents&symbol=${encodeURIComponent(sym)}`).then((r) => r.json()).then((j: EResp) => { if (!off) { if (j.error) setErr(j.error); else setD(j); } }).catch((e) => !off && setErr(String(e.message ?? e)));
    return () => { off = true; };
  }, [sym]);
  const kinds = ['Earnings', ...extra.filter((x) => x.events.length >= 3).map((x) => x.kind)];
  useEffect(() => { if (!kinds.includes(kind)) setKind('Earnings'); }, [kinds.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const res = useMemo(() => {
    if (!d) return null;
    let evs: EventOut[];
    if (kind === 'Earnings') {
      evs = eventStudy(d.stock, d.spy, earningsEvents(d.earnings));
      // no estimates: split by how the stock reacted (day -1 to +1), then ask whether it kept drifting that way
      if (evs.every((e) => e.group.startsWith('Report'))) evs = evs.map((e) => ({ ...e, group: e.car[PRE + 1] - e.car[PRE - 2] >= 0 ? 'Rose on the report' : 'Fell on the report' }));
    } else {
      // one event per day and group (a recall often covers many product lines filed together)
      const seen = new Map<string, EventIn & { more: number }>();
      for (const e of extra.find((x) => x.kind === kind)?.events ?? []) { const k = `${e.date}|${e.group}`, c = seen.get(k); if (c) c.more++; else seen.set(k, { ...e, more: 0 }); }
      evs = eventStudy(d.stock, d.spy, [...seen.values()].map((e) => ({ ...e, label: e.more ? `${e.label} (+${e.more} more)` : e.label })));
    }
    return { evs, stats: summarize(evs) };
  }, [d, kind, extra]);
  const src = kind === 'Earnings' ? d?.earnSource : extra.find((x) => x.kind === kind)?.source;


  return (
    <section className="ql-card">
      <header className="ql-h"><h3>Event study <span className="muted">· {sym}</span></h3><div className="ql-hr">{d && <Fresh kind="eod" at={d.asOf} src={`${d.source} ${src ?? ''}`} />}<div className="ql-seg">{kinds.map((k) => <button key={k} className={`chip sm ${k === kind ? 'on' : ''}`} onClick={() => setKind(k)}>{k}</button>)}</div></div></header>
      {err && <p className="small dn">{err}</p>}
      {!d && !err && <p className="small muted">Loading daily prices since 2005 and dated events…</p>}
      {res && (res.evs.length < 3 ? <p className="small muted">Fewer than 3 usable events for {sym}{src ? ` (${src})` : ''}.</p> : <>
        <p className="small muted ql-note">Move beyond what the market explains, averaged over {res.evs.length} events, from {PRE} trading days before to {POST} after. {src}</p>
        <figure className="ql-fig">
          <MoveChart series={res.stats.map((st, gi) => ({ pts: st.path.map((v, k) => ({ t: (k - PRE) * 86400000, v })), label: `${st.group} (${st.n})`, color: COLORS[gi % COLORS.length], fmt: (v) => pc(v, 2) }))} height={220} ranges={false} zero legend xfmt={(t) => { const d = Math.round(t / 86400000); return d === 0 ? 'event day' : `day ${d > 0 ? '+' : ''}${d}`; }} marks={[{ t: 0, label: 'event day' }]} />
        </figure>
        <div className="ql-sub">
          <table className="ql-t"><thead><tr><th>Group</th><th className="r">Events</th><th className="r">Reaction (day −1 to +1)</th><th className="r">Drift after (+2 to +{POST})</th><th className="r">Up on the news</th></tr></thead><tbody>
            {res.stats.map((s) => <tr key={s.group}><td>{s.group}</td><td className="r num">{s.n}</td><td className={`r num ${s.react >= 0 ? 'up' : 'dn'}`}>{pc(s.react)} <span className="muted small">{sig(s.t)}</span></td><td className={`r num ${s.drift >= 0 ? 'up' : 'dn'}`}>{pc(s.drift)} <span className="muted small">{sig(s.tDrift)}</span></td><td className="r num">{/on the report/.test(s.group) ? "—" : `${(s.pctUp * 100).toFixed(0)}%`}</td></tr>)}
          </tbody></table>
        </div>
        <details className="small ql-how"><summary>Last 10 events</summary>
          <table className="ql-t"><thead><tr><th>Day 0</th><th>Event</th><th>Group</th><th className="r">Reaction</th><th className="r">+{POST} days</th></tr></thead><tbody>
            {res.evs.slice().sort((a, b) => b.day0.localeCompare(a.day0)).slice(0, 10).map((e) => { const r = e.car[PRE + 1] - e.car[PRE - 2]; return <tr key={e.day0 + e.label}><td className="num">{e.day0}</td><td>{e.label}</td><td>{e.group}</td><td className={`r num ${r >= 0 ? 'up' : 'dn'}`}>{pc(r)}</td><td className={`r num ${e.car[PRE + POST] >= 0 ? 'up' : 'dn'}`}>{pc(e.car[PRE + POST])}</td></tr>; })}
          </tbody></table>
        </details>
        <details className="small ql-how"><summary>How to read this</summary><ul className="muted">
          <li>Each event's "normal" behavior (its alpha and beta to the S&P 500) is fitted on the 120 trading days before it; the lines show only the move beyond that.</li>
          <li>"Real" means the average is at least two standard errors from zero across events (t ≥ 2). With few events, even big averages can be noise.</li>
          <li>Drift after the news is the tradable part: academic work (post-earnings-announcement drift) finds stocks keep moving the way they reacted for weeks, though the effect has shrunk in large caps.</li>
        </ul></details>
      </>)}
    </section>
  );
}
