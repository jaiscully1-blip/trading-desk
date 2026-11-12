// Home widgets for the free sources added in Nov 2026: housing (Zillow Research), the most-shorted listed stocks
// (FINRA + SEC), and a bitcoin network strip (mempool.space). Live data only; nothing is made up in demo mode.
import { useEffect, useState } from 'react';
import type { DataMode } from '../data/live';
import type { BtcNet, HighSi, HousingSeries } from '../../shared/extras';
import { Fresh, Spark, Star } from './common';

function useJson<T>(url: string | null, everyMs: number) {
  const [st, setSt] = useState<{ d: T | null; err: string | null }>({ d: null, err: null });
  useEffect(() => {
    if (!url) return;
    let stop = false;
    const go = () => fetch(url).then(async (r) => { const j = await r.json(); if (!stop) setSt(r.ok ? { d: j, err: null } : { d: null, err: j.error ?? `HTTP ${r.status}` }); }).catch((e) => !stop && setSt({ d: null, err: String(e) }));
    go();
    const id = setInterval(() => { if (!document.hidden) go(); }, everyMs);
    return () => { stop = true; clearInterval(id); };
  }, [url, everyMs]);
  return st;
}
const big = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v.toFixed(0));

/* ---------------- housing ---------------- */
interface HousingData { series: { id: string; label: string; unit: string; rows: HousingSeries[] }[]; errors: Record<string, string>; asOf: number; source: string }
export function HousingW({ mode }: { mode: DataMode }) {
  const { d, err } = useJson<HousingData>(mode.kind === 'live' ? '/api/research?fn=housing' : null, 6 * 3600_000);
  const [region, setRegion] = useState(0);
  if (mode.kind !== 'live') return <p className="hw-pad small muted">Housing data needs the live desk (Zillow Research); nothing is shown in demo mode.</p>;
  if (err) return <p className="hw-pad small down">Zillow data unavailable: {err}</p>;
  if (!d) return <p className="hw-pad small muted">Loading Zillow data…</p>;
  const regions = d.series[0]?.rows.map((r) => r.region) ?? [];
  const fmt = (s: HousingData['series'][number], v: number) => (s.unit === '$' ? `$${big(v)}` : s.unit === '$/mo' ? `$${Math.round(v).toLocaleString('en-US')}/mo` : big(v));
  return (
    <div className="hx">
      <div className="hx-h">
        <select value={region} onChange={(e) => setRegion(+e.target.value)} aria-label="Region">{regions.map((r, i) => <option key={r} value={i}>{r}</option>)}</select>
        <Fresh kind="eod" at={d.asOf} src={d.source} />
      </div>
      {d.series.map((s) => {
        const r = s.rows.find((x) => x.region === regions[region]);
        if (!r?.last) return null;
        return (
          <div key={s.id} className="hx-row">
            <span className="hx-l">{s.label}</span>
            <b className="num">{fmt(s, r.last.val)}</b>
            <span className={`num small ${r.yoyPct == null ? 'muted' : r.yoyPct >= 0 ? 'up' : 'down'}`}>{r.yoyPct != null ? `${r.yoyPct >= 0 ? '+' : ''}${r.yoyPct.toFixed(1)}% y/y` : ''}</span>
            <Spark v={r.spark} w={70} h={16} title={`${s.label}, last ${r.spark.length} months`} />
            <span className="small muted">{new Date(`${r.last.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</span>
          </div>
        );
      })}
      <p className="note small">Monthly, about 6 weeks behind. Rising listings with falling sales usually means a cooling market; homebuilders, mortgage lenders and building-supply stocks tend to follow these numbers.</p>
    </div>
  );
}

/* ---------------- most-shorted stocks ---------------- */
export function HighSiW({ mode, onChart, mine }: { mode: DataMode; onChart: (s: string) => void; mine: Set<string> }) {
  const { d, err } = useJson<{ rows: HighSi[]; asOf: number; source: string }>(mode.kind === 'live' ? '/api/research?fn=hisi' : null, 6 * 3600_000);
  if (mode.kind !== 'live') return <p className="hw-pad small muted">Short interest needs the live desk (FINRA + SEC); nothing is shown in demo mode.</p>;
  if (err) return <p className="hw-pad small down">Short interest unavailable: {err}</p>;
  if (!d) return <p className="hw-pad small muted">Loading FINRA short interest…</p>;
  return (
    <div className="hsi">
      <div className="hsi-h small muted">Most-shorted Nasdaq / NYSE stocks · settled {d.rows[0]?.settlementDate ?? ''} <Fresh kind="eod" at={d.asOf} src={d.source} /></div>
      <div className="hsi-list">
        <div className="hsi-row hsi-head small muted"><span>Ticker</span><span title="Short shares ÷ shares outstanding (not float, so the % of float is higher)">% of shares</span><span title="Short shares ÷ average daily volume">Days to cover</span><span>Short shares</span><span title="Change since the previous settlement">Chg</span></div>
        {d.rows.slice(0, 50).map((r) => (
          <div key={r.sym} className={`hsi-row ${mine.has(r.sym) ? 'mine' : ''}`} title={r.name}>
            <span><Star sym={r.sym} /><button className="wl-sym" onClick={() => onChart(r.sym)}>{r.sym}</button></span>
            <span className="num"><b>{r.pctOut != null ? `${r.pctOut.toFixed(1)}%` : '—'}</b></span>
            <span className="num">{r.daysToCover.toFixed(1)}</span>
            <span className="num muted">{big(r.shares)}</span>
            <span className={`num small ${r.changePct == null ? 'muted' : r.changePct >= 0 ? 'down' : 'up'}`}>{r.changePct != null ? `${r.changePct >= 0 ? '+' : ''}${r.changePct.toFixed(0)}%` : ''}</span>
          </div>
        ))}
      </div>
      <p className="note small">FINRA publishes short interest twice a month, about a week after the settlement date. Heavy shorting can fuel sharp squeezes, and it also often means many traders expect the stock to fall.</p>
    </div>
  );
}

/* ---------------- bitcoin network (inside the crypto widget) ---------------- */
export function BtcNetStrip({ mode }: { mode: DataMode }) {
  const { d } = useJson<BtcNet & { asOf: number; source: string }>(mode.kind === 'live' ? '/api/research?fn=btcnet' : null, 5 * 60_000);
  if (!d) return null;
  return (
    <div className="btcn small" title="Bitcoin network, from mempool.space">
      {d.height != null && <span>Block <b className="num">{d.height.toLocaleString('en-US')}</b></span>}
      {d.fees && <span>Fees <b className="num">{d.fees.fast}</b> sat/vB next block</span>}
      {d.hashrateEh != null && <span>Hash rate <b className="num">{d.hashrateEh.toFixed(0)}</b> EH/s</span>}
      {d.diffChangePct != null && <span>Next difficulty <b className={`num ${d.diffChangePct >= 0 ? 'up' : 'down'}`}>{d.diffChangePct >= 0 ? '+' : ''}{d.diffChangePct.toFixed(1)}%</b>{d.blocksToRetarget != null ? <span className="muted"> in {d.blocksToRetarget} blocks</span> : null}</span>}
    </div>
  );
}
