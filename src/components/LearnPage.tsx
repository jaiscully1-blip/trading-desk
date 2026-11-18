// Learn: decks of flip cards. Indicators (with a live SPY mini chart and a period slider), Strategies (rules, why it
// works, mistakes, and a number measured on real bars where the desk can measure it), Setups & traps (the Setup lab),
// Quick math (formula, calculator, mental shortcuts), Mindset, Concepts and a Glossary. Outside links are kept to one or
// two per card, plus a compact Resources tab. Learning material, not advice.
import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { PageHero } from './PageHero';
import type { Page } from './SideNav';
import { FlipCard } from './FlipCard';
import { MiniChart } from './LearnMiniChart';
import { Calc } from './LearnCalc';
import { Diagram } from './LearnDiagram';
import { PA_CARDS, PA_GROUPS } from '../../shared/pacards';
import { BASICS, BASIC_GROUPS, breakeven, payoff } from '../../shared/basics';
import { DIAGRAM_FOR } from '../../shared/diagrams';
import { usePersisted } from '../lib/store';
import { useLabBars } from '../lib/useLabBars';
import { INDICATORS, MATH, NOTES, STRATS, VIDEOS, type Deeper, type StratStat } from '../../shared/lessons';
import { EVIDENCE_NOTE, GLOSSARY, PATH, RESOURCES, STRATEGIES, resourceById, searchResources, type Kind, type Resource, type Topic } from '../../shared/learn';
import { fvgStats, gapFills, orb, pct, sessions, sweeps, vwapStats } from '../../shared/setuplab';

const Setups = lazy(() => import('./LearnSetups'));
const ChartGame = lazy(() => import('./LearnChartGame'));
type Tab = 'start' | 'basics' | 'pa' | 'indicators' | 'strategies' | 'setups' | 'game' | 'math' | 'mindset' | 'concepts' | 'glossary' | 'resources';
const TABS: { id: Tab; label: string; blurb: string; icon: string }[] = [
  { id: 'start', label: 'Start', blurb: 'New to trading? Start with the path below, then flip through the decks.', icon: '◎' },
  { id: 'basics', label: 'Basics', blurb: 'Never traded? What a stock is, how to place an order, account rules, what options are and how they pay off, risk and taxes.', icon: '①' },
  { id: 'pa', label: 'Price action', blurb: 'Structure, BOS and CHoCH, liquidity and sweeps, FVGs and inverse FVGs, order blocks, sessions, candlesticks, chart patterns, volume and Wyckoff: the patterns most chart traders use.', icon: '⟋' },
  { id: 'indicators', label: 'Indicators', blurb: 'Moving averages, VWAP, RSI, MACD, bands, ATR, volume and more, each drawn live on SPY.', icon: '∿' },
  { id: 'strategies', label: 'Strategies', blurb: 'ORB, fair value gaps, volume + EMA, VWAP reclaim and more: exact rules, why they work, and the usual mistakes.', icon: '⇗' },
  { id: 'setups', label: 'Setups & traps', blurb: 'Fakeouts, liquidity grabs, traps, VWAP and volume, measured on real bars.', icon: '⚑' },
  { id: 'game', label: 'Chart game', blurb: 'A real chart from a random stock and date with the ending hidden: call up or down, then see what happened and the base rate.', icon: '◧' },
  { id: 'math', label: 'Quick math', blurb: 'Position size, R, expectancy, drawdowns, expected move and more: formula, calculator and mental shortcuts.', icon: '∑' },
  { id: 'mindset', label: 'Mindset', blurb: 'The habits and biases that decide most results.', icon: '◐' },
  { id: 'concepts', label: 'Concepts', blurb: 'How prices are set and move, orders, valuation, filings, AI and backtests.', icon: '▦' },
  { id: 'glossary', label: 'Glossary', blurb: 'Every term, one card each.', icon: 'Aa' },
  { id: 'resources', label: 'Resources', blurb: 'Channels, books and papers, if you want to go deeper.', icon: '↗' },
];
const OLD_TAB: Record<Topic, Tab> = { start: 'start', strategies: 'strategies', technical: 'indicators', fundamentals: 'concepts', markets: 'concepts', psychology: 'mindset', fund: 'mindset', ai: 'concepts' };

