// Quant Lab: pick a stock and the relationship finder tests its quarterly returns against the market, sectors, rates,
// commodities, the company's own earnings (SEC) and, for 22 companies that sell on Amazon, the tone of their product
// reviews. Statistics only, run in the browser; every result says how much history it rests on and whether it survives
// the many-tests check. Data, not advice.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PageHero } from './PageHero';
import { Fresh } from './common';
import { QuantEvents } from './QuantEvents';
import { LIVE_TICKERS, type LiveBlock } from '../../shared/livefeeds';
import { usePersisted } from '../lib/store';
import type { FundPoint } from '../../shared/fundseries';
import {
  FACTORS, LEVEL_FACTORS, MIN_REVIEWS, align, bestPerSeries, diff, pearson, qKey, quarterEnd, quarterlyReturns, reasonMix, scan,
  strengthWord, toneCandidates, verdict, yoyPct, factorFit, ffCandidates, granger, monthlyReturns, FF_LABEL, type Candidate, type Finding, type Series, type ToneCo, type FFMonth, type FactorFit,
} from '../../shared/quantlab';

type C = { t: number; c: number };
interface QResp { sym: string; stock: C[]; factors: Record<string, C[]>; fund: { name?: string; quarterly?: FundPoint[]; error?: string }; ff?: FFMonth[]; wiki?: { title: string; months: [string, number][] } | null; asOf: number; source: string; error?: string }
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

const badge = (f: Finding) => (f.significant && f.stable ? ['ok', 'Holds up'] : f.significant ? ['mid', 'Unstable'] : f.p < 0.05 ? ['weak', 'Maybe luck'] : ['no', 'Noise']);
const pval = (p: number) => (p < 0.001 ? '< 0.1%' : `${(p * 100).toFixed(1)}%`);

function Card({ title, right, children, className = '' }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`ql-card ${className}`}><header className="ql-h"><h3>{title}</h3>{right && <div className="ql-hr">{right}</div>}</header>{children}</section>;
}
function Tile({ k, v, sub, tone }: { k: string; v: ReactNode; sub?: ReactNode; tone?: 'up' | 'dn' }) {
  return <div className="ql-tile"><span className="ql-k">{k}</span><b className={`num ${tone ?? ''}`}>{v}</b>{sub && <span className="small muted">{sub}</span>}</div>;
}

function Detail({ f, all, cand, y, ylabel }: { f: Finding; all: Finding[]; cand: Candidate; y: Series; ylabel: string }) {
  const a = align(cand.s, y, f.lag), lags = all.filter((x) => x.id === f.id).sort((p, q) => p.lag - q.lag), [cls, word] = badge(f);
  const g = f.lag >= 1 ? granger(cand.s, y) : null;
  return (
    <div className="ql-detail">
      <div className="ql-dhead"><span className={`ql-badge ${cls}`}>{word}</span><span className="ql-k">{cand.group} · {lagText(f.lag)}</span></div>
      <h4 className="ql-sent">{f.sentence}</h4>
      <p className="small muted ql-verdict">{verdict(f)}</p>
      <div className="ql-tiles four">
        <Tile k="Correlation" v={f2(f.r)} sub={f.strength} tone={f.r >= 0 ? 'up' : 'dn'} />
        <Tile k="Swings explained" v={`${(f.r * f.r * 100).toFixed(0)}%`} sub="r squared" />
        <Tile k="Luck check (q)" v={pval(f.q)} sub={`raw p ${pval(f.p)}`} />
        <Tile k="Halves" v={`${f.firstHalf == null ? '—' : f2(f.firstHalf)} / ${f.secondHalf == null ? '—' : f2(f.secondHalf)}`} sub={`${f.n}q · ${a.k[0]}–${a.k[a.k.length - 1]}`} />
        <Tile k="Walk-forward test" v={f.test == null ? '—' : f2(f.test)} sub={f.test == null ? 'not enough history' : f.oos ? `held on unseen years (trained ${f2(f.train ?? 0)})` : `faded on unseen years (trained ${f.train == null ? '—' : f2(f.train)})`} tone={f.oos ? 'up' : 'dn'} />
        {g && <Tile k="Predicts beyond own past?" v={g.p < 0.05 ? 'Yes' : 'No'} sub={`Granger p ${pval(g.p)} · ${g.n}q`} tone={g.p < 0.05 ? 'up' : 'dn'} />}
      </div>
      <div className="ql-dgrid">
        <Scatter x={a.x} y={a.y} xl={cand.label} yl={ylabel} />
        <TwoLines k={a.k} a={a.y} b={a.x} al={ylabel} bl={`${cand.label}${f.lag ? ` (${lagText(f.lag)})` : ''}`} />
      </div>
      <div className="ql-lagrow"><span className="ql-k">Each lead / lag</span>{lags.map((l) => <span key={l.lag} className={`ql-lag ${l.lag === f.lag ? 'on' : ''}`} title={verdict(l)}>{lagText(l.lag)} <b>{f2(l.r)}</b></span>)}</div>
    </div>
  );
}

