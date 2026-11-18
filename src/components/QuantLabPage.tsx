// Quant Lab: pick a stock and the relationship finder tests its quarterly returns against the market, sectors, rates,
// commodities, the company's own earnings (SEC) and, for 22 companies that sell on Amazon, the tone of their product
// reviews. Statistics only, run in the browser; every result says how much history it rests on and whether it survives
// the many-tests check. Data, not advice.
import { useEffect, useMemo, useState } from 'react';
import { PageHero } from './PageHero';
import { Fresh } from './common';
import { usePersisted } from '../lib/store';
import type { FundPoint } from '../../shared/fundseries';
import {
  FACTORS, LEVEL_FACTORS, MIN_REVIEWS, align, bestPerSeries, diff, pearson, qKey, quarterEnd, quarterlyReturns, reasonMix, scan,
  toneCandidates, verdict, yoyPct, type Candidate, type Finding, type Series, type ToneCo,
} from '../../shared/quantlab';

type C = { t: number; c: number };
interface QResp { sym: string; stock: C[]; factors: Record<string, C[]>; fund: { name?: string; quarterly?: FundPoint[]; error?: string }; asOf: number; source: string; error?: string }
interface ToneDoc { source: string; built: string; coverageEnds: string; method: string; companies: Record<string, ToneCo> }
const SYM_RE = /^[A-Z^][A-Z0-9.\-]{0,9}$/;
const f2 = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2);
const pc = (v: number, dp = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(dp)}%`;
const lagText = (l: number) => (l === 0 ? 'same quarter' : l > 0 ? `leads by ${l}q` : `follows by ${-l}q`);
const fq = (label: string) => `20${label.slice(0, 2)}${label.slice(2)}`; // "19Q3" -> "2019Q3"

let toneP: Promise<ToneDoc> | null = null;
const loadTone = () => (toneP ??= fetch('/data/reviewtone.json').then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }));

function fundCands(rows: FundPoint[] = []): Candidate[] {
  const s = (f: (p: FundPoint) => number | null) => new Map(rows.map((p) => [fq(p.label), f(p)] as const).filter((x): x is [string, number] => x[1] != null && Number.isFinite(x[1])));
  return [
    { id: 'f:rev', label: 'Revenue, yearly growth', group: 'Earnings (SEC)', s: yoyPct(s((p) => p.revenue)) },
    { id: 'f:ni', label: 'Net income, yearly growth', group: 'Earnings (SEC)', s: yoyPct(s((p) => p.netIncome)) },
    { id: 'f:eps', label: 'EPS, yearly growth', group: 'Earnings (SEC)', s: yoyPct(s((p) => p.eps)) },
    { id: 'f:gm', label: 'Gross margin (change)', group: 'Earnings (SEC)', s: diff(s((p) => p.grossMargin)) },
    { id: 'f:om', label: 'Operating margin (change)', group: 'Earnings (SEC)', s: diff(s((p) => p.opMargin)) },
  ].filter((c) => c.s.size >= 8);
}

function Scatter({ x, y, xl, yl }: { x: number[]; y: number[]; xl: string; yl: string }) {
  const W = 300, H = 220, P = 30, lo = (v: number[]) => Math.min(...v), hi = (v: number[]) => Math.max(...v);
  const X = (v: number) => P + ((v - lo(x)) / (hi(x) - lo(x) || 1)) * (W - P - 8), Y = (v: number) => 8 + (1 - (v - lo(y)) / (hi(y) - lo(y) || 1)) * (H - P - 8);
  const mx = x.reduce((a, b) => a + b, 0) / x.length, my = y.reduce((a, b) => a + b, 0) / y.length;
  const b = x.reduce((a, v, i) => a + (v - mx) * (y[i] - my), 0) / (x.reduce((a, v) => a + (v - mx) ** 2, 0) || 1);
  return (
    <svg className="ql-sc" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Scatter of ${yl} against ${xl}`}>
      <line x1={P} x2={W - 8} y1={H - P} y2={H - P} className="ql-ax" /><line x1={P} x2={P} y1={8} y2={H - P} className="ql-ax" />
      {x.map((v, i) => <circle key={i} cx={X(v)} cy={Y(y[i])} r={3} className="ql-dot" />)}
      <line x1={X(lo(x))} x2={X(hi(x))} y1={Y(my + b * (lo(x) - mx))} y2={Y(my + b * (hi(x) - mx))} className="ql-fit" />
      <text x={W - 8} y={H - 8} textAnchor="end" className="ql-tl">{xl} →</text>
      <text x={4} y={14} className="ql-tl">↑ {yl}</text>
    </svg>
  );
}