const Go = ({ d }: { d?: Deeper }) => (d ? <a className="fc-deeper" href={d.url} target="_blank" rel="noreferrer noopener">Go deeper: {d.label} ↗</a> : null);
/** YouTube search links (not single videos): always resolve, and show the most-watched explanations first. */
export const Yt = ({ q }: { q: string }) => <a className="fc-yt" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`} target="_blank" rel="noreferrer noopener">▶ Watch on YouTube: “{q}”</a>;
/** A hand-picked video as a thumbnail tile (opens on YouTube). */
const Vid = ({ k }: { k: string }) => { const v = VIDEOS[k]; return v ? <a className="fc-vid" href={`https://www.youtube.com/watch?v=${v.v}`} target="_blank" rel="noreferrer noopener"><img src={`https://i.ytimg.com/vi/${v.v}/mqdefault.jpg`} alt="" loading="lazy" /><span className="fc-play">▶</span><span className="fc-vt"><b>{v.title}</b><span className="small muted">{v.by} · YouTube</span></span></a> : null; };
const YT_STRAT: Record<string, string> = { orb: 'SMB Capital opening range breakout', fvg: 'fair value gap explained trading', volema: '9 EMA pullback volume day trading', vwapr: 'Brian Shannon VWAP reclaim', emax: '9 21 EMA crossover strategy', brr: 'breakout and retest trading strategy', flag: 'bull flag pattern day trading', sweeprev: 'liquidity sweep reversal trading', gapgo: 'gap and go vs gap fill trading', rsi2: 'Larry Connors RSI 2 strategy', trend200: '200 day moving average trend following' };
const Sec = ({ t, children }: { t: string; children: ReactNode }) => <div className="fc-sec"><h5>{t}</h5>{children}</div>;
const List = ({ xs }: { xs: string[] }) => <ul>{xs.map((x) => <li key={x}>{x}</li>)}</ul>;
const f0 = (v: number) => (Number.isFinite(v) ? `${v.toFixed(0)}%` : '—');

function Indicators() {
  const { m5, d } = useLabBars('SPY');
  const last = useMemo(() => sessions(m5).at(-1)?.bars ?? [], [m5]);
  const fams = ['All', ...new Set(INDICATORS.map((i) => i.family))];
  const [fam, setFam] = useState('All');
  return (
    <>
      <div className="ln-chips">{fams.map((f) => <button key={f} className={`chip sm ${fam === f ? 'on' : ''}`} onClick={() => setFam(f)}>{f}</button>)}</div>
      <div className="fc-grid">{INDICATORS.filter((i) => fam === 'All' || i.family === fam).map((i) => (
        <FlipCard key={i.id} tag={i.family} title={i.name} front={<><h4>{i.name}</h4><p>{i.short}</p></>} back={<>
          <MiniChart kind={i.chart} daily={d} intraday={last} period={i.period} />
          <div className="fc-cols">
            <Sec t="Formula"><code className="fc-code">{i.formula}</code></Sec>
            <Sec t="How to read it"><List xs={i.read} /></Sec>
            <Sec t="Signals traders use"><List xs={i.signals} /></Sec>
            <Sec t="Settings"><p>{i.settings}</p></Sec>
            <Sec t="Pitfalls"><List xs={i.pitfalls} /></Sec>
            <Sec t="Pairs well with"><p>{i.pair}</p></Sec>
          </div>
          <p className="fc-tip">💡 {i.tip}</p><div className="fc-links"><Vid k={`i-${i.id}`} /><Yt q={`${i.name} explained trading`} /><Go d={i.deeper} /></div>
        </>} />
      ))}</div>
    </>
  );
}

