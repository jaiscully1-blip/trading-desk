// Credit market: spreads, yield curve, stress, bank lending, delinquencies and bond ETFs from free public sources (FRED, Yahoo), with
// the historical pattern and both sides of the argument. Facts and history only: no forecasts, no advice, nothing that can trade.
import { MoveChart } from './MoveChart';
import { useMemo } from 'react';
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
  if (lines.flatMap((l) => l.pts).length < 2) return <p className="muted small">No data.</p>;
  const fmt = (v: number) => (unit === '%' ? `${v.toFixed(2)}%` : v.toFixed(2));
  return <MoveChart series={lines.map((l) => ({ pts: l.pts.map((p) => ({ t: tm(p[0]), v: p[1] })), label: l.label, color: l.color, fmt }))} height={h} zero={zero} bands={recs.map(([s0, e0]) => [tm(s0), tm(e0)] as [number, number])} legend defaultRange="All" />;
}

const arrow = (v: number | null) => (v == null ? '' : v > 0.0005 ? '▲' : v < -0.0005 ? '▼' : '■');

function Card({ k, d }: { k: string; d: Resp['series'][string] | undefined }) {
  const m = META[k], s = d?.stats;
  if (!m || !d || !s) return null;
  const val = d.last?.value ?? s.last;
  return (
    <div className="credit-card" title={m.note}>
      <span className="small muted">{m.label}</span>
      <b className="num credit-val">{fmtVal(val, m.unit)}</b>
      <span className="small">{arrow(s.chg3m)} {s.chg3m == null ? '' : `${s.chg3m > 0 ? '+' : ''}${s.chg3m.toFixed(2)} in 3 mo`}</span>
      <span className="credit-pct" aria-hidden="true"><i style={{ left: `${s.pctile}%` }} /></span>
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
        <div className="sm-body credit">
          {!live ? <p className="hw-pad muted"><Fresh kind="demo" /> This page reads real data only, so it needs the live desk (the deployed site with its server).</p>
            : r.loading && !d ? <p className="hw-pad muted">Loading credit data…</p>
            : !d ? <p className="hw-pad muted">{r.error || r.data?.error || 'No data.'} The credit page needs the FRED_API_KEY that the desk already uses.</p>
            : (
              <>
                <p className="credit-intro">A credit spread is the extra yield investors demand to lend to a company instead of the US government. Wider means the market sees more default risk; tighter means less. Bond markets are large and often move before stocks, but they are not an oracle: this page shows what the data says and what each side of the argument says. It is not a forecast and not advice. Real credit-default-swap prices (single names) are paid data and not included.</p>
                <div className="credit-glance">
                  {hyS && reg && (
                    <div className="credit-gauge-box">
                      <span className="credit-k">Junk-bond spread vs history</span>
                      <div className="credit-gauge" aria-label={`High-yield spread is wider than ${Math.round(hyS.pctile)}% of readings since 1997`}>
                        <span className="credit-gauge-bar" /><i style={{ left: `${Math.min(99, Math.max(1, hyS.pctile))}%` }} />
                      </div>
                      <div className="credit-gauge-ends small"><span>Tight (calm)</span><span>Normal</span><span>Wide (stress)</span></div>
                      <b className={`credit-badge ${reg}`}>{reg === 'tight' ? 'Tight' : reg === 'wide' ? 'Wide' : 'Normal'} · {hyS.last.toFixed(2)} pp</b>
                    </div>
                  )}
                  <div className="credit-glance-list">
                    {curve && <div><span className="credit-k">Yield curve (10y − 2y)</span><b className={curve === 'inverted' ? 'down' : 'up'}>{curve === 'inverted' ? 'Inverted' : 'Normal'} · {fmtVal(d.series.c2!.stats!.last, 'pp')}</b></div>}
                    {d.series.stress?.stats && <div><span className="credit-k">Financial stress (0 = average)</span><b className={d.series.stress.stats.last > 0 ? 'down' : 'up'}>{d.series.stress.stats.last > 0 ? 'Above average' : 'Below average'} · {d.series.stress.stats.last.toFixed(2)}</b></div>}
                    {d.series.sloos?.stats && <div><span className="credit-k">Banks tightening loans (net %)</span><b className={d.series.sloos.stats.last > 0 ? 'down' : 'up'}>{d.series.sloos.stats.last > 0 ? 'Tightening' : 'Easing'} · {d.series.sloos.stats.last.toFixed(1)}%</b></div>}
                  </div>
                </div>
                <nav className="credit-nav" aria-label="Sections">
                  {[['credit-now', 'Both sides'], ['credit-spreads', 'Spreads'], ['credit-quality', 'Weak vs strong'], ['credit-curve', 'Yield curve'], ['credit-stress', 'Stress'], ['credit-lending', 'Lending'], ['credit-history', 'Past recessions'], ['credit-etfs', 'Bond ETFs']].map(([id, label]) => (
                    <button key={id} className="chip sm" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{label}</button>
                  ))}
                </nav>
                <div className="credit-cards">{(['hy', 'ig', 'bbb', 'ccc', 'c2', 'stress', 'nfci', 'sloos', 'card', 'mort'] as const).map((k) => <Card key={k} k={k} d={d.series[k]} />)}</div>

                {sides && hyS && (
                  <section className="credit-sec" id="credit-now">
                    <h3>Both sides: {sides.head.toLowerCase()}</h3>
                    <p className="credit-what">High-yield spread is {hyS.last.toFixed(2)} pp, wider than {Math.round(hyS.pctile)}% of readings since 1997. Its range since then: {hyS.min.toFixed(2)} ({dLabel(hyS.minDate)}) to {hyS.max.toFixed(2)} ({dLabel(hyS.maxDate)}).</p>
                    <div className="ins-both"><div><h4>The calmer reading</h4><ul className="small">{sides.calm.map((x) => <li key={x}>{x}</li>)}</ul></div><div><h4>The cautious reading</h4><ul className="small">{sides.caution.map((x) => <li key={x}>{x}</li>)}</ul></div></div>
                  </section>
                )}

                <section className="credit-sec" id="credit-spreads"><h3>Junk-bond and investment-grade spreads</h3><p className="credit-what">{META.hy.note}</p>
                  <LineChart unit="pp" recs={recs} lines={[{ label: 'High yield', pts: cut('hy'), color: COLORS[0] }, { label: 'BBB', pts: cut('bbb'), color: COLORS[1] }, { label: 'Investment grade', pts: cut('ig'), color: COLORS[4] }]} /></section>
                <section className="credit-sec" id="credit-quality"><h3>Weakest versus best junk bonds (CCC minus BB)</h3><p className="credit-what">When the market gets nervous, the riskiest borrowers are charged disproportionately more, so this gap widens first. A rising gap means investors are separating strong from weak; a narrow gap means they are not discriminating.</p>
                  <LineChart unit="pp" recs={recs} lines={[{ label: 'CCC minus BB', pts: lastNYears(quality, n), color: COLORS[2] }]} /></section>
                <section className="credit-sec" id="credit-curve"><h3>Yield curve</h3><p className="credit-what">{META.c2.note} {META.c3m.note}</p>
                  <LineChart unit="pp" zero recs={recs} lines={[{ label: '10y minus 2y', pts: cut('c2'), color: COLORS[0] }, { label: '10y minus 3m', pts: cut('c3m'), color: COLORS[3] }]} />
                  {csides && <div className="ins-both"><div><h4>Both sides: {csides.head.toLowerCase()}</h4><ul className="small">{csides.calm.map((x) => <li key={x}>{x}</li>)}</ul></div><div><h4>&nbsp;</h4><ul className="small">{csides.caution.map((x) => <li key={x}>{x}</li>)}</ul></div></div>}</section>
                <section className="credit-sec" id="credit-stress"><h3>Financial stress and conditions</h3><p className="credit-what">{META.stress.note} {META.nfci.note}</p>
                  <LineChart unit="index" zero recs={recs} lines={[{ label: 'St. Louis stress', pts: cut('stress'), color: COLORS[1] }, { label: 'Chicago conditions', pts: cut('nfci'), color: COLORS[3] }]} /></section>
                <section className="credit-sec" id="credit-lending"><h3>Bank lending and borrower health</h3><p className="credit-what">{META.sloos.note} Delinquencies tend to rise late in a cycle, after spreads have already moved, so they confirm more than they warn.</p>
                  <LineChart unit="%" recs={recs} lines={[{ label: 'Banks tightening (net %)', pts: cut('sloos'), color: COLORS[2] }]} h={210} />
                  <LineChart unit="%" recs={recs} lines={[{ label: 'Credit card delinquency', pts: cut('card'), color: COLORS[0] }, { label: 'Mortgage delinquency', pts: cut('mort'), color: COLORS[1] }]} h={210} /></section>

                {d.aroundRecessions.length > 0 && (
                  <section className="credit-sec" id="credit-history"><h3>What high-yield spreads did around past recessions</h3><p className="credit-what">Spreads were often not wide a year before a recession, and kept widening after it began. That cuts both ways: a low reading did not prevent trouble, and a high one has often come after the worst was visible.</p>
                    <div className="sm-tblwrap"><table className="sm-tbl"><thead><tr><th>Recession began</th><th className="r">1 year before</th><th className="r">At the start</th><th className="r">Peak in the next year</th></tr></thead>
                      <tbody>{d.aroundRecessions.map((x) => <tr key={x.start}><td>{dLabel(x.start)}</td><td className="r num">{x.before == null ? '—' : `${x.before.toFixed(2)} pp`}</td><td className="r num">{x.atStart == null ? '—' : `${x.atStart.toFixed(2)} pp`}</td><td className="r num">{x.peak == null ? '—' : `${x.peak.toFixed(2)} pp`}</td></tr>)}</tbody></table></div>
                    <p className="note">Only recessions since the spread series begins (1997) are shown: a small sample, so treat any pattern as suggestive, not a rule.</p></section>
                )}

                <section className="credit-sec" id="credit-etfs"><h3>Bond ETFs, last year</h3><p className="credit-what">Price change only (dividends excluded), from Yahoo Finance, delayed. Junk-bond ETFs falling while Treasury ETFs rise is the market choosing safety; all rising together usually means yields fell.</p>
                  {rebased.length > 0 && <LineChart unit="index" recs={[]} lines={rebased} h={230} />}
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
