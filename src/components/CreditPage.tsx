// Credit market: spreads, yield curve, stress, bank lending, delinquencies and bond ETFs from free public sources (FRED, Yahoo), with
// the historical pattern and both sides of the argument. Facts and history only: no forecasts, no advice, nothing that can trade.
import { useMemo, useRef, useState } from 'react';
import { CURVE_SIDES, ETFS, SERIES, SIDES, fmtVal, lastNYears, regimeOf, type Meta, type Pts, type RecRow, type Stats } from '../../shared/credit';
import { useApi } from '../data/apis';
import type { DataMode } from '../data/live';
import { usePersisted } from '../lib/store';
import { Fresh, Seg } from './common';

interface Resp {
  series: Record<string, { id: string; pts: Pts; last: { date: string; value: number } | null; stats: Stats | null }>;
  recessions: [string, string][]; aroundRecessions: RecRow[];
  etfs: Record<string, { closes: number[]; ts: number[] }>; errors: Record<string, string>; asOf: number; source: string; error?: string;
}
const META = Object.fromEntries(SERIES.map((m) => [m.key, m])) as Record<string, Meta>;
const COLORS = ['var(--accent)', 'var(--warn, #d29922)', 'var(--down)', 'var(--demo, #a371f7)', 'var(--up)'];
const tm = (d: string) => Date.parse(`${d}T12:00:00Z`);
const dLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

