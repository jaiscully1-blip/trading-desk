// Fundamentals charts (like a terminal's GF): revenue, profit, EPS, margins, free cash flow, shares, cash and debt from
// SEC filings, by fiscal year or quarter, with year-over-year change; up to three companies side by side.
import { useEffect, useState } from 'react';
import type { DataMode } from '../data/live';
import { yoy, type FundPoint, type Metric } from '../../shared/fundseries';
import { Q } from './common';

interface FundData { sym: string; name: string; annual: FundPoint[]; quarterly: FundPoint[]; source: string }
const METRICS: { id: Metric; label: string; kind: 'usd' | 'pct' | 'eps' | 'count' }[] = [
  { id: 'revenue', label: 'Revenue', kind: 'usd' }, { id: 'netIncome', label: 'Net income', kind: 'usd' }, { id: 'eps', label: 'EPS (diluted)', kind: 'eps' },
  { id: 'grossMargin', label: 'Gross margin', kind: 'pct' }, { id: 'opMargin', label: 'Operating margin', kind: 'pct' }, { id: 'netMargin', label: 'Net margin', kind: 'pct' },
  { id: 'fcf', label: 'Free cash flow', kind: 'usd' }, { id: 'shares', label: 'Shares out', kind: 'count' }, { id: 'cash', label: 'Cash', kind: 'usd' }, { id: 'debt', label: 'Long-term debt', kind: 'usd' },
];
const COLORS = ['var(--accent)', '#e8a33d', '#b48ef0'];
const fmt = (v: number | null, kind: string) => {
  if (v == null) return '—';
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  if (kind === 'pct') return `${v.toFixed(1)}%`;
  if (kind === 'eps') return `${s}$${a.toFixed(2)}`;
  const n = a >= 1e12 ? `${(a / 1e12).toFixed(2)}T` : a >= 1e9 ? `${(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(0)}M` : a.toFixed(0);
  return kind === 'count' ? `${s}${n}` : `${s}$${n}`;
};

function useFund(syms: string[], live: boolean) {
  const [st, setSt] = useState<Record<string, FundData | { error: string }>>({});
  const key = syms.join(',');
  useEffect(() => {
    if (!live) return;
    let stop = false;
    for (const s of syms) {
      if (st[s]) continue;
      fetch(`/api/research?fn=fundseries&symbol=${encodeURIComponent(s)}`).then(async (r) => { const j = await r.json(); if (!stop) setSt((x) => ({ ...x, [s]: r.ok ? j : { error: j.error ?? `HTTP ${r.status}` } })); }).catch((e) => !stop && setSt((x) => ({ ...x, [s]: { error: String(e) } })));
    }
    return () => { stop = true; };
  }, [key, live]); // eslint-disable-line react-hooks/exhaustive-deps
  return st;
}

