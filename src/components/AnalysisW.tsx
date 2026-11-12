// Analysis widget: Compare (several tickers on one % chart), Beta (regression of a stock's daily returns on a benchmark's)
// and Returns (distribution of daily moves), all from a year of daily closes. Plus the Trending widget (Reddit mentions).
import { useEffect, useMemo, useState } from 'react';
import type { DataMode } from '../data/live';
import { betaStats, compareSeries, returnDist, type Closes, type Trend } from '../../shared/analysis';
import { Fresh, Seg, Star } from './common';

const PALETTE = ['var(--accent)', '#e8a33d', '#b48ef0', '#4e9af1', '#e05d5d', '#3fb68b'];
type Tab = 'compare' | 'beta' | 'returns';
type Range = '1M' | '3M' | '6M' | '1Y';
const DAYS: Record<Range, number> = { '1M': 31, '3M': 92, '6M': 183, '1Y': 366 };

function useCloses(syms: string[], live: boolean) {
  const [st, setSt] = useState<{ closes: Record<string, Closes>; missing: string[]; err: string | null; loading: boolean }>({ closes: {}, missing: [], err: null, loading: false });
  const key = syms.join(',');
  useEffect(() => {
    if (!live || !syms.length) return;
    let stop = false;
    setSt((s) => ({ ...s, loading: true }));
    fetch(`/api/research?fn=closes&symbols=${encodeURIComponent(key)}`).then(async (r) => { const j = await r.json(); if (!stop) setSt(r.ok ? { closes: j.closes, missing: j.missing ?? [], err: null, loading: false } : { closes: {}, missing: [], err: j.error ?? `HTTP ${r.status}`, loading: false }); }).catch((e) => !stop && setSt({ closes: {}, missing: [], err: String(e), loading: false }));
    return () => { stop = true; };
  }, [key, live]); // eslint-disable-line react-hooks/exhaustive-deps
  return st;
}