interface Line { label: string; pts: Pts; color: string }
function LineChart({ lines, recs, zero, unit, h = 190 }: { lines: Line[]; recs: [string, string][]; zero?: boolean; unit: Meta['unit']; h?: number }) {
  const W = 640, P = { l: 40, r: 8, t: 8, b: 20 };
  const [hov, setHov] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const all = lines.flatMap((l) => l.pts);
  if (all.length < 2) return <p className="muted small">No data.</p>;
  const t0 = Math.min(...lines.map((l) => tm(l.pts[0][0]))), t1 = Math.max(...lines.map((l) => tm(l.pts[l.pts.length - 1][0])));
  let lo = Math.min(...all.map((p) => p[1]), zero ? 0 : Infinity), hi = Math.max(...all.map((p) => p[1]), zero ? 0 : -Infinity);
  const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
  const x = (d: string) => P.l + ((tm(d) - t0) / (t1 - t0 || 1)) * (W - P.l - P.r), y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (h - P.t - P.b);
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  const yrs: number[] = []; for (let yy = new Date(t0).getUTCFullYear() + 1; yy <= new Date(t1).getUTCFullYear(); yy++) yrs.push(yy);
  const step = Math.max(1, Math.ceil(yrs.length / 7));
  const base = lines[0].pts;
  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W;
    const target = t0 + ((px - P.l) / (W - P.l - P.r)) * (t1 - t0); let best = 0, bd = Infinity;
    base.forEach((p, i) => { const dd = Math.abs(tm(p[0]) - target); if (dd < bd) { bd = dd; best = i; } });
    setHov(best);
  };
  const hp = hov != null ? base[hov] : null;
  return (
    <div className="cm-chart">
      <div className="cm-hover small">{hp ? <><b>{dLabel(hp[0])}</b>{lines.map((l, k) => { const v = l.pts.find((p) => p[0] === hp[0])?.[1] ?? l.pts.reduce<[string, number] | null>((b, p) => (b == null || Math.abs(tm(p[0]) - tm(hp[0])) < Math.abs(tm(b[0]) - tm(hp[0])) ? p : b), null)?.[1]; return <span key={k} style={{ color: l.color }}> {lines.length > 1 ? `${l.label}: ` : ''}{v == null ? '—' : fmtVal(v, unit)}</span>; })}</> : <span className="muted">Hover for values. Shaded bands are US recessions (NBER).</span>}</div>
      <svg ref={ref} viewBox={`0 0 ${W} ${h}`} className="cm-svg" onMouseMove={onMove} onMouseLeave={() => setHov(null)} role="img" aria-label={lines.map((l) => l.label).join(', ')}>
        {recs.map(([s, e], i) => { const a = Math.max(P.l, x(s)), b = Math.min(W - P.r, x(e)); return b > a ? <rect key={i} x={a} y={P.t} width={b - a} height={h - P.t - P.b} className="cm-rec" /> : null; })}
        {ticks.map((v, i) => <g key={i}><line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} className="cm-grid" /><text x={P.l - 4} y={y(v) + 3} textAnchor="end" className="cm-t">{unit === '%' ? v.toFixed(1) : v.toFixed(Math.abs(hi - lo) > 20 ? 0 : 1)}</text></g>)}
        {yrs.filter((_, i) => i % step === 0).map((yy) => <text key={yy} x={x(`${yy}-01-01`)} y={h - 5} textAnchor="middle" className="cm-t">{yy}</text>)}
        {zero && lo < 0 && hi > 0 && <line x1={P.l} x2={W - P.r} y1={y(0)} y2={y(0)} className="cm-zero" />}
        {lines.map((l, k) => <polyline key={k} fill="none" stroke={l.color} strokeWidth="1.6" points={l.pts.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')} />)}
        {hp && <line x1={x(hp[0])} x2={x(hp[0])} y1={P.t} y2={h - P.b} className="cm-cross" />}
      </svg>
      {lines.length > 1 && <div className="cm-leg small">{lines.map((l, k) => <span key={k} style={{ color: l.color }}>● {l.label}</span>)}</div>}
    </div>
  );
}

const arrow = (v: number | null) => (v == null ? '' : v > 0.0005 ? '▲' : v < -0.0005 ? '▼' : '■');
function Card({ k, d }: { k: string; d: Resp['series'][string] | undefined }) {
  const m = META[k], s = d?.stats;
  if (!m || !d || !s) return null;
  const val = d.last?.value ?? s.last;
  return (
    <div className="cm-card" title={m.note}>
      <span className="small muted">{m.label}</span>
      <b className="num cm-val">{fmtVal(val, m.unit)}</b>
      <span className="small">{arrow(s.chg3m)} {s.chg3m == null ? '' : `${s.chg3m > 0 ? '+' : ''}${s.chg3m.toFixed(2)} in 3 mo`}</span>
      <span className="cm-pct" aria-hidden="true"><i style={{ left: `${s.pctile}%` }} /></span>
      <span className="small muted">higher than {Math.round(s.pctile)}% of readings since {m.daily ? '1997' : 'the series began'}</span>
    </div>
  );
}

export default function CreditPage({ mode, onPage }: { mode: DataMode; onPage: (p: 'distress') => void }) {
  const r = useApi<Resp>('/api/research?fn=credit', 0, 3 * 3600_000);
  const [yrs, setYrs] = usePersisted<'2' | '5' | '10'>('creditYears', '5');
  const live = mode.kind === 'live';
  const d = r.data && !r.data.error ? r.data : null;
  const n = Number(yrs);
  const cut = (k: string) => lastNYears(d?.series[k]?.pts ?? [], n);
  const hyS = d?.series.hy?.stats ?? null;
  const reg = hyS ? regimeOf(hyS.pctile) : null;
  const curve = d?.series.c2?.stats ? (d.series.c2.stats.last < 0 ? 'inverted' : 'normal') : null;
  const quality = useMemo(() => { const c = d?.series.ccc?.pts ?? [], b = d?.series.bb?.pts ?? []; const bm = new Map(b.map((p) => [p[0], p[1]])); return c.filter((p) => bm.has(p[0])).map((p) => [p[0], p[1] - bm.get(p[0])!] as [string, number]); }, [d]);
  const etf = useMemo(() => ETFS.map((e) => { const x = d?.etfs[e.sym]; if (!x || x.closes.length < 30) return null; const c = x.closes, last = c[c.length - 1], at = (k: number) => (c.length > k ? (last / c[c.length - 1 - k] - 1) * 100 : null); return { ...e, last, m1: at(21), m3: at(63), m6: at(126), y1: (last / c[0] - 1) * 100 }; }).filter(Boolean) as { sym: string; name: string; what: string; last: number; m1: number | null; m3: number | null; m6: number | null; y1: number }[], [d]);
  const rebased = useMemo(() => ['HYG', 'LQD', 'TLT', 'BKLN'].map((s, i) => { const x = d?.etfs[s]; if (!x || x.ts.length < 2) return null; return { label: s, color: COLORS[i], pts: x.closes.map((c, j) => [new Date(x.ts[j] * 1000).toISOString().slice(0, 10), (c / x.closes[0]) * 100] as [string, number]) }; }).filter(Boolean) as Line[], [d]);
  const recs = d?.recessions ?? [];
  const sides = reg ? SIDES[reg] : null;
  const csides = curve ? CURVE_SIDES[curve] : null;
  const pctC = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);

  return (
    <div className="overlay" role="dialog" aria-label="Credit market">
      <div className="overlay-in sm">
        <div className="phead">
          <div className="phead-title">Credit market</div>
          <div className="phead-ctl"><Seg value={yrs} onChange={setYrs} options={[{ id: '2', label: '2 yrs' }, { id: '5', label: '5 yrs' }, { id: '10', label: '10 yrs' }]} />{d && <Fresh kind="eod" at={d.asOf} src={d.source} />}</div>
        </div>
        <div className="sm-body cm">
          {!live ? <p className="hw-pad muted"><Fresh kind="demo" /> This page reads real data only, so it needs the live desk (the deployed site with its server).</p>
            : r.loading && !d ? <p className="hw-pad muted">Loading credit data…</p>
            : !d ? <p className="hw-pad muted">{r.error || r.data?.error || 'No data.'} The credit page needs the FRED_API_KEY that the desk already uses.</p>
            : (
              <>
                <p className="small muted cm-intro">A credit spread is the extra yield investors demand to lend to a company instead of the US government. Wider means the market sees more default risk; tighter means less. Bond markets are large and often move before stocks, but they are not an oracle: this page shows what the data says and what each side of the argument says. It is not a forecast and not advice. Real credit-default-swap prices (single names) are paid data and not included.</p>
                <div className="cm-cards">{(['hy', 'ig', 'bbb', 'ccc', 'c2', 'stress', 'nfci', 'sloos', 'card', 'mort'] as const).map((k) => <Card key={k} k={k} d={d.series[k]} />)}</div>

                {sides && hyS && (
                  <section className="cm-sec">
                    <h3>Both sides: {sides.head.toLowerCase()}</h3>
                    <p className="small muted">High-yield spread is {hyS.last.toFixed(2)} pp, wider than {Math.round(hyS.pctile)}% of readings since 1997. Its range since then: {hyS.min.toFixed(2)} ({dLabel(hyS.minDate)}) to {hyS.max.toFixed(2)} ({dLabel(hyS.maxDate)}).</p>
                    <div className="ins-both"><div><h4>The calmer reading</h4><ul className="small">{sides.calm.map((x) => <li key={x}>{x}</li>)}</ul></div><div><h4>The cautious reading</h4><ul className="small">{sides.caution.map((x) => <li key={x}>{x}</li>)}</ul></div></div>
                  </section>
                )}

                <section className="cm-sec"><h3>Junk-bond and investment-grade spreads</h3><p className="small muted">{META.hy.note}</p>
                  <LineChart unit="pp" recs={recs} lines={[{ label: 'High yield', pts: cut('hy'), color: COLORS[0] }, { label: 'BBB', pts: cut('bbb'), color: COLORS[1] }, { label: 'Investment grade', pts: cut('ig'), color: COLORS[4] }]} /></section>
                <section className="cm-sec"><h3>Weakest versus best junk bonds (CCC minus BB)</h3><p className="small muted">When the market gets nervous, the riskiest borrowers are charged disproportionately more, so this gap widens first. A rising gap means investors are separating strong from weak; a narrow gap means they are not discriminating.</p>
                  <LineChart unit="pp" recs={recs} lines={[{ label: 'CCC minus BB', pts: lastNYears(quality, n), color: COLORS[2] }]} /></section>
                <section className="cm-sec"><h3>Yield curve</h3><p className="small muted">{META.c2.note} {META.c3m.note}</p>
                  <LineChart unit="pp" zero recs={recs} lines={[{ label: '10y minus 2y', pts: cut('c2'), color: COLORS[0] }, { label: '10y minus 3m', pts: cut('c3m'), color: COLORS[3] }]} />
                  {csides && <div className="ins-both"><div><h4>Both sides: {csides.head.toLowerCase()}</h4><ul className="small">{csides.calm.map((x) => <li key={x}>{x}</li>)}</ul></div><div><h4>&nbsp;</h4><ul className="small">{csides.caution.map((x) => <li key={x}>{x}</li>)}</ul></div></div>}</section>
                <section className="cm-sec"><h3>Financial stress and conditions</h3><p className="small muted">{META.stress.note} {META.nfci.note}</p>
                  <LineChart unit="index" zero recs={recs} lines={[{ label: 'St. Louis stress', pts: cut('stress'), color: COLORS[1] }, { label: 'Chicago conditions', pts: cut('nfci'), color: COLORS[3] }]} /></section>
                <section className="cm-sec"><h3>Bank lending and borrower health</h3><p className="small muted">{META.sloos.note} Delinquencies tend to rise late in a cycle, after spreads have already moved, so they confirm more than they warn.</p>
                  <LineChart unit="%" recs={recs} lines={[{ label: 'Banks tightening (net %)', pts: cut('sloos'), color: COLORS[2] }]} h={150} />
                  <LineChart unit="%" recs={recs} lines={[{ label: 'Credit card delinquency', pts: cut('card'), color: COLORS[0] }, { label: 'Mortgage delinquency', pts: cut('mort'), color: COLORS[1] }]} h={150} /></section>

                {d.aroundRecessions.length > 0 && (
                  <section className="cm-sec"><h3>What high-yield spreads did around past recessions</h3><p className="small muted">Spreads were often not wide a year before a recession, and kept widening after it began. That cuts both ways: a low reading did not prevent trouble, and a high one has often come after the worst was visible.</p>
                    <div className="sm-tblwrap"><table className="sm-tbl"><thead><tr><th>Recession began</th><th className="r">1 year before</th><th className="r">At the start</th><th className="r">Peak in the next year</th></tr></thead>
                      <tbody>{d.aroundRecessions.map((x) => <tr key={x.start}><td>{dLabel(x.start)}</td><td className="r num">{x.before == null ? '—' : `${x.before.toFixed(2)} pp`}</td><td className="r num">{x.atStart == null ? '—' : `${x.atStart.toFixed(2)} pp`}</td><td className="r num">{x.peak == null ? '—' : `${x.peak.toFixed(2)} pp`}</td></tr>)}</tbody></table></div>
                    <p className="note">Only recessions since the spread series begins (1997) are shown: a small sample, so treat any pattern as suggestive, not a rule.</p></section>
                )}

                <section className="cm-sec"><h3>Bond ETFs, last year</h3><p className="small muted">Price change only (dividends excluded), from Yahoo Finance, delayed. Junk-bond ETFs falling while Treasury ETFs rise is the market choosing safety; all rising together usually means yields fell.</p>
                  {rebased.length > 0 && <LineChart unit="index" recs={[]} lines={rebased} h={170} />}
                  {etf.length > 0 && <div className="sm-tblwrap"><table className="sm-tbl"><thead><tr><th>ETF</th><th>Holds</th><th className="r">1 mo</th><th className="r">3 mo</th><th className="r">6 mo</th><th className="r">1 yr</th></tr></thead>
                    <tbody>{etf.map((e) => <tr key={e.sym}><td><b>{e.sym}</b> <span className="small muted">{e.name}</span></td><td className="small">{e.what}</td><td className="r num">{pctC(e.m1)}</td><td className="r num">{pctC(e.m3)}</td><td className="r num">{pctC(e.m6)}</td><td className="r num">{pctC(e.y1)}</td></tr>)}</tbody></table></div>}</section>

                <p className="note">Sources: FRED (ICE BofA indices, Treasury yields, St. Louis Fed and Chicago Fed indices, Fed lending survey, bank delinquency rates, NBER recession dates). Company-level stress is on the <button className="link" onClick={() => onPage('distress')}>Distress page</button>. {Object.keys(d.errors).length > 0 && `Not loaded: ${Object.keys(d.errors).join(', ')}.`}</p>
              </>
            )}
        </div>
      </div>
    </div>
  );
}
