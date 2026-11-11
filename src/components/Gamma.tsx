// Gamma & IV page: where dealer hedging is likely to pin or push SPY / QQQ / IWM / SPX (call wall, put wall, zero-gamma
// flip) and how options price risk across strikes and dates (IV surface, term structure). Cboe delayed chain, ~15 min.
import { useEffect, useMemo, useState } from 'react';
import type { DataMode } from '../data/live';
import { MONEYNESS, gammaRead, ivSurface, parseCboe, pcRatios, type GammaRead, type IvRow } from '../../shared/gamma';
import { usePersisted } from '../lib/store';
import { Fresh, Seg, Skel, PageTabs, Q } from './common';
import { DEMO_AT, rng } from '../lib/demo';

type Sym = 'SPY' | 'QQQ' | 'IWM' | 'SPX';
interface GammaData {
  sym: string; spot: number; chainAsOf: number | null; contracts: number; gex: GammaRead;
  gexWeek: { callWall: number | null; putWall: number | null; flip: number | null; total: number };
  surface: IvRow[]; pc: { oi: number | null; vol: number | null }; asOf: number; source: string; stale?: boolean; demo?: boolean;
}

function demoData(sym: Sym): GammaData {
  const r = rng(sym.length * 97);
  const spot = { SPY: 600, QQQ: 520, IWM: 230, SPX: 6000 }[sym], step = sym === 'SPX' ? 25 : sym === 'IWM' ? 1 : 5;
  const options: any[] = [];
  const now = DEMO_AT;
  for (let e = 0; e < 8; e++) {
    const d = new Date(now + (2 + e * 7) * 86400_000), tag = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    for (let K = spot * 0.85; K <= spot * 1.15; K += step) {
      const k = String(Math.round(K * 1000)).padStart(8, '0'), m = K / spot;
      const iv = 0.16 + Math.max(0, 1 - m) * 0.9 + Math.max(0, m - 1) * 0.15 + e * 0.004;
      const near = Math.exp(-(((m - 1.03) / 0.015) ** 2)), nearP = Math.exp(-(((m - 0.96) / 0.02) ** 2));
      options.push({ option: `${sym}${tag}C${k}`, iv, open_interest: Math.round((500 + r() * 3000) * (1 + 8 * near) / (1 + e * 0.3)), volume: 100 });
      options.push({ option: `${sym}${tag}P${k}`, iv: iv + 0.01, open_interest: Math.round((700 + r() * 3500) * (1 + 9 * nearP) / (1 + e * 0.3)), volume: 140 });
    }
  }
  const ch = parseCboe({ data: { current_price: spot, options } }, sym, now);
  const g = gammaRead(ch, 45), w = gammaRead(ch, 7);
  return { sym, spot, chainAsOf: now, contracts: ch.contracts.length, gex: g, gexWeek: { callWall: w.callWall, putWall: w.putWall, flip: w.flip, total: w.total }, surface: ivSurface(ch), pc: pcRatios(ch), asOf: now, source: 'Generated sample chain', demo: true };
}

function useGamma(sym: Sym, mode: DataMode): { d: GammaData | null; err?: string } {
  const [st, setSt] = useState<{ d: GammaData | null; err?: string }>({ d: null });
  useEffect(() => {
    if (mode.kind === 'checking') return;
    if (mode.kind === 'demo') { setSt({ d: demoData(sym) }); return; }
    let stop = false;
    setSt((s) => ({ d: s.d?.sym === sym ? s.d : null }));
    const go = () => fetch(`/api/research?fn=gamma&symbol=${sym}`).then(async (r) => { const j = await r.json(); if (!stop) setSt(r.ok ? { d: j } : { d: null, err: j.error ?? `HTTP ${r.status}` }); }).catch((e) => !stop && setSt({ d: null, err: String(e) }));
    go();
    const id = setInterval(go, 10 * 60_000);
    return () => { stop = true; clearInterval(id); };
  }, [sym, mode.kind]);
  return st;
}

const bn = (x: number) => { const a = Math.abs(x); return `${x < 0 ? '−' : '+'}$${a >= 1e9 ? (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(0) + 'M' : Math.round(a / 1e3) + 'K'}`; };
const away = (k: number | null, s: number) => (k == null ? '' : ` (${k >= s ? '+' : ''}${((k / s - 1) * 100).toFixed(1)}%)`);
const fmtK = (k: number) => (Number.isInteger(k) ? String(k) : k.toFixed(1));