export function FundCharts({ mode, sym, cfg, set, onSym }: { mode: DataMode; sym: string; cfg?: Record<string, any>; set?: (c: Record<string, any>) => void; onSym?: (s: string) => void }) {
  const [local, setLocal] = useState<Record<string, any>>({});
  const c = cfg ?? local, setC = set ?? setLocal;
  const metric: Metric = c.metric ?? 'revenue';
  const quarterly: boolean = c.q ?? false;
  const others: string[] = (c.compare as string[] | undefined) ?? [];
  const syms = [sym, ...others.filter((s) => s !== sym)].slice(0, 3);
  const data = useFund(syms, mode.kind === 'live');
  const [typed, setTyped] = useState('');
  const [typedMain, setTypedMain] = useState('');
  const m = METRICS.find((x) => x.id === metric)!;
  if (mode.kind !== 'live') return <p className="small muted hw-pad">Fundamentals come from SEC filings and need the live desk; nothing is shown in demo mode.</p>;
  const ok = syms.map((s) => data[s]).filter((d): d is FundData => !!d && 'annual' in d);
  const series = ok.map((d) => (quarterly ? d.quarterly : d.annual));
  // align by label (FY26 or 26Q3); the first company's periods set the axis
  const labels = series[0]?.map((p) => p.label) ?? [];
  const val = (k: number, label: string) => series[k]?.find((p) => p.label === label)?.[metric] ?? null;
  const all = labels.flatMap((l) => series.map((_, k) => val(k, l))).filter((x): x is number => x != null);
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all);
  const W = 640, H = 200, P = 8, base = 26, plotH = H - base - 14;
  const Y = (v: number) => 10 + (1 - (v - lo) / (hi - lo || 1)) * plotH;
  const groupW = (W - 2 * P) / Math.max(1, labels.length), barW = Math.max(3, (groupW - 6) / Math.max(1, series.length));
  const growth = series[0] ? yoy(series[0], metric, quarterly) : [];
  const add = () => { const s = typed.trim().toUpperCase(); if (/^[A-Z][A-Z0-9.]{0,9}$/.test(s) && s !== sym) setC({ ...c, compare: [...new Set([...others, s])].slice(0, 2) }); setTyped(''); };
  return (
    <div className="fc">
      <div className="fc-bar">
        <select value={metric} onChange={(e) => setC({ ...c, metric: e.target.value })} aria-label="Metric">{METRICS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
        <span className="chips"><button className={`chip sm ${!quarterly ? 'on' : ''}`} onClick={() => setC({ ...c, q: false })}>Annual</button><button className={`chip sm ${quarterly ? 'on' : ''}`} onClick={() => setC({ ...c, q: true })}>Quarterly</button></span>
        {onSym && <input className="tp-in" value={typedMain} onChange={(e) => setTypedMain(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { const s = typedMain.trim().toUpperCase().replace(/^\$/, ''); if (/^[A-Z][A-Z0-9.]{0,9}$/.test(s)) onSym(s); setTypedMain(''); } }} placeholder="ticker ↵" maxLength={10} aria-label="Company" />}
        {syms.map((s, k) => <span key={s} className="chip sm on fc-chip" style={{ borderColor: COLORS[k] }}>{s}{k > 0 && <button aria-label={`Remove ${s}`} onClick={() => setC({ ...c, compare: others.filter((x) => x !== s) })}>×</button>}</span>)}
        {syms.length < 3 && <input className="tp-in" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="compare ↵" maxLength={10} aria-label="Add a company to compare" />}
        <Q k="calc" src="SEC XBRL company facts; quarters worked out from year-to-date totals where companies report those; margins are calculated" />
      </div>
      {syms.map((s) => { const d = data[s]; return d && 'error' in d ? <p key={s} className="small muted hw-pad">{s}: {d.error}</p> : null; })}
      {!ok.length && !syms.some((s) => data[s] && 'error' in data[s]!) && <p className="small muted hw-pad">Reading {sym}'s filings…</p>}
      {labels.length > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="fc-svg" role="img" aria-label={`${m.label}, ${quarterly ? 'by quarter' : 'by fiscal year'}`}>
          <line x1={P} x2={W - P} y1={Y(0)} y2={Y(0)} className="an-zero" />
          {labels.map((l, i) => (
            <g key={l}>
              {series.map((_, k) => { const v = val(k, l); if (v == null) return null; const y0 = Y(Math.max(0, v)), y1 = Y(Math.min(0, v));
                return <rect key={k} x={P + i * groupW + 3 + k * barW} y={y0} width={barW - 1} height={Math.max(1, y1 - y0)} fill={COLORS[k]} opacity={v < 0 ? 0.55 : 0.9}><title>{`${syms[k]} ${l}: ${fmt(v, m.kind)}`}</title></rect>; })}
              <text x={P + i * groupW + groupW / 2} y={H - 14} className="fc-x">{l}</text>
              {series.length === 1 && growth[i] != null && <text x={P + i * groupW + groupW / 2} y={H - 3} className={`fc-g ${growth[i]! >= 0 ? 'up' : 'down'}`}>{growth[i]! >= 0 ? '+' : ''}{growth[i]!.toFixed(0)}{/Margin$/.test(metric) ? 'pt' : '%'}</text>}
            </g>
          ))}
        </svg>
      )}
      {ok.length > 0 && (
        <div className="fc-last small">
          {ok.map((d, k) => { const s = quarterly ? d.quarterly : d.annual, p = s[s.length - 1], g = yoy(s, metric, quarterly).at(-1);
            return p ? <span key={d.sym}><b style={{ color: COLORS[k] }}>{d.sym}</b> {p.label}: <b className="num">{fmt(p[metric], m.kind)}</b>{g != null && <span className={`num ${g >= 0 ? 'up' : 'down'}`}> {g >= 0 ? '+' : ''}{g.toFixed(1)}{/Margin$/.test(metric) ? ' pts' : '%'} y/y</span>}</span> : null; })}
        </div>
      )}
      <p className="note small">From each company's 10-K and 10-Q filings. Fiscal years differ between companies, so side-by-side bars line up by label, not by exact dates. One-off items (big investment gains, write-offs) show up as reported.</p>
    </div>
  );
}