function useStratStats(on: boolean) {
  const { m5, d, loading } = useLabBars('SPY', on);
  return useMemo(() => {
    const ss = sessions(m5);
    if (!ss.length) return { loading, line: () => null as string | null };
    const o = orb(ss, 15, 2), f5 = fvgStats(ss.map((s) => s.bars), 0.05, 78), fd = fvgStats([d], 0.1, 10), sw = sweeps(d), g = gapFills(d), vw = vwapStats(ss);
    const gt = (k: 'up' | 'dn') => { const n = g.reduce((a, r) => a + r[k].n, 0); return { n, p: pct(g.reduce((a, r) => a + r[k].filled, 0), n) }; };
    const small = g[0];
    const lines: Record<StratStat, string> = {
      orb: `SPY, last ${ss.length} days, 15-min range, 2R target: ${o.trades.length} trades, ${f0(o.win)} winners, average ${o.avgR >= 0 ? '+' : ''}${o.avgR.toFixed(2)}R; ${f0(o.fake)} were fakeouts.`,
      fvg: `SPY 5-minute gaps (≥0.05%): ${f5.n} found, ${f0(f5.revisited)} revisited the same day, ${f0(f5.filled)} fully filled. Daily gaps (≥0.1%): ${fd.n}, ${f0(fd.revisited)} revisited within 10 days, ${f0(fd.filled)} filled.`,
      gap: `SPY, ${d.length} days: ${f0(gt('up').p)} of gaps up and ${f0(gt('dn').p)} of gaps down filled the same day; small gaps (0.25–0.5%) up filled ${f0(pct(small.up.filled, small.up.n))}.`,
      sweep: `SPY, ${sw.days} days: ${f0(sw.upRejected)} of breaks above yesterday’s high closed back below it; ${f0(sw.dnRejected)} of breaks below yesterday’s low closed back above.`,
      vwap: `SPY, ${vw.days} days: VWAP retests from below held 30 minutes later ${f0(pct(vw.fromBelow.held, vw.fromBelow.n))} of the time (${vw.fromBelow.n}); from above ${f0(pct(vw.fromAbove.held, vw.fromAbove.n))} (${vw.fromAbove.n}).`,
    };
    return { loading, line: (k?: StratStat) => (k ? lines[k] : null) };
  }, [m5, d, loading]);
}

function Strategies() {
  const st = useStratStats(true);
  const [style, setStyle] = useState('All');
  return (
    <>
      <div className="ln-chips">{['All', 'Intraday', 'Swing'].map((s) => <button key={s} className={`chip sm ${style === s ? 'on' : ''}`} onClick={() => setStyle(s)}>{s}</button>)}</div>
      <div className="fc-grid">{STRATS.filter((s) => style === 'All' || s.style === style || s.style === 'Both').map((s) => (
        <FlipCard key={s.id} tag={s.style} title={s.name} front={<><h4>{s.name}</h4><Diagram id={s.id} small /><p>{s.short}</p><span className="small muted">{s.tf}</span></>} back={<>
          <Diagram id={s.id} />
          {s.stat && <p className="fc-stat">{st.line(s.stat) ?? (st.loading ? 'Measuring on SPY…' : 'No measurement right now.')}</p>}
          <div className="fc-rules"><div><span>Setup</span><List xs={s.setup} /></div><div><span>Entry</span><p>{s.entry}</p></div><div><span>Stop</span><p>{s.stop}</p></div><div><span>Target</span><p>{s.target}</p></div></div>
          <div className="fc-cols">
            <Sec t="Why it works"><p>{s.why}</p></Sec>
            <Sec t="Watch for"><List xs={s.watch} /></Sec>
            <Sec t="Common mistakes"><List xs={s.mistakes} /></Sec>
            <Sec t="Evidence"><p>{s.evidence}</p></Sec>
          </div>
          <div className="fc-links"><Vid k={s.id} /><Yt q={YT_STRAT[s.id] ?? `${s.name} trading strategy explained`} /><Go d={s.deeper} /></div>
        </>} />
      ))}</div>
      <h3 className="ln-sub">Longer-term strategies funds use</h3>
      <div className="fc-grid">{STRATEGIES.map((s) => (
        <FlipCard key={s.id} tag={s.family} title={s.name} front={<><h4>{s.name}</h4><p>{s.how}</p><span className={`ln-ev ev-${s.evidence.toLowerCase()}`}>{s.evidence}</span></>} back={<>
          <div className="fc-cols">
            <Sec t="Why it might work"><p>{s.why}</p></Sec>
            <Sec t="What history shows"><p>{s.history} <span className="muted">({EVIDENCE_NOTE[s.evidence]}.)</span></p></Sec>
            <Sec t="Who trades it"><p>{s.who}</p></Sec>
            <Sec t="How it fails"><p>{s.fails}</p></Sec>
          </div>
          {(() => { const r = resourceById(s.sources[0]); return r ? <Go d={{ label: r.title, url: r.url }} /> : null; })()}
        </>} />
      ))}</div>
      <p className="note">Measured numbers use real SPY bars (Yahoo, delayed) without costs or slippage. History, not a forecast; learning material, not advice.</p>
    </>
  );
}