/** Horizontal bars per strike: puts left (red), calls right (green), net as a dot; spot, walls and flip marked. */
function StrikeChart({ g, range }: { g: GammaRead; range: number }) {
  const rows = g.strikes.filter((s) => Math.abs(s.K / g.spot - 1) <= range).sort((a, b) => b.K - a.K);
  if (!rows.length) return <p className="small muted">No strikes with open interest near the price.</p>;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.call, -r.put)));
  const rh = 13, W = 620, R = 70, L = 52, mid = L + (W - L - R) / 2, half = (W - L - R) / 2 - 6, H = rows.length * rh + 16;
  const y = (k: number) => { const i = rows.findIndex((r) => r.K <= k); const j = i < 0 ? rows.length - 1 : i; return 8 + j * rh + (i < 0 ? rh : 0); };
  const ySpot = (() => { for (let i = 0; i < rows.length - 1; i++) if (rows[i].K >= g.spot && rows[i + 1].K <= g.spot) return 8 + i * rh + rh / 2 + ((rows[i].K - g.spot) / (rows[i].K - rows[i + 1].K || 1)) * rh; return null; })();
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="gx-svg" role="img" aria-label="Gamma exposure by strike">
      <line x1={mid} x2={mid} y1={4} y2={H - 4} className="gx-axis" />
      {rows.map((r, i) => {
        const yy = 8 + i * rh, wall = r.K === g.callWall ? 'call' : r.K === g.putWall ? 'put' : '';
        return (
          <g key={r.K} className={wall ? `gx-wall ${wall}` : ''}>
            <text x={L - 6} y={yy + rh - 3} className="gx-k">{fmtK(r.K)}</text>
            <rect x={mid - (-r.put / max) * half} y={yy + 2} width={(-r.put / max) * half} height={rh - 4} className="gx-put" />
            <rect x={mid} y={yy + 2} width={(r.call / max) * half} height={rh - 4} className="gx-call" />
            <circle cx={mid + (r.net / max) * half} cy={yy + rh / 2} r={2.2} className={r.net >= 0 ? 'gx-net up' : 'gx-net down'} />
            {wall && <text x={W - 2} y={yy + rh - 3} className="gx-tag">{wall === 'call' ? 'CALL WALL' : 'PUT WALL'}</text>}
            <title>{`${fmtK(r.K)}: calls ${bn(r.call)} · puts ${bn(r.put)} · net ${bn(r.net)} per 1% move`}</title>
          </g>
        );
      })}
      {ySpot != null && <><line x1={L} x2={W - R} y1={ySpot} y2={ySpot} className="gx-spot" /><text x={W - R + 4} y={ySpot + 3} className="gx-spot-l">price {g.spot.toFixed(1)}</text></>}
      {g.flip != null && g.flip <= rows[0].K && g.flip >= rows[rows.length - 1].K && <><line x1={L} x2={W - R} y1={y(g.flip)} y2={y(g.flip)} className="gx-flip" /><text x={W - R + 4} y={y(g.flip) + (ySpot != null && Math.abs(y(g.flip) - ySpot) < 12 ? (y(g.flip) < ySpot ? -6 : 14) : 3)} className="gx-flip-l">flip {g.flip.toFixed(1)}</text></>}
    </svg>
  );
}

