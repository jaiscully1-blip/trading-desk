// Widgets: most active options (Cboe delayed chains of the busiest underlyings), Treasury yield curve and rates (FRED),
// crypto perpetual funding (Hyperliquid). Live data only. No call / put suggestions: these show where trading happened.
import { useEffect, useState } from 'react';
import type { DataMode } from '../data/live';
import type { ActiveOpt, CurvePoint, Perp } from '../../shared/optrates';
import { Fresh, Seg } from './common';

function useJson<T>(url: string | null, everyMs: (d: T | null) => number) {
  const [st, setSt] = useState<{ d: T | null; err: string | null; needsKey?: boolean }>({ d: null, err: null });
  useEffect(() => {
    if (!url) return;
    let stop = false, t: ReturnType<typeof setTimeout>;
    const go = async () => {
      let next: T | null = null;
      try { const r = await fetch(url); const j = await r.json(); if (stop) return; if (r.ok) { next = j; setSt({ d: j, err: null }); } else setSt((s) => ({ d: s.d, err: j.error ?? `HTTP ${r.status}`, needsKey: j.needsKey })); } catch (e) { if (!stop) setSt((s) => ({ ...s, err: s.d ? null : String(e) })); }
      if (!stop) t = setTimeout(go, everyMs(next));
    };
    go();
    return () => { stop = true; clearTimeout(t); };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
  return st;
}
const liveOnly = (what: string) => <p className="hw-pad small muted">{what} needs the live desk; nothing is shown in demo mode.</p>;
const money = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}K`);
const k = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

/* ---------------- most active options ---------------- */
interface ActiveData { top: ActiveOpt[]; names: { sym: string; spot: number; volume: number; pcRatio: number | null; zeroDteShare: number | null }[]; missed: string[]; asOf: number; source: string }
export function OptActiveW({ mode, onChart }: { mode: DataMode; onChart: (s: string) => void }) {
  // re-ask after ~70 s while some chains are still missing (Cboe is read a few names a minute), else every 5 minutes
  const { d, err } = useJson<ActiveData>(mode.kind === 'live' ? '/api/research?fn=optactive' : null, (x) => (x?.missed.length ? 70_000 : 300_000));
  const [view, setView] = useState<'contracts' | 'names'>('contracts');
  if (mode.kind !== 'live') return liveOnly('Most active options');
  if (err && !d) return <p className="hw-pad small down">{err}</p>;
  if (!d) return <p className="hw-pad small muted">Reading option chains… (about a minute the first time)</p>;
  return (
    <div className="oa">
      <div className="wm-h"><Seg value={view} onChange={setView} options={[{ id: 'contracts', label: 'Contracts' }, { id: 'names', label: 'By underlying' }]} /><Fresh kind="delayed" at={d.asOf} src={d.source} />{d.missed.length > 0 && <span className="small muted">still loading {d.missed.join(', ')}</span>}</div>
      <div className="wm-list">
        {view === 'contracts' ? d.top.map((o) => (
          <div key={`${o.sym}${o.exp}${o.cp}${o.K}`} className="oa-row">
            <button className="wl-sym" onClick={() => onChart(o.sym)}>{o.sym}</button>
            <span className={o.cp === 'C' ? 'up' : 'down'}><b>{k(o.K)} {o.cp === 'C' ? 'call' : 'put'}</b></span>
            <span className="num small">{o.exp.slice(5)} <span className="muted">{o.dte}d</span></span>
            <span className="num" title={`Volume ${o.vol.toLocaleString('en-US')} · open interest ${o.oi.toLocaleString('en-US')} at the start of the day`}>{o.vol.toLocaleString('en-US')}</span>
            <span className="num small muted oa-oi" title="Open interest at the start of the day">{o.oi.toLocaleString('en-US')} OI</span>
            <span className="num small">{money(o.premium)}</span>
          </div>
        )) : d.names.map((n) => (
          <div key={n.sym} className="oa-row oa-n">
            <button className="wl-sym" onClick={() => onChart(n.sym)}>{n.sym}</button>
            <span className="num">{n.volume.toLocaleString('en-US')} <span className="muted small">contracts</span></span>
            <span className="num small" title="Put volume ÷ call volume">P/C {n.pcRatio?.toFixed(2) ?? '—'}</span>
            <span className="num small muted" title="Share of volume in contracts expiring within 2 days">{n.zeroDteShare != null ? `${(n.zeroDteShare * 100).toFixed(0)}% ≤2 days` : ''}</span>
          </div>
        ))}
      </div>
      <p className="note small">Busiest contracts among {d.names.length} of the most-traded option names (not the whole market). Volume is today's; it doesn't say who bought or sold.</p>
    </div>
  );
}

/* ---------------- yield curve + rates ---------------- */
interface RatesData { points: CurvePoint[]; asOf: string | null; spreads: { label: string; now: number | null; y1: number | null }[]; rates: { id: string; label: string; now: { date: string; value: number }; y1: { date: string; value: number } | null }[]; source: string }
function Curve({ pts }: { pts: CurvePoint[] }) {
  const W = 360, H = 130, P = 26;
  const ok = pts.filter((p) => p.now != null);
  if (ok.length < 4) return null;
  const all = pts.flatMap((p) => [p.now, p.m1, p.y1]).filter((x): x is number => x != null);
  const lo = Math.floor(Math.min(...all) * 2) / 2, hi = Math.ceil(Math.max(...all) * 2) / 2;
  const X = (i: number) => P + (i / (pts.length - 1)) * (W - P - 8), Y = (v: number) => H - 18 - ((v - lo) / (hi - lo || 1)) * (H - 30);
  const line = (key: 'now' | 'm1' | 'y1') => pts.map((p, i) => (p[key] == null ? '' : `${i && pts[i - 1][key] != null ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p[key]!).toFixed(1)}`)).join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="rc-svg" role="img" aria-label="Treasury yield curve">
      <path d={line('y1')} className="rc-y1" /><path d={line('m1')} className="rc-m1" /><path d={line('now')} className="rc-now" />
      {pts.map((p, i) => <text key={p.id} x={X(i)} y={H - 4} className="rc-t">{p.label}</text>)}
      <text x={2} y={Y(hi) + 4} className="rc-t start">{hi.toFixed(1)}%</text><text x={2} y={Y(lo)} className="rc-t start">{lo.toFixed(1)}%</text>
    </svg>
  );
}
export function RatesW({ mode }: { mode: DataMode }) {
  const { d, err, needsKey } = useJson<RatesData>(mode.kind === 'live' ? '/api/research?fn=rates' : null, () => 3 * 3600_000);
  if (mode.kind !== 'live') return liveOnly('The yield curve');
  if (err && !d) return <p className="hw-pad small">{needsKey ? 'Add the free FRED_API_KEY in Vercel for the yield curve.' : <span className="down">{err}</span>}</p>;
  if (!d) return <p className="hw-pad small muted">Loading FRED…</p>;
  const bp = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(0)} bp`);
  return (
    <div className="rc">
      <div className="wm-h small"><span><span className="rc-key now" /> today</span><span><span className="rc-key m1" /> a month ago</span><span><span className="rc-key y1" /> a year ago</span><Fresh kind="eod" at={d.asOf ? Date.parse(`${d.asOf}T21:00:00Z`) : undefined} src={d.source} /></div>
      <Curve pts={d.points} />
      <div className="rc-grid small">
        {d.points.filter((p) => p.now != null).map((p) => <span key={p.id}><span className="muted">{p.label}</span> <b className="num">{p.now!.toFixed(2)}</b>{p.y1 != null && <span className={`num ${p.now! - p.y1 >= 0 ? 'up' : 'down'}`}> {bp((p.now! - p.y1) * 100)}</span>}</span>)}
      </div>
      <div className="rc-sp small">{d.spreads.map((s) => <span key={s.label} title="Negative = inverted (short rates above long rates), which has often come before recessions">{s.label} <b className={`num ${s.now != null && s.now < 0 ? 'down' : ''}`}>{bp(s.now)}</b> <span className="muted">(a year ago {bp(s.y1)})</span></span>)}</div>
      <div className="rc-rates small">{d.rates.map((r) => <div key={r.id}><span className="muted">{r.label}</span> <b className="num">{r.now.value.toFixed(2)}%</b>{r.y1 && <span className="muted num"> · a year ago {r.y1.value.toFixed(2)}%</span>}</div>)}</div>
      <p className="note small">Changes are vs a year ago. An upward curve is the normal shape; an inverted one has often come before slowdowns; a fast steepening from inversion has often happened around the start of one.</p>
    </div>
  );
}