/** Two series over time, each scaled to its own range, so the shapes can be compared. */
function TwoLines({ k, a, b, al, bl }: { k: string[]; a: number[]; b: number[]; al: string; bl: string }) {
  const W = 600, H = 150, z = (v: number[]) => { const m = v.reduce((s, x) => s + x, 0) / v.length, sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length) || 1; return v.map((x) => (x - m) / sd); };
  const za = z(a), zb = z(b), lim = Math.max(2.5, ...za.map(Math.abs), ...zb.map(Math.abs));
  const X = (i: number) => 6 + (i / Math.max(1, k.length - 1)) * (W - 12), Y = (v: number) => H / 2 - (v / lim) * (H / 2 - 8);
  const path = (v: number[]) => v.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x).toFixed(1)}`).join('');
  return (
    <figure className="ql-two">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${al} and ${bl} over time`}>
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="ql-ax" />
        <path d={path(zb)} className="ql-lb" vectorEffect="non-scaling-stroke" /><path d={path(za)} className="ql-la" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="small muted"><span className="ql-key a" /> {al} <span className="ql-key b" /> {bl} · {k[0]} to {k[k.length - 1]}, each scaled to its own average and spread</figcaption>
    </figure>
  );
}

function Detail({ f, all, cand, y, sym }: { f: Finding; all: Finding[]; cand: Candidate; y: Series; sym: string }) {
  const a = align(cand.s, y, f.lag), lags = all.filter((x) => x.id === f.id).sort((p, q) => p.lag - q.lag);
  return (
    <div className="ql-detail">
      <p className="ql-sent">{f.sentence}</p>
      <p className={`small ql-verdict ${f.significant && f.stable ? 'ok' : f.significant ? 'mid' : 'no'}`}>{verdict(f)}</p>
      <div className="ql-dgrid">
        <Scatter x={a.x} y={a.y} xl={cand.label} yl={`${sym} return`} />
        <div className="ql-stats">
          <table className="ql-t"><tbody>
            <tr><th>Correlation (r)</th><td>{f2(f.r)} <span className="muted">({f.strength})</span></td></tr>
            <tr><th>Rank correlation</th><td>{f2(f.rho)}</td></tr>
            <tr><th>Share of swings explained</th><td>{(f.r * f.r * 100).toFixed(0)}%</td></tr>
            <tr><th>Quarters</th><td>{f.n} ({a.k[0]} to {a.k[a.k.length - 1]})</td></tr>
            <tr><th>Chance it's luck (p)</th><td>{f.p < 0.001 ? '< 0.1%' : `${(f.p * 100).toFixed(1)}%`}</td></tr>
            <tr><th>After many-tests check (q)</th><td>{f.q < 0.001 ? '< 0.1%' : `${(f.q * 100).toFixed(1)}%`}</td></tr>
            <tr><th>First half / second half</th><td>{f.firstHalf == null ? '—' : f2(f.firstHalf)} / {f.secondHalf == null ? '—' : f2(f.secondHalf)}</td></tr>
          </tbody></table>
          <div className="small muted">At each lead or lag:</div>
          <div className="ql-lags">{lags.map((l) => <span key={l.lag} className={`ql-lag ${l.lag === f.lag ? 'on' : ''}`} title={verdict(l)}>{lagText(l.lag)}<b>{f2(l.r)}</b></span>)}</div>
        </div>
      </div>
      <TwoLines k={a.k} a={a.y} b={a.x} al={`${sym} quarterly return`} bl={`${cand.label}${f.lag ? ` (${lagText(f.lag)})` : ''}`} />
    </div>
  );
}