/** Total GEX if the price moved to x: above the zero line dealers dampen moves, below it they add to them. */
function Profile({ g }: { g: GammaRead }) {
  const W = 620, H = 230, P = 34;
  const xs = g.profile.map((p) => p[0]), ys = g.profile.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), yAbs = Math.max(1, ...ys.map(Math.abs));
  const X = (v: number) => P + ((v - x0) / (x1 - x0 || 1)) * (W - P - 6), Y = (v: number) => H / 2 - (v / yAbs) * (H / 2 - 14);
  const d = g.profile.map(([s, v], i) => `${i ? 'L' : 'M'}${X(s).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="gx-svg" role="img" aria-label="Gamma profile">
      <line x1={P} x2={W - 4} y1={H / 2} y2={H / 2} className="gx-axis" />
      <path d={`${d}L${X(x1)},${H / 2}L${X(x0)},${H / 2}Z`} className="gx-area" />
      <path d={d} className="gx-line" />
      <line x1={X(g.spot)} x2={X(g.spot)} y1={6} y2={H - 14} className="gx-spot" />
      {g.flip != null && <line x1={X(g.flip)} x2={X(g.flip)} y1={6} y2={H - 14} className="gx-flip" />}
      <text x={P} y={H - 2} className="gx-k start">{x0.toFixed(0)}</text><text x={W - 6} y={H - 2} className="gx-k">{x1.toFixed(0)}</text>
      <text x={P + 2} y={12} className="gx-k start">+ dampens moves</text><text x={P + 2} y={H - 18} className="gx-k start">− amplifies moves</text>
    </svg>
  );
}

/** low IV = cool blue, high IV = warm red, both translucent so numbers stay readable in light and dark themes */
function ivColor(v: number, lo: number, hi: number) {
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo || 1)));
  const hue = 215 - 215 * t;
  return `hsl(${hue} 70% 50% / ${0.12 + 0.33 * Math.abs(t - 0.5) * 2})`;
}
function Surface({ rows }: { rows: IvRow[] }) {
  const all = rows.flatMap((r) => r.iv.filter((x): x is number => x != null));
  if (!all.length) return <p className="small muted">No IV data.</p>;
  const lo = Math.min(...all), hi = Math.max(...all);
  return (
    <table className="gx-iv">
      <thead><tr><th>Expiry</th>{MONEYNESS.map((m) => <th key={m} className={m === 1 ? 'atm' : ''}>{m === 1 ? 'ATM' : `${Math.round((m - 1) * 1000) / 10 > 0 ? '+' : ''}${Math.round((m - 1) * 1000) / 10}%`}</th>)}<th>Skew</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.exp}><td className="num">{r.exp.slice(5)} <span className="muted">{r.dte}d</span></td>
          {r.iv.map((v, i) => <td key={i} className="num" style={v != null ? { background: ivColor(v, lo, hi) } : undefined}>{v != null ? v.toFixed(1) : ''}</td>)}
          <td className="num">{r.skew != null ? r.skew.toFixed(1) : ''}</td></tr>
      ))}</tbody>
    </table>
  );
}
function Term({ rows }: { rows: IvRow[] }) {
  const pts = rows.filter((r) => r.atm != null);
  if (pts.length < 2) return null;
  const W = 620, H = 120, P = 40, lo = Math.min(...pts.map((p) => p.atm!)), hi = Math.max(...pts.map((p) => p.atm!)), dmax = Math.max(...pts.map((p) => p.dte), 1);
  const X = (d: number) => P + (d / dmax) * (W - P - 10), Y = (v: number) => H - 16 - ((v - lo) / (hi - lo || 1)) * (H - 30);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="gx-svg" role="img" aria-label="ATM implied volatility by days to expiry">
      <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.dte)},${Y(p.atm!)}`).join('')} className="gx-line" />
      {pts.map((p) => <circle key={p.exp} cx={X(p.dte)} cy={Y(p.atm!)} r={2.5} className="gx-dot"><title>{`${p.exp}: ATM IV ${p.atm!.toFixed(1)}%`}</title></circle>)}
      <text x={P} y={10} className="gx-k start">{hi.toFixed(1)}%</text><text x={P} y={H - 18} className="gx-k start">{lo.toFixed(1)}%</text>
      <text x={W - 6} y={H - 2} className="gx-k">{dmax} days</text>
    </svg>
  );
}