function Lines({ times, lines }: { times: number[]; lines: Record<string, number[]> }) {
  const syms = Object.keys(lines);
  if (times.length < 2) return <p className="small muted hw-pad">Not enough shared history.</p>;
  const W = 420, H = 170, P = 34;
  const all = syms.flatMap((s) => lines[s]);
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all);
  const X = (i: number) => P + (i / (times.length - 1)) * (W - P - 8), Y = (v: number) => 8 + (1 - (v - lo) / (hi - lo || 1)) * (H - 26);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="an-svg" role="img" aria-label="Percent change since the start">
      <line x1={P} x2={W - 8} y1={Y(0)} y2={Y(0)} className="an-zero" />
      {syms.map((s, k) => <path key={s} d={lines[s].map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('')} fill="none" stroke={PALETTE[k % PALETTE.length]} strokeWidth={1.6} />)}
      <text x={2} y={Y(hi) + 4} className="an-t">{hi.toFixed(0)}%</text><text x={2} y={Y(lo)} className="an-t">{lo.toFixed(0)}%</text>
      <text x={P} y={H - 2} className="an-t">{new Date(times[0] * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</text>
      <text x={W - 8} y={H - 2} className="an-t end">{new Date(times[times.length - 1] * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</text>
    </svg>
  );
}

export function AnalysisW({ mode, sel, cfg, set }: { mode: DataMode; sel: string; cfg: Record<string, any>; set: (c: Record<string, any>) => void }) {
  const tab: Tab = cfg.tab ?? 'compare';
  const range: Range = cfg.range ?? '6M';
  const syms: string[] = [...new Set<string>((cfg.syms as string[] | undefined)?.length ? cfg.syms : [sel || 'NVDA', 'SPY', 'QQQ'])];
  const bench: string = cfg.bench ?? 'SPY';
  const [typed, setTyped] = useState('');
  const want = tab === 'compare' ? syms : [syms[0], bench];
  const { closes, missing, err, loading } = useCloses([...new Set(want)], mode.kind === 'live');
  const from = Date.now() / 1000 - DAYS[range] * 86400;
  const cmp = useMemo(() => compareSeries(Object.fromEntries(syms.filter((s) => closes[s]).map((s) => [s, closes[s]])), from), [closes, syms.join(','), range]); // eslint-disable-line react-hooks/exhaustive-deps
  const beta = useMemo(() => (closes[syms[0]] && closes[bench] ? betaStats(closes[syms[0]].filter(([t]) => t >= from), closes[bench].filter(([t]) => t >= from)) : null), [closes, syms[0], bench, range]); // eslint-disable-line react-hooks/exhaustive-deps
  const dist = useMemo(() => (closes[syms[0]] ? returnDist(closes[syms[0]].filter(([t]) => t >= from)) : null), [closes, syms[0], range]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = () => {
    const s = typed.trim().toUpperCase().replace(/^\$/, '');
    if (/^[A-Z][A-Z0-9.]{0,9}$/.test(s)) set({ ...cfg, syms: tab === 'compare' ? [...new Set([...syms, s])].slice(0, 6) : [s, ...syms.slice(1)] });
    setTyped('');
  };
  if (mode.kind !== 'live') return <p className="hw-pad small muted">Analysis needs the live desk (a year of daily closes); nothing is shown in demo mode.</p>;
  return (
    <div className="an">
      <div className="wm-h">
        <Seg<Tab> value={tab} onChange={(t) => set({ ...cfg, tab: t })} options={[{ id: 'compare', label: 'Compare' }, { id: 'beta', label: 'Beta' }, { id: 'returns', label: 'Returns' }]} />
        <Seg<Range> value={range} onChange={(r) => set({ ...cfg, range: r })} options={(['1M', '3M', '6M', '1Y'] as Range[]).map((r) => ({ id: r, label: r }))} />
      </div>
      <div className="an-syms">
        {(tab === 'compare' ? syms : [syms[0]]).map((s, k) => (
          <span key={s} className="chip sm on an-chip" style={{ borderColor: tab === 'compare' ? PALETTE[k % PALETTE.length] : undefined }}>{s}{tab === 'compare' && cmp.lines[s] ? <b className="num"> {cmp.lines[s][cmp.lines[s].length - 1] >= 0 ? '+' : ''}{cmp.lines[s][cmp.lines[s].length - 1].toFixed(1)}%</b> : null}
            {tab === 'compare' && syms.length > 1 && <button aria-label={`Remove ${s}`} onClick={() => set({ ...cfg, syms: syms.filter((x) => x !== s) })}>×</button>}</span>
        ))}
        {tab === 'beta' && <span className="small muted">vs <select value={bench} onChange={(e) => set({ ...cfg, bench: e.target.value })}>{['SPY', 'QQQ', 'IWM', 'DIA', 'TLT', 'GLD'].map((b) => <option key={b}>{b}</option>)}</select></span>}
        <input className="tp-in" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder={tab === 'compare' ? 'add ticker ↵' : 'ticker ↵'} maxLength={10} aria-label="Ticker" />
      </div>
      {err ? <p className="hw-pad small down">{err}</p> : loading && !Object.keys(closes).length ? <p className="hw-pad small muted">Loading closes…</p> : (
        <>
          {tab === 'compare' && <Lines times={cmp.times} lines={cmp.lines} />}
          {tab === 'beta' && (beta ? (
            <div className="an-beta">
              <svg viewBox="0 0 220 160" className="an-svg sm" role="img" aria-label={`${syms[0]} daily returns against ${bench}`}>
                {(() => { const mx = Math.max(1, ...beta.points.flatMap(([a, b]) => [Math.abs(a), Math.abs(b)])); const S = (v: number, n: number) => n / 2 + (v / mx) * (n / 2 - 6);
                  return <><line x1={0} x2={220} y1={80} y2={80} className="an-zero" /><line x1={110} x2={110} y1={0} y2={160} className="an-zero" />
                    {beta.points.map(([bx, ax], i) => <circle key={i} cx={S(bx, 220)} cy={160 - S(ax, 160)} r={1.6} className="an-dot" />)}
                    <line x1={S(-mx, 220)} y1={160 - S(-mx * beta.beta, 160)} x2={S(mx, 220)} y2={160 - S(mx * beta.beta, 160)} className="an-fit" /></>; })()}
              </svg>
              <div className="kv small">
                <span>Beta</span><b className="num">{beta.beta.toFixed(2)}</b>
                <span>Correlation</span><b className="num">{beta.corr.toFixed(2)}</b>
                <span>R²</span><b className="num">{beta.r2.toFixed(2)}</b>
                <span title="Return not explained by the benchmark, per year">Alpha / yr</span><b className={`num ${beta.alphaAnn >= 0 ? 'up' : 'down'}`}>{beta.alphaAnn >= 0 ? '+' : ''}{beta.alphaAnn.toFixed(1)}%</b>
                <span>Volatility / yr</span><b className="num">{beta.volAnn.toFixed(0)}% <span className="muted">vs {beta.benchVolAnn.toFixed(0)}%</span></b>
                <span>Days</span><b className="num">{beta.n}</b>
              </div>
              <p className="note small">Beta 1.5 means {syms[0]} has tended to move about 1.5% for each 1% {bench} moves. A low R² means {bench} explains little of its day-to-day moves. History, not a forecast.</p>
            </div>
          ) : <p className="hw-pad small muted">Need at least 30 shared days.</p>)}
          {tab === 'returns' && (dist ? (
            <div className="an-ret">
              <svg viewBox="0 0 420 140" className="an-svg" role="img" aria-label={`${syms[0]} distribution of daily returns`}>
                {(() => { const mx = Math.max(...dist.bins.map((b) => b.n)); const w = 400 / dist.bins.length;
                  return dist.bins.map((b, i) => <rect key={i} x={10 + i * w} y={120 - (b.n / mx) * 110} width={Math.max(1, w - 1)} height={(b.n / mx) * 110} className={b.from >= 0 ? 'an-up' : 'an-dn'}><title>{`${b.from.toFixed(1)}% to ${(b.from + 0.5).toFixed(1)}%: ${b.n} days`}</title></rect>); })()}
                <text x={10} y={134} className="an-t">{dist.bins[0].from.toFixed(1)}%</text><text x={410} y={134} className="an-t end">{(dist.bins[dist.bins.length - 1].from + 0.5).toFixed(1)}%</text>
              </svg>
              <div className="kv small">
                <span>Average day</span><b className="num">{dist.mean >= 0 ? '+' : ''}{dist.mean.toFixed(2)}%</b>
                <span>Typical swing (1 sd)</span><b className="num">±{dist.sd.toFixed(2)}%</b>
                <span>Up days</span><b className="num">{dist.upPct.toFixed(0)}%</b>
                <span>Best / worst day</span><b className="num"><span className="up">+{dist.best.pct.toFixed(1)}%</span> / <span className="down">{dist.worst.pct.toFixed(1)}%</span></b>
                <span title="A normal bell curve would put about 4.6% of days here">Days beyond 2 sd</span><b className="num">{dist.beyond2sd.toFixed(1)}%</b>
                <span title="Negative = the big moves have been mostly down">Skew</span><b className="num">{dist.skew.toFixed(2)}</b>
              </div>
            </div>
          ) : <p className="hw-pad small muted">Need at least 20 days.</p>)}
          {missing.length > 0 && <p className="small muted hw-pad">No data for {missing.join(', ')}.</p>}
        </>
      )}
    </div>
  );
}

/* ---------------- trending on Reddit ---------------- */
export function TrendingW({ mode, onChart }: { mode: DataMode; onChart: (s: string) => void }) {
  const [d, setD] = useState<{ rows: Trend[]; asOf: number; source: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (mode.kind !== 'live') return;
    let stop = false;
    const go = () => fetch('/api/research?fn=trending').then(async (r) => { const j = await r.json(); if (!stop) { if (r.ok) { setD(j); setErr(null); } else setErr(j.error ?? `HTTP ${r.status}`); } }).catch((e) => !stop && setErr(String(e)));
    go();
    const id = setInterval(() => { if (!document.hidden) go(); }, 15 * 60_000);
    return () => { stop = true; clearInterval(id); };
  }, [mode.kind]);
  if (mode.kind !== 'live') return <p className="hw-pad small muted">Trending needs the live desk; nothing is shown in demo mode.</p>;
  if (err && !d) return <p className="hw-pad small down">{err}</p>;
  if (!d) return <p className="hw-pad small muted">Loading…</p>;
  return (
    <div className="tr">
      <div className="wm-h small muted">Most mentioned on Reddit, last 24 h <Fresh kind="delayed" at={d.asOf} src={d.source} /></div>
      <div className="wm-list">
        {d.rows.slice(0, 30).map((r) => {
          const chg = r.mentions24hAgo ? (r.mentions / r.mentions24hAgo - 1) * 100 : null;
          const moved = r.rank24hAgo != null ? r.rank24hAgo - r.rank : null;
          return (
            <div key={r.sym} className="tr-row">
              <span className="num muted">{r.rank}</span>
              <span><Star sym={r.sym} /><button className="wl-sym" onClick={() => onChart(r.sym)} title={r.name}>{r.sym}</button></span>
              <span className="num">{r.mentions.toLocaleString('en-US')}</span>
              <span className={`num small ${chg == null ? 'muted' : chg >= 0 ? 'up' : 'down'}`}>{chg != null ? `${chg >= 0 ? '+' : ''}${chg.toFixed(0)}%` : 'new'}</span>
              <span className={`num small ${moved == null || moved === 0 ? 'muted' : moved > 0 ? 'up' : 'down'}`}>{moved == null ? '' : moved === 0 ? '=' : moved > 0 ? `▲${moved}` : `▼${-moved}`}</span>
            </div>
          );
        })}
      </div>
      <p className="note small">Mentions measure attention, not direction: a ticker can trend because people are excited or because it's falling apart.</p>
    </div>
  );
}