function ReviewTone({ co, ret, sym, fund }: { co: ToneCo; ret: Series; sym: string; fund: Candidate[] }) {
  const rows = co.q.filter((r) => r.n >= MIN_REVIEWS && r.q >= '2010');
  const W = 600, H = 170, tones = rows.map((r) => r.tone), lo = Math.min(...tones), hi = Math.max(...tones);
  const rets = rows.map((r) => ret.get(r.q) ?? 0), rmax = Math.max(10, ...rets.map(Math.abs));
  const X = (i: number) => 8 + (i + 0.5) * ((W - 16) / rows.length), bw = ((W - 16) / rows.length) * 0.6;
  const tone = new Map(rows.map((r) => [r.q, r.tone]));
  const tests: [string, Series, Series, number][] = [
    ['Tone change vs return, same quarter', diff(tone), ret, 0],
    ['Tone change vs next quarter\'s return', diff(tone), ret, 1],
    ['Tone level vs next quarter\'s return', tone, ret, 1],
    ...(fund.find((c) => c.id === 'f:rev') ? [['Tone change vs revenue growth, same quarter', diff(tone), fund.find((c) => c.id === 'f:rev')!.s, 0] as [string, Series, Series, number]] : []),
  ];
  // two-year blocks: average tone (weighted by reviews) and the stock's compounded return over the same two years
  const blocks = new Map<number, { n: number; t: number; g: number; q: number }>();
  for (const r of rows) { const y0 = +r.q.slice(0, 4), b = y0 - (y0 % 2), c = blocks.get(b) ?? { n: 0, t: 0, g: 1, q: 0 }; c.n += r.n; c.t += r.tone * r.n; const x = ret.get(r.q); if (x != null) { c.g *= 1 + x / 100; c.q++; } blocks.set(b, c); }
  const bl = [...blocks].sort((a, b) => a[0] - b[0]).map(([y0, c]) => ({ y0, n: c.n, tone: c.t / c.n, ret: (c.g - 1) * 100, q: c.q }));
  const mix = reasonMix(rows.slice(-8)), mixAll = new Map(reasonMix(rows).map((m) => [m.reason, m.negShare]));
  return (
    <section className="panel ql-panel">
      <div className="ph"><h3>Amazon review tone: {co.name}</h3><span className="small muted">{co.products.toLocaleString()} products, {rows.reduce((a, r) => a + r.n, 0).toLocaleString()} reviews since 2010 · dataset ends Sep 2023</span></div>
      <div className="ph-body">
        <svg className="ql-tone" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Review tone and quarterly return">
          <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="ql-ax" />
          {rows.map((r, i) => { const v = ret.get(r.q); if (v == null) return null; const h = (Math.abs(v) / rmax) * (H / 2 - 6); return <rect key={r.q} x={X(i) - bw / 2} width={bw} y={v >= 0 ? H / 2 - h : H / 2} height={h} className={v >= 0 ? 'ql-up' : 'ql-dn'}><title>{r.q}: {sym} {pc(v)}</title></rect>; })}
          <path d={rows.map((r, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${(6 + (1 - (r.tone - lo) / (hi - lo || 1)) * (H - 12)).toFixed(1)}`).join('')} className="ql-la" vectorEffect="non-scaling-stroke" />
        </svg>
        <p className="small muted"><span className="ql-key a" /> review tone (−1 angry to +1 delighted, scaled to fit) · bars: {sym} return each quarter · {rows[0]?.q} to {rows[rows.length - 1]?.q}</p>
        <div className="ql-cards">
          {tests.map(([label, x, y, lag]) => { const a = align(x, y, lag), r = pearson(a.x, a.y); return <div key={label} className="ql-card"><span className="small muted">{label}</span><b>{Number.isFinite(r) ? f2(r) : '—'}</b><span className="small muted">{a.x.length} quarters</span></div>; })}
        </div>
        <div className="ql-two-col">
          <div>
            <h4>Why people liked or disliked it (last 8 quarters)</h4>
            <table className="ql-t"><thead><tr><th>Reason</th><th>Mentions</th><th>Negative</th><th>vs all years</th></tr></thead><tbody>
              {mix.slice(0, 9).map((m) => { const was = mixAll.get(m.reason) ?? m.negShare; return <tr key={m.reason}><td>{m.reason}</td><td>{(m.pos + m.neg).toLocaleString()}</td><td><span className="ql-bar"><i style={{ width: `${m.negShare * 100}%` }} /></span>{(m.negShare * 100).toFixed(0)}%</td><td className={m.negShare > was + 0.03 ? 'dn' : m.negShare < was - 0.03 ? 'up' : 'muted'}>{m.negShare > was + 0.03 ? 'worse' : m.negShare < was - 0.03 ? 'better' : 'same'}</td></tr>; })}
            </tbody></table>
          </div>
          <div>
            <h4>Every two years</h4>
            <table className="ql-t"><thead><tr><th>Years</th><th>Reviews</th><th>Avg tone</th><th>{sym} return</th></tr></thead><tbody>
              {bl.map((b) => <tr key={b.y0}><td>{b.y0}–{String(b.y0 + 1).slice(2)}</td><td>{b.n.toLocaleString()}</td><td>{f2(b.tone)}</td><td className={b.ret >= 0 ? 'up' : 'dn'}>{b.q ? pc(b.ret, 0) : '—'}</td></tr>)}
            </tbody></table>
            <p className="small muted">Only {bl.length} two-year blocks, far too few for a correlation. Read it as a story, not as evidence.</p>
          </div>
        </div>
        <details className="small"><summary>How tone and reasons are scored</summary><p className="muted">Reviews come from the free Amazon Reviews 2023 research dataset (McAuley Lab, UC San Diego), not from scraping Amazon. Products are matched to a company by brand name. Tone = 60% star rating + 40% a word-list score of the review text (negation and "very" handled), each from −1 to +1. A review counts as negative below −0.15. Reasons are keyword tags (price, taste, broke, shipping, bugs and so on); one review can have several. Quarters with fewer than {MIN_REVIEWS} reviews are left out. Brand matching misses some products and catches a few third-party sellers.</p></details>
      </div>
    </section>
  );
}

export default function QuantLabPage({ sel }: { sel?: string }) {
  const [sym, setSym] = usePersisted('qlSym', 'HSY');
  const [draft, setDraft] = useState(sym);
  const [excess, setExcess] = usePersisted('qlExcess', false);
  const [group, setGroup] = useState('All');
  const [pick, setPick] = useState<string | null>(null);
  const [d, setD] = useState<QResp | null>(null);
  const [err, setErr] = useState('');
  const [tone, setTone] = useState<ToneDoc | null>(null);
  useEffect(() => { loadTone().then(setTone).catch(() => {}); }, []);
  useEffect(() => {
    let off = false; setD(null); setErr(''); setPick(null);
    fetch(`/api/research?fn=quantlab&symbol=${encodeURIComponent(sym)}`).then((r) => r.json()).then((j: QResp) => { if (off) return; if (j.error) setErr(j.error); else setD(j); }).catch((e) => !off && setErr(String(e.message ?? e)));
    return () => { off = true; };
  }, [sym]);
  const go = (s: string) => { const v = s.trim().toUpperCase(); if (SYM_RE.test(v)) { setSym(v); setDraft(v); } };

  const co = tone?.companies[sym];
  const model = useMemo(() => {
    if (!d) return null;
    const now = qKey(Date.now()), drop = (s: Series) => { s.delete(now); return s; };
    const raw = drop(quarterlyReturns(d.stock)), spy = drop(quarterlyReturns(d.factors.SPY ?? []));
    const y: Series = excess ? new Map([...raw].filter(([k]) => spy.has(k)).map(([k, v]) => [k, v - spy.get(k)!])) : raw;
    const cands: Candidate[] = FACTORS.filter((f) => f.sym !== sym && (d.factors[f.sym]?.length ?? 0) > 24 && !(excess && f.sym === 'SPY'))
      .map((f) => ({ id: f.sym, label: f.label, group: f.group, s: drop(LEVEL_FACTORS.has(f.sym) ? diff(quarterEnd(d.factors[f.sym])) : quarterlyReturns(d.factors[f.sym])) }));
    const fund = fundCands(d.fund.quarterly);
    cands.push(...fund);
    if (co) cands.push(...toneCandidates(co));
    const all = scan(sym, y, cands);
    return { y, raw, cands, fund, all, best: bestPerSeries(all) };
  }, [d, co, excess, sym]);

  const groups = ['All', ...new Set(model?.best.map((f) => f.group) ?? [])];
  const shown = (model?.best ?? []).filter((f) => group === 'All' || f.group === group);
  const cur = shown.find((f) => f.id === pick) ?? shown[0];
  const holds = model?.best.filter((f) => f.significant && f.stable).length ?? 0;
  const yl = excess ? `${sym} return minus the S&P 500` : `${sym} return`;

  return (
    <div className="page ad ql">
      <PageHero page="quant" title="Quant Lab" sub={<>Pick a stock. The relationship finder tests its quarterly returns against the market, sectors, rates, commodities, its own earnings and, where covered, Amazon review tone, at several leads and lags. Statistics, not predictions or advice.</>}>
        <form onSubmit={(e) => { e.preventDefault(); go(draft); }}><input value={draft} onChange={(e) => setDraft(e.target.value.toUpperCase())} aria-label="Ticker" maxLength={10} placeholder="Ticker" /></form>
        {sel && sel !== sym && <button className="chip sm" onClick={() => go(sel)}>Use {sel}</button>}
      </PageHero>

      {tone && <div className="ql-cos" aria-label="Companies with Amazon review tone">
        <span className="small muted">With Amazon review tone:</span>
        {Object.entries(tone.companies).map(([t, c]) => <button key={t} className={`chip sm ${t === sym ? 'on' : ''}`} title={`${c.name} · ${c.category.replace(/_/g, ' ')}`} onClick={() => go(t)}>{t}</button>)}
      </div>}

      <section className="panel ql-panel">
        <div className="ph">
          <h3>Relationship finder: {d?.fund.name ?? sym}</h3>
          {d && <Fresh kind="eod" at={d.asOf} src={d.source} />}
          <label className="small ql-tog"><input type="checkbox" checked={excess} onChange={(e) => setExcess(e.target.checked)} /> Test the return above or below the S&P 500</label>
        </div>
        <div className="ph-body">
          {err && <p className="small dn">{err}</p>}
          {!d && !err && <p className="small muted">Loading 20+ years of monthly prices, the factor basket and SEC filings…</p>}
          {model && <>
            <p className="small">{model.all.length} pairings tested over {model.y.size} quarters. <b>{holds}</b> {holds === 1 ? 'series holds' : 'series hold'} up after the many-tests check and in both halves of the history.{d?.fund.error ? ` ${d.fund.error}` : ''}{!co ? ' No Amazon review data for this ticker: pick one of the chips above to add it.' : ''}</p>
            <div className="ql-groups">{groups.map((g) => <button key={g} className={`chip sm ${g === group ? 'on' : ''}`} onClick={() => setGroup(g)}>{g}</button>)}</div>
            <div className="ql-grid">
              <ol className="ql-list">
                {shown.map((f) => (
                  <li key={f.id}><button className={`ql-row ${cur?.id === f.id ? 'on' : ''}`} onClick={() => setPick(f.id)}>
                    <span className="ql-name">{f.label}<span className="small muted">{f.group} · {lagText(f.lag)} · {f.n}q</span></span>
                    <span className="ql-r"><span className={`ql-rbar ${f.r >= 0 ? 'pos' : 'neg'}`}><i style={{ width: `${Math.abs(f.r) * 50}%` }} /></span>{f2(f.r)}</span>
                    <span className={`ql-badge ${f.significant && f.stable ? 'ok' : f.significant ? 'mid' : f.p < 0.05 ? 'weak' : 'no'}`}>{f.significant && f.stable ? 'holds' : f.significant ? 'unstable' : f.p < 0.05 ? 'maybe luck' : 'noise'}</span>
                  </button></li>
                ))}
              </ol>
              {cur && <Detail f={cur} all={model.all} cand={model.cands.find((c) => c.id === cur.id)!} y={model.y} sym={yl} />}
            </div>
          </>}
          <details className="small ql-how"><summary>How the finder works, and what it can't tell you</summary>
            <ul className="muted">
              <li>It compares changes (quarterly returns, growth, change in tone), never raw levels: two series that both trend up always look related.</li>
              <li>"Leads by 1q" pairs the other series with {sym}'s return one quarter later. Earnings are reported about a month after a quarter ends, so a same-quarter link with earnings couldn't have been traded.</li>
              <li>With dozens of pairings tested, a few look strong by luck alone. The q value adjusts for that (Benjamini-Hochberg). A link is marked "holds" only when q &lt; 10% and it points the same way in both halves of the history.</li>
              <li>Correlation isn't cause, and a link that held for 15 years can stop. Use it to find questions worth researching, not as a trading signal.</li>
            </ul>
          </details>
        </div>
      </section>

      {co && model && <ReviewTone co={co} ret={model.raw} sym={sym} fund={model.fund} />}
      {tone && <p className="small muted ql-foot">Review data: {tone.source}, built {tone.built}, ends {tone.coverageEnds}. Prices: Yahoo Finance (unofficial). Earnings: SEC XBRL (official).</p>}
    </div>
  );
}