export default function Gamma({ mode, onChart }: { mode: DataMode; onChart: (s: string) => void }) {
  const [sym, setSym] = usePersisted<Sym>('gammaSym', 'SPY');
  const [range, setRange] = usePersisted<number>('gammaRange', 0.05);
  const { d, err } = useGamma(sym, mode);
  const g = d?.gex;
  const front = d?.surface[0];
  const regimeText = useMemo(() => !g ? '' : g.regime === 'positive'
    ? 'Positive gamma: dealers sell rallies and buy dips to stay hedged, which tends to calm moves and pull price toward big strikes.'
    : 'Negative gamma: dealers hedge in the same direction as the move, which tends to make swings bigger and faster.', [g]);
  return (
    <div className="page gx">
      <section className="panel">
        <div className="phead">
          <div className="phead-title">Gamma & IV</div>
          <div className="phead-ctl">
            <PageTabs<Sym> label="Ticker" value={sym} onChange={setSym} options={[{ id: 'SPY', label: 'SPY' }, { id: 'QQQ', label: 'QQQ' }, { id: 'IWM', label: 'IWM' }, { id: 'SPX', label: 'SPX' }]} />
            {d && <Fresh kind={d.demo ? 'demo' : 'delayed'} at={d.chainAsOf ?? d.asOf} src={d.source} />}
          </div>
        </div>
        {err && !d && <p className="small down gx-pad">Could not load the {sym} option chain: {err}</p>}
        {!d && !err && <div className="gx-pad"><p className="small muted">Loading the {sym} option chain…</p><Skel h={120} n={2} /></div>}
        {d && g && (
          <>
            <div className="gx-kpis">
              <div><span>Price</span><b className="num">{d.spot.toFixed(2)}</b></div>
              <div><span>Call wall</span><b className="num up">{g.callWall ?? '—'}</b><em>{away(g.callWall, d.spot)}</em></div>
              <div><span>Put wall</span><b className="num down">{g.putWall ?? '—'}</b><em>{away(g.putWall, d.spot)}</em></div>
              <div><span>Zero-gamma flip</span><b className="num">{g.flip != null ? g.flip.toFixed(1) : 'none near'}</b><em>{away(g.flip, d.spot)}</em></div>
              <div><span>Net gamma</span><b className={`num ${g.total >= 0 ? 'up' : 'down'}`}>{bn(g.total)}</b><em>per 1% move</em></div>
              <div><span>This week</span><b className="num small">{d.gexWeek.putWall ?? '—'} / {d.gexWeek.callWall ?? '—'}</b><em>put / call wall ≤7d</em></div>
              {front?.atm != null && <div><span>Front IV</span><b className="num">{front.atm.toFixed(1)}%</b><em>{front.exp.slice(5)}, skew {front.skew?.toFixed(1) ?? '—'}</em></div>}
              {d.pc.oi != null && <div><span>Put/call OI</span><b className="num">{d.pc.oi.toFixed(2)}</b><em>volume {d.pc.vol?.toFixed(2) ?? '—'}</em></div>}
              <button className="hw-btn" onClick={() => onChart(sym === 'SPX' ? 'SPY' : sym)}>Chart {sym === 'SPX' ? 'SPY' : sym}</button>
            </div>
            <p className={`small gx-pad ${g.regime === 'positive' ? '' : 'warn-txt'}`}>{regimeText}{g.flip != null ? (d.spot < g.flip ? ` Above ${g.flip.toFixed(1)} gamma turns positive again.` : ` Below ${g.flip.toFixed(1)} gamma turns negative.`) : ''}</p>
          </>
        )}
      </section>
      {d && g && (
        <div className="gx-grid">
          <section className="panel gx-card">
            <div className="gx-h"><Q k="calc" src="calculated on the desk from the delayed option chain (Cboe, ~15 min)" /><b>Gamma by strike</b><span className="small muted">expiries within {g.maxDte} days · red = puts, green = calls, dot = net</span>
              <Seg value={String(range) as '0.05'} onChange={(v) => setRange(+v)} options={[{ id: '0.03', label: '±3%' }, { id: '0.05', label: '±5%' }, { id: '0.08', label: '±8%' }] as { id: '0.05'; label: string }[]} /></div>
            <StrikeChart g={g} range={range} />
          </section>
          <div className="gx-col">
            <section className="panel gx-card"><div className="gx-h"><Q k="calc" src="calculated on the desk from the delayed option chain (Cboe, ~15 min)" /><b>Gamma profile</b><span className="small muted">net gamma if price moved here (±10%)</span></div><Profile g={g} /></section>
            <section className="panel gx-card"><div className="gx-h"><Q k="calc" src="calculated on the desk from the delayed option chain (Cboe, ~15 min)" /><b>Implied volatility surface</b><span className="small muted">% per year · out-of-the-money options · skew = IV at −5% minus +5%</span></div><Surface rows={d.surface} /></section>
            <section className="panel gx-card"><div className="gx-h"><Q k="calc" src="calculated on the desk from the delayed option chain (Cboe, ~15 min)" /><b>Term structure</b><span className="small muted">at-the-money IV by days to expiry{d.surface.length > 1 && d.surface[0].atm != null && d.surface[d.surface.length - 1].atm != null ? (d.surface[0].atm! > d.surface[d.surface.length - 1].atm! ? ' · inverted: near-term fear' : ' · upward: calm') : ''}</span></div><Term rows={d.surface} /></section>
          </div>
        </div>
      )}
      <p className="note gx-pad">How to read it: walls are the strikes with the most dealer gamma; price often stalls near the call wall and finds support near the put wall while gamma is positive. Under the flip, moves tend to speed up. These are estimates from open interest (updated once a day by the exchange) and assume dealers are long calls and short puts; they are not certain. Source: Cboe delayed option chain, about 15 minutes behind.</p>
    </div>
  );
}