/** Options payoff at expiration for one contract: pick call or put, buy or sell, strike and premium. */
function OptionPayoff() {
  const [kind, setKind] = useState<'call' | 'put'>('call');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [strike, setStrike] = useState(105), [prem, setPrem] = useState(2), [px, setPx] = useState(112);
  const lo = strike * 0.8, hi = strike * 1.2, W = 420, H = 150, pts = Array.from({ length: 41 }, (_, i) => lo + ((hi - lo) * i) / 40);
  const vals = pts.map((p) => payoff(kind, side, strike, prem, p)), m = Math.max(...vals.map(Math.abs), 1);
  const X = (p: number) => 10 + ((p - lo) / (hi - lo)) * (W - 20), Y = (v: number) => H / 2 - (v / m) * (H / 2 - 10);
  const now = payoff(kind, side, strike, prem, px), be = breakeven(kind, strike, prem);
  const maxLoss = side === 'buy' ? `$${(prem * 100).toFixed(0)} (the premium)` : kind === 'call' ? 'unlimited (the stock can keep rising)' : `$${((strike - prem) * 100).toFixed(0)} (if the stock goes to 0)`;
  const num = (v: number, set: (x: number) => void, step = 1) => <input type="number" step={step} value={v} onChange={(e) => set(Math.max(0.01, +e.target.value || 0))} />;
  return (
    <div className="bs-pay">
      <div className="bs-pay-in">
        <h4>Try it: option payoff at expiration</h4>
        <div className="ln-chips">{(['buy', 'sell'] as const).map((x) => <button key={x} className={`chip sm ${side === x ? 'on' : ''}`} onClick={() => setSide(x)}>{x === 'buy' ? 'Buy' : 'Sell'}</button>)}{(['call', 'put'] as const).map((x) => <button key={x} className={`chip sm ${kind === x ? 'on' : ''}`} onClick={() => setKind(x)}>{x === 'call' ? 'Call' : 'Put'}</button>)}</div>
        <label>Strike {num(strike, setStrike)}</label><label>Premium {num(prem, setPrem, 0.05)}</label><label>Stock at expiration {num(px, setPx)}</label>
        <p className={`bs-pl ${now >= 0 ? 'up' : 'down'}`}>{now >= 0 ? 'Profit' : 'Loss'}: ${Math.abs(now).toFixed(0)} <span className="small muted">per contract (100 shares)</span></p>
        <p className="small muted">Break-even ${be.toFixed(2)} · max loss {maxLoss} · {side === 'buy' ? `you pay $${(prem * 100).toFixed(0)}` : `you collect $${(prem * 100).toFixed(0)}`}</p>
      </div>
      <svg className="bs-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Payoff at expiration">
        <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} className="bs-zero" />
        <line x1={X(strike)} x2={X(strike)} y1={6} y2={H - 6} className="bs-strike" />
        <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${X(p).toFixed(1)},${Y(vals[i]).toFixed(1)}`).join('')} className="bs-line" />
        {px >= lo && px <= hi && <circle cx={X(px)} cy={Y(now)} r={4} className={now >= 0 ? 'bs-dot up' : 'bs-dot dn'} />}
        <text x={X(strike) + 4} y={14} className="bs-t">strike {strike}</text><text x={W - 6} y={Y(0) - 4} textAnchor="end" className="bs-t">$0</text>
      </svg>
    </div>
  );
}

function Basics() {
  const [g, setG] = useState<string>('All');
  const [q, setQ] = useState('');
  const xs = BASICS.filter((c) => (g === 'All' || c.group === g) && (!q || `${c.name} ${c.short} ${c.points.join(' ')}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <div className="ln-chips">{['All', ...BASIC_GROUPS].map((x) => <button key={x} className={`chip sm ${g === x ? 'on' : ''}`} onClick={() => setG(x)}>{x}</button>)}<input className="ln-search" placeholder={`Search ${BASICS.length} basics…`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {(g === 'Options basics' || g === 'Common option trades') && !q && <OptionPayoff />}
      <div className="fc-grid">{xs.map((c) => (
        <FlipCard key={c.id} tag={c.group} title={c.name} front={<><h4>{c.name}</h4><p>{c.short}</p></>} back={<>
          <List xs={c.points} />
          {c.example && <p className="bs-ex"><b>Example:</b> {c.example}</p>}
          <Yt q={c.watch} />
        </>} />
      ))}</div>
      {g === 'All' && !q && <OptionPayoff />}
      <p className="small muted">US rules as of 2026; brokers differ, so check yours. Learning material, not advice.</p>
    </>
  );
}