/* ---------------- crypto perpetual funding ---------------- */
export function PerpsW({ mode }: { mode: DataMode }) {
  const { d, err } = useJson<{ perps: Perp[]; asOf: number; source: string }>(mode.kind === 'live' ? '/api/research?fn=perps' : null, () => 60_000);
  if (mode.kind !== 'live') return liveOnly('Perpetual funding');
  if (err && !d) return <p className="hw-pad small down">{err}</p>;
  if (!d) return <p className="hw-pad small muted">Loading…</p>;
  return (
    <div className="pp">
      <div className="wm-h small muted">Top {d.perps.length} by 24h volume <Fresh kind="live" at={d.asOf} src={d.source} /></div>
      <div className="wm-list">
        <div className="pp-row small muted"><span>Coin</span><span>Price</span><span>24h</span><span title="Funding rate per year at the current hourly rate. Positive = longs pay shorts (crowded long).">Funding / yr</span><span>Open interest</span><span>Volume</span></div>
        {d.perps.map((p) => (
          <div key={p.coin} className="pp-row">
            <b>{p.coin}</b>
            <span className="num">{p.mark >= 100 ? p.mark.toLocaleString('en-US', { maximumFractionDigits: 0 }) : p.mark.toPrecision(4)}</span>
            <span className={`num small ${p.chgPct == null ? 'muted' : p.chgPct >= 0 ? 'up' : 'down'}`}>{p.chgPct != null ? `${p.chgPct >= 0 ? '+' : ''}${p.chgPct.toFixed(1)}%` : ''}</span>
            <span className={`num ${p.fundingApr > 30 ? 'down' : p.fundingApr < -10 ? 'up' : ''}`} title={`${p.fundingHr.toFixed(4)}% per hour`}>{p.fundingApr >= 0 ? '+' : ''}{p.fundingApr.toFixed(1)}%</span>
            <span className="num small">{money(p.oiUsd)}</span>
            <span className="num small muted">{money(p.volUsd)}</span>
          </div>
        ))}
      </div>
      <p className="note small">High positive funding means traders are paying a lot to stay long (crowded); negative means shorts are paying. Very high readings have often come before sharp shakeouts. From one exchange (Hyperliquid), not the whole crypto market.</p>
    </div>
  );
}