function ReviewTone({ co, ret, sym, fund }: { co: ToneCo; ret: Series; sym: string; fund: Candidate[] }) {
  const rows = co.q.filter((r) => r.n >= MIN_REVIEWS && r.q >= '2010');
  const W = 900, H = 200, tones = rows.map((r) => r.tone), lo = Math.min(...tones), hi = Math.max(...tones);
  const rets = rows.map((r) => ret.get(r.q) ?? 0), rmax = Math.max(10, ...rets.map(Math.abs));
  const X = (i: number) => 8 + (i + 0.5) * ((W - 16) / rows.length), bw = ((W - 16) / rows.length) * 0.6;
  const tone = new Map(rows.map((r) => [r.q, r.tone]));
  const rev = fund.find((c) => c.id === 'f:rev');
  const tests: [string, Series, Series, number][] = [
    ['Tone change → same-quarter return', diff(tone), ret, 0],
    ['Tone change → next quarter', diff(tone), ret, 1],
    ['Tone level → next quarter', tone, ret, 1],
    ...(rev ? [['Tone change → revenue growth', diff(tone), rev.s, 0] as [string, Series, Series, number]] : []),
  ];
  const blocks = new Map<number, { n: number; t: number; g: number; q: number }>();
  for (const r of rows) { const y0 = +r.q.slice(0, 4), b = y0 - (y0 % 2), c = blocks.get(b) ?? { n: 0, t: 0, g: 1, q: 0 }; c.n += r.n; c.t += r.tone * r.n; const x = ret.get(r.q); if (x != null) { c.g *= 1 + x / 100; c.q++; } blocks.set(b, c); }
  const bl = [...blocks].sort((a, b) => a[0] - b[0]).map(([y0, c]) => ({ y0, n: c.n, tone: c.t / c.n, ret: (c.g - 1) * 100, q: c.q }));
  const mix = reasonMix(rows.slice(-8)), mixAll = new Map(reasonMix(rows).map((m) => [m.reason, m.negShare]));
  return (
    <Card title={<>Amazon review tone <span className="muted">· {co.name}</span></>} right={<span className="small muted">{co.products.toLocaleString()} products · {rows.reduce((a, r) => a + r.n, 0).toLocaleString()} reviews · dataset ends Sep 2023</span>}>
      <div className="ql-tiles four">
        {tests.map(([label, x, y, lag]) => { const a = align(x, y, lag), r = pearson(a.x, a.y); return <Tile key={label} k={label} v={Number.isFinite(r) ? f2(r) : '—'} sub={`${a.x.length} quarters · ${Number.isFinite(r) ? strengthWord(r) : ''}`} tone={r >= 0 ? 'up' : 'dn'} />; })}
      </div>
      <figure className="ql-fig">
        <svg className="ql-tone" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Review tone and quarterly return">
          <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="ql-ax" />
          {rows.map((r, i) => { const v = ret.get(r.q); if (v == null) return null; const h = (Math.abs(v) / rmax) * (H / 2 - 6); return <rect key={r.q} x={X(i) - bw / 2} width={bw} y={v >= 0 ? H / 2 - h : H / 2} height={h} className={v >= 0 ? 'ql-up' : 'ql-dn'}><title>{r.q}: {sym} {pc(v)}</title></rect>; })}
          <path d={rows.map((r, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${(8 + (1 - (r.tone - lo) / (hi - lo || 1)) * (H - 16)).toFixed(1)}`).join('')} className="ql-la" vectorEffect="non-scaling-stroke" />
        </svg>
        <figcaption className="small muted"><span className="ql-key a" /> review tone (scaled to fit) · <span className="ql-key up" /><span className="ql-key dn" /> {sym} return each quarter · {rows[0]?.q}–{rows[rows.length - 1]?.q}</figcaption>
      </figure>
      <div className="ql-split">
        <div className="ql-sub">
          <h4>What people mention <span className="muted small">· last 8 quarters</span></h4>
          <table className="ql-t"><thead><tr><th>Reason</th><th className="r">Mentions</th><th>Negative</th><th>vs all years</th></tr></thead><tbody>
            {mix.slice(0, 9).map((m) => { const was = mixAll.get(m.reason) ?? m.negShare, d = m.negShare - was; return <tr key={m.reason}><td>{m.reason}</td><td className="r num">{(m.pos + m.neg).toLocaleString()}</td><td><span className="ql-bar"><i style={{ width: `${m.negShare * 100}%` }} /></span><span className="num">{(m.negShare * 100).toFixed(0)}%</span></td><td className={d > 0.03 ? 'dn' : d < -0.03 ? 'up' : 'muted'}>{d > 0.03 ? `worse +${(d * 100).toFixed(0)}` : d < -0.03 ? `better ${(d * 100).toFixed(0)}` : 'same'}</td></tr>; })}
          </tbody></table>
        </div>
        <div className="ql-sub">
          <h4>Every two years</h4>
          <table className="ql-t"><thead><tr><th>Years</th><th className="r">Reviews</th><th className="r">Avg tone</th><th className="r">{sym}</th></tr></thead><tbody>
            {bl.map((b) => <tr key={b.y0}><td>{b.y0}–{String(b.y0 + 1).slice(2)}</td><td className="r num">{b.n.toLocaleString()}</td><td className="r num">{f2(b.tone)}</td><td className={`r num ${b.ret >= 0 ? 'up' : 'dn'}`}>{b.q ? pc(b.ret, 0) : '—'}</td></tr>)}
          </tbody></table>
          <p className="small muted">Only {bl.length} blocks: a story, not evidence.</p>
        </div>
      </div>
      <details className="small ql-how"><summary>How tone and reasons are scored</summary><p className="muted">Reviews come from the free Amazon Reviews 2023 research dataset (McAuley Lab, UC San Diego), not from scraping Amazon. Products are matched to a company by brand name. Tone = 60% star rating + 40% a word-list score of the review text (negation and "very" handled), each from −1 to +1; below −0.15 counts as negative. Reasons are keyword tags; a review can have several. Quarters with fewer than {MIN_REVIEWS} reviews are left out. Brand matching misses some products and catches a few third-party sellers.</p></details>
    </Card>
  );
}

const PLAIN: Record<string, [string, string]> = {
  mkt: ['moves more than the market', 'moves less than the market'], smb: ['acts like a small company', 'acts like a large company'],
  hml: ['acts like a cheap (value) stock', 'acts like an expensive (growth) stock'], rmw: ['acts like a highly profitable company', 'acts like a low-profit company'],
  cma: ['acts like a company that invests cautiously', 'acts like a company that invests aggressively'], mom: ['rides recent winners', 'acts like a recent loser / rebound play'],
};
function FactorCard({ fit, sym }: { fit: FactorFit; sym: string }) {
  return (
    <Card title={<>Factor fingerprint <span className="muted">· {sym}</span></>} right={<span className="small muted">Fama-French 5 factors + momentum · {fit.months} months · {fit.from.slice(0, 4)}–{fit.to.slice(0, 4)}</span>}>
      <div className="ql-tiles four">
        <Tile k="Explained by factors" v={`${(fit.r2 * 100).toFixed(0)}%`} sub="of monthly moves (R²)" />
        <Tile k="Left over (alpha)" v={pc(fit.alphaYr)} sub={`a year · ${Math.abs(fit.alphaT) >= 2 ? 'real (t ' + fit.alphaT.toFixed(1) + ')' : 'could be zero (t ' + fit.alphaT.toFixed(1) + ')'}`} tone={fit.alphaYr >= 0 ? 'up' : 'dn'} />
        {fit.betas.map((b) => <Tile key={b.key} k={FF_LABEL[b.key]} v={b.b.toFixed(2)} sub={Math.abs(b.t) < 2 ? 'no clear tilt' : b.key === 'mkt' ? (b.b > 1 ? PLAIN.mkt[0] : PLAIN.mkt[1]) : (b.b > 0 ? PLAIN[b.key][0] : PLAIN[b.key][1])} />)}
      </div>
      <p className="small muted ql-note">Market beta 1.0 = moves with the market; other factors at 0 = no tilt. "After factors" in the finder tests only the part these don't explain, so a link there is about {sym} itself, not the market or its style.</p>
    </Card>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Average return by calendar month, beyond the S&P 500, with how often it was positive and a t statistic. */
function Seasonality({ stock, spy, sym }: { stock: C[]; spy: C[]; sym: string }) {
  const sr = monthlyReturns(stock), mr = monthlyReturns(spy), cur = new Date().toISOString().slice(0, 7).replace('-', '');
  const rows = MONTHS.map((name, i) => {
    const xs = [...sr].filter(([ym]) => +ym.slice(4) === i + 1 && ym !== cur && mr.has(ym)).map(([ym, v]) => v - mr.get(ym)!);
    const m = xs.reduce((a, b) => a + b, 0) / (xs.length || 1), sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
    return { name, n: xs.length, m, up: xs.filter((v) => v > 0).length / (xs.length || 1), t: sd ? m / (sd / Math.sqrt(xs.length)) : 0 };
  });
  const lim = Math.max(1, ...rows.map((r) => Math.abs(r.m))), real = rows.filter((r) => Math.abs(r.t) >= 2);
  return (
    <Card title={<>Seasonality <span className="muted">· {sym} vs the S&P 500, by calendar month</span></>} right={<span className="small muted">{rows[0].n} years</span>}>
      <div className="ql-season">
        {rows.map((r) => <div key={r.name} className="ql-mo" title={`${r.name}: ${pc(r.m, 2)} on average beyond the S&P 500 · beat it ${(r.up * 100).toFixed(0)}% of years · t ${r.t.toFixed(1)}`}>
          <div className="ql-mobar"><i className={r.m >= 0 ? 'pos' : 'neg'} style={{ height: `${(Math.abs(r.m) / lim) * 50}%` }} /></div>
          <b className={`num ${Math.abs(r.t) >= 2 ? (r.m >= 0 ? 'up' : 'dn') : 'muted'}`}>{pc(r.m, 1)}</b><span className="small muted">{r.name} · {(r.up * 100).toFixed(0)}%</span>
        </div>)}
      </div>
      <p className="small muted ql-note">{real.length ? `${real.map((r) => r.name).join(', ')} ${real.length === 1 ? 'stands' : 'stand'} out (t ≥ 2), but with 12 months tested about one in twenty will look this strong by chance.` : 'No month stands out from chance (none with t ≥ 2).'} The % under each month is how often {sym} beat the S&P 500 that month.</p>
    </Card>
  );
}

function LiveCard({ blocks, sym }: { blocks: LiveBlock[]; sym: string }) {
  return (
    <Card title={<>Live customer signals <span className="muted">· {sym}</span></>} right={<span className="small muted">free public feeds, refreshed every 12 hours</span>}>
      {blocks.map((b) => (
        <div key={b.kind} className="ql-live">
          <div className="ql-k">{b.kind}</div>
          {b.error ? <p className="small dn">{b.error}</p> : <div className="ql-tiles four">{b.latest.map((l) => <Tile key={l.label} k={l.label} v={l.value} sub={l.note} />)}</div>}
          <p className="small muted ql-note">{b.source}. {b.series.length ? 'Added to the relationship finder under "Live feeds".' : ''}{b.events.length >= 3 ? ' Dated events are in the event study.' : ''}</p>
        </div>
      ))}
    </Card>
  );
}

const GROUP_LABEL: Record<string, string> = { Video_Games: 'Games and gear', Grocery_and_Gourmet_Food: 'Food and drink' };

export default function QuantLabPage({ sel }: { sel?: string }) {
  const [sym, setSym] = usePersisted('qlSym', 'HSY');
  const [draft, setDraft] = useState(sym);
  const [target, setTarget] = usePersisted<'raw' | 'spy' | 'ff'>('qlTarget', 'raw');
  const [group, setGroup] = useState('All');
  const [pick, setPick] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [d, setD] = useState<QResp | null>(null);
  const [err, setErr] = useState('');
  const [tone, setTone] = useState<ToneDoc | null>(null);
  const [feeds, setFeeds] = useState<LiveBlock[]>([]);
  useEffect(() => {
    let off = false; setFeeds([]);
    if (LIVE_TICKERS.includes(sym)) fetch(`/api/research?fn=qlfeeds&symbol=${encodeURIComponent(sym)}`).then((r) => r.json()).then((j) => { if (!off) setFeeds(j.blocks ?? []); }).catch(() => {});
    return () => { off = true; };
  }, [sym]);
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
    const fit: FactorFit | null = d.ff?.length ? factorFit(monthlyReturns(d.stock), d.ff) : null;
    const mode = target === 'ff' && !fit ? 'raw' : target;
    const y: Series = mode === 'spy' ? new Map([...raw].filter(([k]) => spy.has(k)).map(([k, v]) => [k, v - spy.get(k)!])) : mode === 'ff' ? drop(new Map(fit!.resid)) : raw;
    const cands: Candidate[] = FACTORS.filter((f) => f.sym !== sym && (d.factors[f.sym]?.length ?? 0) > 24 && !(mode !== 'raw' && ['SPY', 'QQQ', 'IWM'].includes(f.sym)))
      .map((f) => ({ id: f.sym, label: f.label, group: f.group, s: drop(LEVEL_FACTORS.has(f.sym) ? diff(quarterEnd(d.factors[f.sym])) : quarterlyReturns(d.factors[f.sym])) }));
    const fund = fundCands(d.fund.quarterly);
    cands.push(...fund);
    if (co) cands.push(...toneCandidates(co));
    for (const b of feeds) for (const ls of b.series) {
      const lv: Series = new Map(ls.points);
      // counts and volumes: yearly growth (they're seasonal); % positive: change; recall counts: change
      cands.push({ id: ls.id, label: ls.label, group: 'Live feeds', s: drop(/vol|veh|cfpb/.test(ls.id) ? yoyPct(lv) : diff(lv)) });
    }
    if (d.wiki?.months.length) {
      const m = new Map<string, number>(), c = new Map<string, number>();
      for (const [ym, v] of d.wiki.months) { const q = `${ym.slice(0, 4)}Q${Math.floor((+ym.slice(4) - 1) / 3) + 1}`; m.set(q, (m.get(q) ?? 0) + v); c.set(q, (c.get(q) ?? 0) + 1); }
      const full: Series = new Map([...m].filter(([q]) => c.get(q) === 3));
      cands.push({ id: 'wiki', label: `Wikipedia views of "${d.wiki.title}" (yearly growth)`, group: 'Attention', s: drop(yoyPct(full)) });
    }
    if (d.ff?.length && mode !== 'ff') cands.push(...ffCandidates(d.ff).map((c) => ({ ...c, s: drop(c.s) })));
    const tested = scan(sym, y, cands);
    return { y, raw, cands, fund, fit, mode, all: tested, best: bestPerSeries(tested) };
  }, [d, co, target, sym, feeds]);

  const groups = ['All', ...new Set(model?.best.map((f) => f.group) ?? [])];
  const shown = (model?.best ?? []).filter((f) => group === 'All' || f.group === group);
  const list = all ? shown : shown.slice(0, 10);
  const cur = shown.find((f) => f.id === pick) ?? shown[0];
  const holds = model?.best.filter((f) => f.significant && f.stable) ?? [];
  const top = model?.best[0], ks = model ? [...model.y.keys()].sort() : [];
  const ylabel = model?.mode === 'spy' ? `${sym} vs S&P 500` : model?.mode === 'ff' ? `${sym} after factors` : `${sym} return`;
  const byCat = Object.entries(tone?.companies ?? {}).reduce<Record<string, [string, ToneCo][]>>((m, e) => ((m[e[1].category] ??= []).push(e), m), {});

  return (
    <div className="page ad ql">
      <PageHero page="quant" title="Quant Lab" sub={<>Pick a stock and see what has moved with it: the market, sectors, rates, commodities, its own earnings and, for 22 companies, Amazon review tone. Statistics, not predictions or advice.</>}>
        <form onSubmit={(e) => { e.preventDefault(); go(draft); }}><input value={draft} onChange={(e) => setDraft(e.target.value.toUpperCase())} aria-label="Ticker" maxLength={10} placeholder="Ticker" /></form>
        {sel && sel !== sym && <button className="chip sm" onClick={() => go(sel)}>Use {sel}</button>}
      </PageHero>

      {tone && <div className="ql-cos">
        <div className="ql-cosg"><span className="ql-k">Live feeds · Steam, CFPB, NHTSA, FDA</span><div className="ql-chips">{LIVE_TICKERS.map((t) => <button key={t} className={`chip sm ${t === sym ? 'on' : ''}`} onClick={() => go(t)}>{t}</button>)}</div></div>
        {Object.entries(byCat).map(([cat, list]) => <div key={cat} className="ql-cosg"><span className="ql-k">{GROUP_LABEL[cat] ?? cat} · review data</span><div className="ql-chips">{list.map(([t, c]) => <button key={t} className={`chip sm ${t === sym ? 'on' : ''}`} title={c.name} onClick={() => go(t)}>{t}</button>)}</div></div>)}
      </div>}

      {err && <div className="ql-card"><p className="small dn">{err}</p></div>}
      {!d && !err && <div className="ql-card"><p className="small muted">Loading 25 years of monthly prices, the factor basket and SEC filings for {sym}…</p></div>}

      {model && <>
        <div className="ql-tiles">
          <Tile k={d?.fund.name ?? sym} v={sym} sub={co ? `${GROUP_LABEL[co.category] ?? ''} · review data` : 'no review data'} />
          <Tile k="Strongest link" v={top ? f2(top.r) : '—'} sub={top ? `${top.label} · ${lagText(top.lag)}` : ''} tone={top && top.r < 0 ? 'dn' : 'up'} />
          <Tile k="Links that hold up" v={`${holds.length} of ${model.best.length}`} sub={`${model.all.length} pairings tested`} />
          <Tile k="History" v={`${model.y.size} quarters`} sub={`${ks[0]} – ${ks[ks.length - 1]}`} />
        </div>

        {model.fit && <FactorCard fit={model.fit} sym={sym} />}
        <Card title="Relationship finder" right={<>{d && <Fresh kind="eod" at={d.asOf} src={d.source} />}<div className="ql-seg" role="group" aria-label="What to explain">{([['raw', 'Raw return'], ['spy', 'vs S&P 500'], ['ff', 'After factors']] as const).map(([k, l]) => <button key={k} className={`chip sm ${target === k ? 'on' : ''}`} disabled={k === 'ff' && !model?.fit} title={k === 'ff' ? 'What is left after market, size, value, profitability, investment and momentum factors explain what they can' : undefined} onClick={() => setTarget(k)}>{l}</button>)}</div></>}>
          {(d?.fund.error || !co) && <p className="small muted ql-note">{d?.fund.error ?? ''}{!co ? ' No Amazon review data for this ticker; pick a chip above to include it.' : ''}</p>}
          <div className="ql-groups">{groups.map((g) => <button key={g} className={`chip sm ${g === group ? 'on' : ''}`} onClick={() => { setGroup(g); setPick(null); }}>{g}</button>)}</div>
          <div className="ql-grid">
            <div className="ql-listwrap">
              <div className="ql-lhead ql-k"><span>Series</span><span>r</span><span>Verdict</span></div>
              <ol className="ql-list">
                {list.map((f) => { const [cls, word] = badge(f); return (
                  <li key={f.id}><button className={`ql-row ${cur?.id === f.id ? 'on' : ''}`} onClick={() => setPick(f.id)}>
                    <span className="ql-name"><span className="ql-nm">{f.label}</span><span className="ql-meta">{f.group} · {lagText(f.lag)}</span></span>
                    <span className="ql-r"><span className={`ql-rbar ${f.r >= 0 ? 'pos' : 'neg'}`}><i style={{ width: `${Math.abs(f.r) * 50}%` }} /></span><span className="num">{f2(f.r)}</span></span>
                    <span className={`ql-badge ${cls}`}>{word}</span>
                  </button></li>
                ); })}
              </ol>
              {shown.length > 10 && <button className="chip sm ql-more" onClick={() => setAll(!all)}>{all ? 'Show top 10' : `Show all ${shown.length}`}</button>}
            </div>
            {cur && <Detail f={cur} all={model.all} cand={model.cands.find((c) => c.id === cur.id)!} y={model.y} ylabel={ylabel} />}
          </div>
          <details className="small ql-how"><summary>How the finder works, and what it can't tell you</summary>
            <ul className="muted">
              <li>It compares changes (quarterly returns, growth, change in tone), never raw levels: two series that both trend up always look related.</li>
              <li>"Leads by 1q" pairs the other series with {sym}'s return one quarter later. Earnings come out about a month after a quarter ends, so a same-quarter link with earnings couldn't have been traded.</li>
              <li>With dozens of pairings, a few look strong by luck. q adjusts for that (Benjamini-Hochberg). "Holds up" means q under 10% and the same direction in both halves of the history.</li>
              <li>Correlation isn't cause, and old links can stop. Use it to find questions worth researching, not as a trading signal.</li>
            </ul>
          </details>
        </Card>
      </>}

      {d && <Seasonality stock={d.stock} spy={d.factors.SPY ?? []} sym={sym} />}
      {feeds.length > 0 && <LiveCard blocks={feeds} sym={sym} />}
      {model && <QuantEvents sym={sym} extra={feeds.map((b) => ({ kind: b.kind, source: b.source, events: b.events }))} />}
      {co && model && <ReviewTone co={co} ret={model.raw} sym={sym} fund={model.fund} />}
      {tone && <p className="small muted ql-foot">Review data: {tone.source}, built {tone.built}, ends {tone.coverageEnds}. Prices: Yahoo Finance (unofficial). Earnings: SEC XBRL (official).</p>}
    </div>
  );
}
