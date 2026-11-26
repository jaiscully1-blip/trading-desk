// Banks & hedging tab (Credit page): how much credit protection US banks bought and sold, their Tier 1 capital and unused
// loan commitments, quarter by quarter, from the FDIC's call reports. Quiet notes on sharp moves. Official data, not advice.
import { useEffect, useState } from 'react';
import { fromTiny, type BankQ } from '../../shared/bankHedge';
import { getDeskJson } from './PatentsSection';
import { Fresh } from './common';

interface Bank { cert: number; name: string; qs: BankQ[]; changes: { cur: BankQ; prev: BankQ | null; yr: BankQ | null; boughtQ: number | null; boughtY: number | null; unusedQ: number | null; unusedY: number | null; t1LevQ: number | null } | null; notes: string[] }
interface Resp { error?: string; latest?: string; banks?: Bank[]; industry?: { q: string; bought: number; sold: number; banks: number }[]; notes?: string[]; errors?: Record<string, string>; source?: string }

const money = (v: number | null | undefined) => (v == null ? '—' : Math.abs(v) >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(0)}B` : `$${(v / 1e6).toFixed(0)}M`);
const pc = (v: number | null | undefined) => (v == null ? '—' : `${v > 0 ? '+' : ''}${Math.round(v)}%`);
const cls = (v: number | null | undefined, big = 15) => (v == null ? '' : v >= big ? 'down' : v <= -big ? 'up' : ''); // more protection bought = more hedging = stress-side colour

/** Protection bought and sold over time (lines), one panel. */
export function Lines({ pts }: { pts: { q: string; bought: number | null; sold: number | null }[] }) {
  const W = 640, H = 160, L = 46, R = 8, T = 10, B = 20;
  const vals = pts.flatMap((p) => [p.bought ?? 0, p.sold ?? 0]);
  const max = Math.max(1, ...vals);
  const x = (i: number) => L + (i / Math.max(1, pts.length - 1)) * (W - L - R), y = (v: number) => T + (1 - v / max) * (H - T - B);
  const line = (k: 'bought' | 'sold') => pts.map((p, i) => (p[k] == null ? '' : `${x(i).toFixed(1)},${y(p[k]!).toFixed(1)}`)).filter(Boolean).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="pt-chart" role="img" aria-label="Credit protection bought and sold">
      {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} className="pt-grid" /><text x={L - 4} y={y(max * f) + 3} className="pt-ax" textAnchor="end">{money(max * f)}</text></g>)}
      {pts.map((p, i) => (i % 4 === 3 || i === pts.length - 1 ? <text key={p.q} x={x(i)} y={H - 5} className="pt-ax" textAnchor={i === pts.length - 1 ? 'end' : 'middle'}>{p.q.slice(0, 7)}</text> : null))}
      <polyline points={line('sold')} className="pt-filed" /><polyline points={line('bought')} className="pt-granted" />
      {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.bought ?? 0)} r={2.4} className="pt-dot pt-granted"><title>{`${p.q}: bought ${money(p.bought)}, sold ${money(p.sold)}`}</title></circle>)}
    </svg>
  );
}

function BankRow({ b }: { b: Bank }) {
  const [open, setOpen] = useState(false);
  const c = b.changes;
  if (!c) return null;
  return (
    <>
      <tr className="bh-row" onClick={() => setOpen(!open)} title="Show history">
        <td><b>{b.name}</b></td>
        <td className="r num">{money(c.cur.bought)}</td><td className={`r num ${fromTiny(c.cur.bought, c.prev?.bought) ? '' : cls(c.boughtQ)}`} title={c.prev ? `Last quarter: ${money(c.prev.bought)}` : undefined}>{fromTiny(c.cur.bought, c.prev?.bought) ? 'new' : pc(c.boughtQ)}</td><td className={`r num ${fromTiny(c.cur.bought, c.yr?.bought) ? '' : cls(c.boughtY, 30)}`} title={c.yr ? `A year ago: ${money(c.yr.bought)}` : undefined}>{fromTiny(c.cur.bought, c.yr?.bought) ? 'new' : pc(c.boughtY)}</td>
        <td className="r num">{money(c.cur.net)}</td>
        <td className={`r num ${c.t1LevQ != null && c.t1LevQ <= -0.5 ? 'down' : ''}`}>{c.cur.t1Lev != null ? `${c.cur.t1Lev.toFixed(1)}%` : '—'}</td>
        <td className="r num">{money(c.cur.unused)}</td><td className="r num">{pc(c.unusedQ)}</td>
      </tr>
      {open && <tr className="pt-what-row"><td colSpan={8}>
        <Lines pts={b.qs.slice(-24)} />
        <p className="small muted">{b.name}: protection bought (orange) and sold (blue), last 6 years. Tier 1 risk-based ratio {c.cur.t1Risk != null ? `${c.cur.t1Risk.toFixed(1)}%` : '—'}, assets {money(c.cur.assets)}.</p>
      </td></tr>}
    </>
  );
}

function Search() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ cert: number; name: string; active: boolean; state: string; assets: number | null }[] | null>(null);
  const [bank, setBank] = useState<Bank | null>(null);
  const [busy, setBusy] = useState(false);
  const find = () => { if (q.trim().length < 2) return; setBusy(true); getDeskJson<any>(`/api/research?fn=banksearch&q=${encodeURIComponent(q)}`).then((j) => setRes(j.results ?? [])).finally(() => setBusy(false)); };
  const open = (cert: number) => { setBusy(true); getDeskJson<any>(`/api/research?fn=bankhedge&cert=${cert}`).then((j) => setBank(j.bank ?? null)).finally(() => setBusy(false)); };
  return (
    <div className="fi-box pt-wide">
      <h5>Find any bank</h5>
      <form className="pt-ev-bar" onSubmit={(e) => { e.preventDefault(); find(); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bank name, e.g. First Republic" aria-label="Bank name" />
        <button className="btn sm" type="submit" disabled={busy}>Search</button>
      </form>
      {res && (res.length ? <div className="pt-mix">{res.map((r) => <button key={r.cert} className="chip sm" onClick={() => open(r.cert)}>{r.name} · {r.state}{r.active ? '' : ' · closed'}</button>)}</div> : <p className="small muted">No bank found.</p>)}
      {bank?.changes && <table className="ad-table"><thead><tr><th>Bank</th><th className="r">Protection bought</th><th className="r">q/q</th><th className="r">y/y</th><th className="r">Net</th><th className="r">Tier 1 leverage</th><th className="r">Unused commitments</th><th className="r">q/q</th></tr></thead><tbody><BankRow b={bank} /></tbody></table>}
      {bank?.notes?.length ? <ul className="small pt-notes">{bank.notes.map((n) => <li key={n}>{n}</li>)}</ul> : null}
    </div>
  );
}

interface Holder { code: string; label: string; note?: string; outstanding: number | null; share: number | null; bought: number | null; sold: number | null; net: number | null; boughtH: number | null; boughtY: number | null }
interface HoldResp { error?: string; label?: string; total?: number; rows?: Holder[]; history?: { periods: string[]; sectors: Record<string, { period: string; bought: number | null; sold: number | null }[]> }; notes?: string[]; source?: string }
/** Who holds credit protection, all firms (BIS, half-yearly). */
function Holders() {
  const [d, setD] = useState<HoldResp | null>(null);
  const [open, setOpen] = useState('');
  useEffect(() => { getDeskJson<HoldResp>('/api/research?fn=cdsholders').then(setD).catch((e) => setD({ error: (e as Error).message })); }, []);
  if (!d) return <div className="fi-box pt-wide"><p className="small muted">Reading BIS statistics…</p></div>;
  if (d.error) return <div className="fi-box pt-wide"><p className="small down">Who holds credit protection: {d.error}</p></div>;
  const hist = open && d.history ? d.history.sectors[open].map((p) => ({ q: p.period, bought: p.bought, sold: p.sold })) : null;
  return (
    <div className="fi-box pt-wide">
      <h5>Who holds credit protection · all firms, {d.label} <Fresh kind="eod" src="BIS OTC derivatives statistics, half-yearly" /></h5>
      <p className="small">All credit default swaps outstanding: <b className="num">{money(d.total)}</b>. Bought = protection the sector holds; sold = protection it provides. Click a row for its history since 2010.</p>
      {!!d.notes?.length && <ul className="small pt-notes">{d.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      <table className="ad-table bh-table"><thead><tr><th>Holder</th><th className="r">Share of all CDS</th><th className="r">Bought</th><th className="r">Sold</th><th className="r">Net bought</th><th className="r">Bought, 6 mo</th><th className="r">Bought, 1 yr</th></tr></thead><tbody>
        {(d.rows ?? []).map((r) => (
          <tr key={r.code} className="bh-row" onClick={() => setOpen(open === r.code || r.bought == null ? '' : r.code)} title={r.note}>
            <td><b>{r.label}</b></td><td className="r num">{r.share != null ? `${r.share.toFixed(1)}%` : '—'}</td>
            <td className="r num">{money(r.bought)}</td><td className="r num">{money(r.sold)}</td>
            <td className={`r num ${r.net == null ? '' : r.net > 0 ? 'down' : 'up'}`}>{r.net == null ? '—' : money(r.net)}</td>
            <td className={`r num ${cls(r.boughtH)}`}>{pc(r.boughtH)}</td><td className={`r num ${cls(r.boughtY, 30)}`}>{pc(r.boughtY)}</td>
          </tr>
        ))}
      </tbody></table>
      {hist && <><Lines pts={hist} /><p className="small muted">{(d.rows ?? []).find((r) => r.code === open)?.label}: protection bought (orange) and sold (blue), every half-year.</p></>}
      <p className="note small">The BIS collects this from the big dealer banks, so each sector is seen through its trades with them (what dealers sold to a sector is what it bought). Company-by-company CDS buying is not published anywhere for free; "Non-financial companies" is the closest honest answer. Cleared trades sit with the clearing houses.</p>
    </div>
  );
}

export default function BankHedging({ live }: { live: boolean }) {
  const [d, setD] = useState<Resp | null>(null);
  useEffect(() => { if (!live) return; getDeskJson<Resp>('/api/research?fn=bankhedge').then(setD).catch((e) => setD({ error: (e as Error).message })); }, [live]);
  if (!live) return <p className="hw-pad muted"><Fresh kind="demo" /> This tab reads real FDIC data only, so it needs the live desk.</p>;
  if (!d) return <p className="hw-pad muted">Reading the FDIC call reports… a first look takes a few seconds.</p>;
  if (d.error) return <p className="hw-pad down">{d.error}</p>;
  const ind = d.industry ?? [];
  const last = ind.at(-1), prev = ind.at(-2), yr = ind.at(-5);
  const chg = (a?: number, b?: number) => (a == null || !b ? null : ((a - b) / b) * 100);
  return (
    <div className="fi-grid bh hw-pad">
      {!!d.notes?.length && (
        <div className="fi-box pt-wide">
          <h5>Notes · quarter ended {d.latest}</h5>
          <ul className="small pt-notes">{d.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          <p className="note small">Shown when a move is sharp (protection bought ±25% in a quarter, a switch between net buyer and net seller, Tier 1 leverage down 0.5+ points, unused commitments ±10%). Banks buy protection to hedge loans and trading books, and also on behalf of clients, so a rise is a sign of hedging demand, not proof of trouble.</p>
        </div>
      )}
      <div className="fi-box pt-wide">
        <h5>All US banks · credit protection bought and sold <Fresh kind="eod" src={`FDIC call reports, quarter ended ${d.latest} (published about 2 months after quarter end)`} /></h5>
        {last && <p className="small">Bought <b className="num">{money(last.bought)}</b> ({pc(chg(last.bought, prev?.bought))} vs last quarter, {pc(chg(last.bought, yr?.bought))} vs a year ago) · sold <b className="num">{money(last.sold)}</b> · {last.banks} banks report any.</p>}
        {ind.length > 1 && <Lines pts={ind} />}
        <p className="small"><span className="pt-key pt-granted" /> Bought (bank is protected) <span className="pt-key pt-filed" /> Sold (bank provides protection)</p>
      </div>
      <div className="fi-box pt-wide">
        <h5>Biggest banks · click a row for its history</h5>
        <table className="ad-table bh-table"><thead><tr><th>Bank</th><th className="r">Protection bought</th><th className="r">q/q</th><th className="r">y/y</th><th className="r">Net bought</th><th className="r">Tier 1 leverage</th><th className="r">Unused loan commitments</th><th className="r">q/q</th></tr></thead>
          <tbody>{(d.banks ?? []).map((b) => <BankRow key={b.cert} b={b} />)}</tbody></table>
        <p className="note small">Bank-level call reports (not the holding company). "Unused loan commitments" = credit lines and loan promises customers have not drawn yet. Tier 1 leverage = Tier 1 capital / average assets; regulators' well-capitalized line is 5%.</p>
      </div>
      <Search />
      <Holders />
      {d.errors && Object.keys(d.errors).length > 0 && <p className="small muted pt-wide">Some parts did not load: {Object.entries(d.errors).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}
      {d.source && <p className="note small pt-wide">{d.source} Research only, not advice.</p>}
    </div>
  );
}