function PriceAction() {
  const [g, setG] = useState<string>('All');
  const [q, setQ] = useState('');
  const xs = PA_CARDS.filter((c) => (g === 'All' || c.group === g) && (!q || `${c.name} ${c.short} ${c.what.join(' ')}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <div className="ln-chips">{['All', ...PA_GROUPS].map((x) => <button key={x} className={`chip sm ${g === x ? 'on' : ''}`} onClick={() => setG(x)}>{x}</button>)}<input className="ln-search" placeholder={`Search ${PA_CARDS.length} patterns…`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="fc-grid">{xs.map((c) => (
        <FlipCard key={c.id} tag={c.group} title={c.name} front={<><h4>{c.name}</h4>{DIAGRAM_FOR[c.id] && <Diagram id={c.id} small />}<p>{c.short}</p></>} back={<>
          {DIAGRAM_FOR[c.id] && <Diagram id={c.id} />}
          <div className="fc-cols">
            <Sec t="What defines it"><List xs={c.what} /></Sec>
            <Sec t="Why it forms"><p>{c.why}</p></Sec>
            <Sec t="How traders use it"><List xs={c.use} /></Sec>
            <Sec t="Wrong when"><p>{c.wrong}</p></Sec>
          </div>
          {c.note && <p className="fc-tip">ℹ {c.note}</p>}
          <div className="fc-links"><Yt q={`${c.name.replace(/\(.*?\)/g, '').trim()} explained trading`} /></div>
        </>} />
      ))}</div>
      <p className="note">Practise spotting these in the Chart game: it marks structure, FVGs, liquidity and sweeps on real charts. Learning material, not advice.</p>
    </>
  );
}

function QuickMath() {
  return <div className="fc-grid">{MATH.map((m) => (
    <FlipCard key={m.id} tag="Calculator" title={m.name} front={<><h4>{m.name}</h4><p>{m.short}</p><code className="fc-code">{m.formula}</code></>} back={<>
      <code className="fc-code">{m.formula}</code>
      <Calc id={m.id} />
      <div className="fc-cols"><Sec t="Shortcuts"><List xs={m.tricks} /></Sec><Sec t="Example"><p>{m.example}</p></Sec></div>
      <div className="fc-links"><Yt q={`${m.name} trading explained`} /></div>
    </>} />
  ))}</div>;
}

function Notes({ deck }: { deck: 'Mindset' | 'Concepts' }) {
  return <div className="fc-grid">{NOTES.filter((n) => n.deck === deck).map((n) => (
    <FlipCard key={n.id} wide={false} title={n.name} front={<><h4>{n.name}</h4><p>{n.short}</p></>} back={<><List xs={n.points} /><Go d={n.deeper} /></>} />
  ))}</div>;
}

function Glossary() {
  const [q, setQ] = useState('');
  const xs = GLOSSARY.filter((g) => !q || `${g.term} ${g.def}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="ln-chips"><input className="ln-search" placeholder={`Search ${GLOSSARY.length} terms…`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="fc-grid sm">{xs.map((g) => <FlipCard key={g.term} wide={false} title={g.term} front={<h4 className="fc-term">{g.term}</h4>} back={<><p>{g.def}</p></>} />)}</div>
    </>
  );
}

function Resources() {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind | 'All'>('All');
  const kinds = [...new Set(RESOURCES.map((r) => r.kind))];
  const list = searchResources(q).filter((r) => kind === 'All' || r.kind === kind);
  return (
    <>
      <div className="ln-chips">
        <input className="ln-search" placeholder={`Search ${RESOURCES.length} channels, books and papers…`} value={q} onChange={(e) => setQ(e.target.value)} />
        {(['All', ...kinds] as const).map((k) => <button key={k} className={`chip sm ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{k}</button>)}
      </div>
      <div className="rs-grid">{list.map((r: Resource) => (
        <a key={r.id} className="rs-tile" href={r.url} target="_blank" rel="noreferrer noopener" title={r.why}>
          <span className="rs-kind">{r.kind}</span><b>{r.title}</b><span className="small muted">{r.by}</span>
          {r.tags?.includes('Sells courses') && <span className="ln-tag warn">Sells courses</span>}
        </a>
      ))}</div>
      <p className="note">Hover a tile for why it’s worth it. “Sells courses” = the creator also sells paid products; nothing here is an endorsement.</p>
    </>
  );
}

function Start({ setTab, go }: { setTab: (t: Tab) => void; go?: (p: Page) => void }) {
  const [done, setDone] = usePersisted<Record<string, boolean>>('learnPath', {});
  const all = PATH.flatMap((l) => l.steps), n = all.filter((s) => done[s.id]).length;
  return (
    <>
      <div className="lt-grid">{TABS.filter((t) => t.id !== 'start').map((t) => (
        <button key={t.id} className="lt-tile" onClick={() => setTab(t.id)}><span className="lt-ic">{t.icon}</span><b>{t.label}</b><span className="small muted">{t.blurb}</span></button>
      ))}</div>
      <section className="ad-card ln-path">
        <header className="ad-h"><h3>Your learning path</h3><span className="small muted">{n} of {all.length} done</span></header>
        <div className="ln-bar"><span style={{ width: `${(n / all.length) * 100}%` }} /></div>
        <div className="ln-levels">{PATH.map((l) => (
          <div key={l.level}><h4>{l.level}</h4><ul>{l.steps.map((s) => { const r = s.res ? resourceById(s.res) : undefined; return (
            <li key={s.id} className={done[s.id] ? 'done' : ''}>
              <label><input type="checkbox" checked={!!done[s.id]} onChange={(e) => setDone({ ...done, [s.id]: e.target.checked })} /> {s.text}</label>
              {r && <a className="small" href={r.url} target="_blank" rel="noreferrer noopener">open</a>}
              {s.tab && <button className="small linkish" onClick={() => setTab(OLD_TAB[s.tab!])}>go</button>}
              {s.page && go && <button className="small linkish" onClick={() => go(s.page as Page)}>go</button>}
            </li>
          ); })}</ul></div>
        ))}</div>
      </section>
    </>
  );
}

export default function LearnPage({ go }: { go?: (p: Page) => void }) {
  const [saved, setTab] = usePersisted<string>('learnTab2', 'start');
  const tab = (TABS.some((t) => t.id === saved) ? saved : 'start') as Tab;
  const meta = TABS.find((t) => t.id === tab)!;
  return (
    <div className="page ad">
      <PageHero page="learn" title="Learn" sub="Flip-card lessons on indicators, strategies, setups, quick trading math and mindset, with live examples on real market data. Learning material, not advice." />
      <nav className="ln-tabs" role="tablist" aria-label="Learn sections">
        {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}><span className="ln-ti">{t.icon}</span>{t.label}</button>)}
      </nav>
      <p className="ln-blurb">{meta.blurb}</p>
      {tab === 'start' && <Start setTab={setTab} go={go} />}
      {tab === 'pa' && <PriceAction />}
      {tab === 'indicators' && <Indicators />}
      {tab === 'strategies' && <Strategies />}
      {tab === 'setups' && <Suspense fallback={<section className="ad-card">Loading…</section>}><Setups /></Suspense>}
      {tab === 'game' && <Suspense fallback={<section className="ad-card">Loading…</section>}><ChartGame /></Suspense>}
      {tab === 'math' && <QuickMath />}
      {tab === 'basics' && <Basics />}
      {tab === 'mindset' && <Notes deck="Mindset" />}
      {tab === 'concepts' && <Notes deck="Concepts" />}
      {tab === 'glossary' && <Glossary />}
      {tab === 'resources' && <Resources />}
    </div>
  );
}
