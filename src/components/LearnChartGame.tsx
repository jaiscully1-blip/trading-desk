// Learn → Chart game: a real daily chart from a random stock and date with the ending hidden. The chart is marked up
// with price action the way chart traders read it (structure, BOS / CHoCH, FVGs and inverse FVGs, order blocks,
// liquidity and sweeps, averages, volume), each layer can be switched off, and every pattern on the chart is named.
// Call up or down; the reveal explains what the hidden bars did in the same terms. Practice, not advice.
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react';
import type { Bar } from '../../shared/types';
import { analyze } from '../../shared/patterns';
import { baseRate, GAME_SYMBOLS, outcome, pickCut, pickIndex, SHOW } from '../../shared/chartgame';
import { explain, namesAt, read, type PA } from '../../shared/priceaction';
import { PA_DEFS } from '../../shared/pacards';
import { usePersisted } from '../lib/store';

interface Round { sym: string; bars: Bar[]; cut: number; names: string[]; trend: PA['trend'] }
interface Rec { calls: number; right: number; byH: Record<string, [number, number]>; withT: [number, number]; againstT: [number, number]; streak: number; best: number; baseSum: number }
const EMPTY: Rec = { calls: 0, right: 0, byH: {}, withT: [0, 0], againstT: [0, 0], streak: 0, best: 0, baseSum: 0 };
type Layer = 'structure' | 'fvg' | 'ob' | 'liq' | 'ma' | 'vol';
const LAYERS: { id: Layer; label: string }[] = [{ id: 'structure', label: 'Structure / BOS' }, { id: 'fvg', label: 'FVG / IFVG' }, { id: 'ob', label: 'Order blocks' }, { id: 'liq', label: 'Liquidity / sweeps' }, { id: 'ma', label: '20 EMA / 50 SMA' }, { id: 'vol', label: 'Volume' }];

// View only: click and drag to scroll back through earlier bars, double-click to reset. It never shows bars
// past `limit` (the cut, until you've made your call), so moving around can't give the answer away.
function ChartView({ bars, from: f0, cut, to: limit, pa, on }: { bars: Bar[]; from: number; cut: number; to: number; pa: PA; on: Record<Layer, boolean> }) {
  const [view, setView] = useState({ off: 0, span: limit - f0 + 1 });
  useEffect(() => setView({ off: 0, span: limit - f0 + 1 }), [bars, f0, limit]);
  const svg = useRef<SVGSVGElement>(null), drag = useRef<{ x: number; off: number } | null>(null);
  const span = Math.min(Math.max(15, view.span), limit + 1), off = Math.min(Math.max(0, view.off), limit + 1 - span);
  const to = limit - off, from = to - span + 1;
  const perBar = () => (svg.current?.clientWidth ?? 900) / (span + 6);
  const handlers = {
    onPointerDown: (e: RPE<SVGSVGElement>) => { drag.current = { x: e.clientX, off }; e.currentTarget.setPointerCapture(e.pointerId); },
    onPointerMove: (e: RPE<SVGSVGElement>) => { const d = drag.current; if (!d) return; const o = Math.round(d.off + (e.clientX - d.x) / perBar()); setView((v) => ({ ...v, off: Math.min(Math.max(0, o), limit + 1 - span) })); },
    onPointerUp: () => { drag.current = null; },
    onPointerCancel: () => { drag.current = null; },
    onDoubleClick: () => setView({ off: 0, span: limit - f0 + 1 }),
  };
  const xs = bars.slice(from, to + 1), n = xs.length;
  const hi = Math.max(...xs.map((b) => b.high)), lo = Math.min(...xs.map((b) => b.low));
  const W = 900, H = 330, VP = on.vol ? 60 : 0, cw = W / (n + 6), X = (i: number) => (i - from) * cw + cw / 2, Y = (p: number) => 10 + ((hi - p) / (hi - lo || 1)) * (H - 20);
  const inView = (i: number) => i >= from && i <= to, clampX = (i: number) => X(Math.min(Math.max(i, from), to));
  const vmax = Math.max(...xs.map((b) => b.volume)) || 1;
  const line = (arr: (number | null)[]) => { let d = ''; for (let i = from; i <= to; i++) { const v = arr[i]; if (v != null) d += `${d ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; } return d; };
  // keep it readable: zones still open at the cut (or inverted / filled in the last 15 bars), newest 6 of each kind;
  // liquidity still resting at the cut or taken in the last 20 bars, newest 8
  const recent = (x: number | null) => x == null || x >= cut - 15;
  const pick = (kind: 'FVG' | 'OB') => pa.zones.filter((z) => z.kind === kind && z.i >= from && z.i <= to && recent(z.kind === 'FVG' && z.closedThrough == null ? z.filled : z.closedThrough) && z.top <= hi && z.bot >= lo).slice(-6);
  const zones = [...(on.fvg ? pick('FVG') : []), ...(on.ob ? pick('OB') : [])];
  const liq = on.liq ? pa.liq.filter((q) => q.i >= from && (q.taken == null || q.taken >= cut - 20) && q.p <= hi && q.p >= lo).slice(-8) : [];
  return (
    <svg ref={svg} {...handlers} className="cg-svg cg-pan" viewBox={`0 0 ${W} ${H + VP}`} preserveAspectRatio="none" role="img" aria-label="Price chart with price-action markings">
      {zones.map((z, k) => { const end = z.closedThrough ?? z.filled ?? to, inv = z.kind === 'FVG' && z.closedThrough != null; return <g key={`z${k}`}>
        <rect className={`cg-z ${z.kind === 'OB' ? 'ob' : z.dir}`} x={clampX(z.i) - cw / 2} width={Math.max(cw, clampX(end) - clampX(z.i) + cw / 2)} y={Y(z.top)} height={Math.max(1, Y(z.bot) - Y(z.top))} />
        {inv && end < to && <rect className={`cg-z inv ${z.dir === 'bull' ? 'bear' : 'bull'}`} x={clampX(end)} width={clampX(to) - clampX(end) + cw / 2} y={Y(z.top)} height={Math.max(1, Y(z.bot) - Y(z.top))} />}
        <text className="cg-zt" x={clampX(z.i) - cw / 2 + 2} y={Y(z.top) - 2}>{z.kind === 'OB' ? 'OB' : inv ? 'FVG→IFVG' : 'FVG'}</text>
      </g>; })}
      {liq.map((q, k) => { const end = q.taken ?? to; return <g key={`q${k}`} className={`cg-liq ${q.taken != null ? 'taken' : ''}`}><line x1={clampX(q.i)} x2={clampX(end)} y1={Y(q.p)} y2={Y(q.p)} /><text x={clampX(end) + 3} y={Y(q.p) + 3}>{q.kind.startsWith('Equal') ? (q.kind === 'Equal highs' ? 'EQH $$$' : 'EQL $$$') : '$$$'}</text></g>; })}
      {on.ma && <><path className="cg-ma a" d={line(pa.ema20)} /><path className="cg-ma b" d={line(pa.sma50)} /></>}
      {xs.map((b, k) => { const i = from + k, x = X(i), up = b.close >= b.open; return (
        <g key={i} className={`${up ? 'cg-up' : 'cg-dn'} ${i > cut ? 'cg-after' : ''}`}><line x1={x} x2={x} y1={Y(b.high)} y2={Y(b.low)} /><rect x={x - cw * 0.35} width={cw * 0.7} y={Y(Math.max(b.open, b.close))} height={Math.max(1, Math.abs(Y(b.open) - Y(b.close)))} /></g>
      ); })}
      {on.structure && pa.swings.filter((s) => inView(s.i) && s.label).map((s, k) => <text key={`s${k}`} className={`cg-sw ${s.label === 'HH' || s.label === 'HL' ? 'up' : 'dn'}`} x={X(s.i)} y={s.type === 'H' ? Y(s.p) - 5 : Y(s.p) + 12} textAnchor="middle">{s.label}</text>)}
      {on.structure && pa.events.filter((e) => e.i >= from && e.i <= to).map((e, k) => <g key={`e${k}`} className={`cg-evt ${e.dir}`}><line x1={clampX(e.from)} x2={X(e.i)} y1={Y(e.level)} y2={Y(e.level)} /><text x={(clampX(e.from) + X(e.i)) / 2} y={Y(e.level) + (e.dir === 'bull' ? -4 : 11)} textAnchor="middle">{e.kind}</text></g>)}
      {on.liq && pa.sweeps.filter((s) => inView(s.i)).map((s, k) => <g key={`w${k}`} className={`cg-sweep ${s.dir}`}><circle cx={X(s.i)} cy={s.dir === 'bear' ? Y(bars[s.i].high) - 7 : Y(bars[s.i].low) + 7} r={4} /><text x={X(s.i)} y={s.dir === 'bear' ? Y(bars[s.i].high) - 14 : Y(bars[s.i].low) + 21} textAnchor="middle">sweep</text></g>)}
      {to > cut && <line className="cg-cut" x1={X(cut) + cw / 2} x2={X(cut) + cw / 2} y1={0} y2={H + VP} />}
      {on.vol && xs.map((b, k) => { const h = (b.volume / vmax) * (VP - 8), i = from + k; return <rect key={`v${i}`} className={`cg-vol ${b.close >= b.open ? 'up' : 'dn'} ${pa.volSpikes.includes(i) ? 'hot' : ''} ${i > cut ? 'cg-after' : ''}`} x={X(i) - cw * 0.35} width={cw * 0.7} y={H + VP - 2 - h} height={h} />; })}
    </svg>
  );
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

export default function LearnChartGame() {
  const [h, setH] = usePersisted<5 | 10 | 20>('cgH', 10);
  const [rec, setRec] = usePersisted<Rec>('cgRec', () => { try { const o = JSON.parse(localStorage.getItem('cgScore') ?? 'null'); return o ? { ...EMPTY, calls: o.rounds ?? 0, right: o.right ?? 0 } : EMPTY; } catch { return EMPTY; } });
  const [on, setOn] = usePersisted<Record<Layer, boolean>>('cgLayers', { structure: true, fvg: true, ob: false, liq: true, ma: true, vol: true });
  const [round, setRound] = useState<Round | null>(null);
  const [err, setErr] = useState('');
  const [guess, setGuess] = useState<'up' | 'down' | null>(null);
  const [loading, setLoading] = useState(false);

  const deal = async () => {
    setLoading(true); setErr(''); setGuess(null);
    for (let tries = 0; tries < 3; tries++) {
      const sym = GAME_SYMBOLS[pickIndex(GAME_SYMBOLS.length)];
      try {
        const r = await fetch(`/api/candles?symbol=${sym}&tf=D`); const j = await r.json();
        const bars: Bar[] = r.ok ? j.bars ?? [] : [];
        const cut = pickCut(bars.length, 20);
        if (cut == null) continue;
        const pre = read(bars, cut + 1), rep = analyze(bars.slice(0, cut + 1), sym, false);
        const names = [...namesAt(pre, cut), ...rep.charts.filter((c) => c.end >= cut - 10).map((c) => c.name), ...rep.candles.filter((c) => c.index >= cut - 3).map((c) => c.name)];
        setRound({ sym, bars, cut, names: [...new Set(names)], trend: pre.trend });
        setLoading(false); return;
      } catch { /* try another symbol */ }
    }
    setErr('Could not load a chart right now (price data is rate-limited). Try again in a minute.'); setLoading(false);
  };
  useEffect(() => { void deal(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pa = useMemo(() => (round ? read(round.bars, guess ? Math.min(round.bars.length, round.cut + h + 1) : round.cut + 1) : null), [round, guess, h]);
  const why = useMemo(() => (round && guess ? explain(round.bars, round.cut, h) : null), [round, guess, h]);
  const answer = (g: 'up' | 'down') => {
    if (!round || guess) return;
    setGuess(g);
    const move = outcome(round.bars, round.cut, h), right = (move > 0) === (g === 'up'), r = right ? 1 : 0;
    const withTrend = round.trend !== 'range' && (g === 'up') === (round.trend === 'bull');
    setRec((s) => { const bh = s.byH[h] ?? [0, 0], streak = right ? s.streak + 1 : 0; return { ...s, calls: s.calls + 1, right: s.right + r, byH: { ...s.byH, [h]: [bh[0] + 1, bh[1] + r] }, withT: withTrend ? [s.withT[0] + 1, s.withT[1] + r] : s.withT, againstT: !withTrend && round.trend !== 'range' ? [s.againstT[0] + 1, s.againstT[1] + r] : s.againstT, streak, best: Math.max(s.best, streak), baseSum: s.baseSum + baseRate(round.bars, h) }; });
  };

  const move = round && guess ? outcome(round.bars, round.cut, h) : NaN, right = guess ? (move > 0) === (guess === 'up') : null;
  const base = round ? baseRate(round.bars, h) : NaN, date = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

  return (
    <div className="cg">
      <section className="ad-card">
        <header className="ad-h"><h3>What happens next?</h3><span className="ln-chips">{([5, 10, 20] as const).map((x) => <button key={x} className={`chip sm ${h === x ? 'on' : ''}`} onClick={() => !guess && setH(x)}>{x} days</button>)}</span></header>
        <div className="ln-chips cg-layers">{LAYERS.map((l) => <button key={l.id} className={`chip sm ${on[l.id] ? 'on' : ''}`} onClick={() => setOn({ ...on, [l.id]: !on[l.id] })}>{l.label}</button>)}</div>
        {err && <p className="small down">{err}</p>}
        {loading && !round && <p className="small muted">Dealing a chart…</p>}
        {round && pa && (
          <>
            <ChartView bars={round.bars} from={round.cut - SHOW + 1} cut={round.cut} to={guess ? Math.min(round.bars.length - 1, round.cut + h) : round.cut} pa={pa} on={on} />
            <p className="small muted cg-hint">Click and drag the chart to look back; double-click to reset. It won't move past the hidden part.</p>
            <div className="cg-names"><span className="small muted">On this chart:</span>{round.names.length ? round.names.map((n) => <span key={n} className="cg-name" title={PA_DEFS[n.replace(/ \((up|down)\)$/, '')] ?? ''}>{n}</span>) : <span className="small muted">no named pattern near the cut; read the trend and levels.</span>}</div>
            {!guess ? (
              <div className="ln-chips"><span className="small">Next {h} trading days:</span><button className="chip cg-btn up" onClick={() => answer('up')}>Up</button><button className="chip cg-btn dn" onClick={() => answer('down')}>Down</button><span className="small muted">Hover a pattern name for what it means.</span></div>
            ) : (
              <div className={`cg-result ${right ? 'up' : 'down'}`}>
                <b>{right ? 'Right' : 'Wrong'}:</b> {round.sym} went {move >= 0 ? '+' : ''}{move.toFixed(1)}% over the next {h} trading days (from {date(round.bars[round.cut].time)}).
                <span className="small"> {Math.round(base * 100)}% of all {h}-day windows in this stock’s history ended higher: that’s what guessing “up” every time would score.</span>
                <button className="chip on" onClick={() => void deal()}>Next chart</button>
              </div>
            )}
            {why && (
              <div className="cg-why">
                <div><h4>What the chart showed at the cut</h4><ul>{why.before.map((x) => <li key={x}>{x}</li>)}</ul></div>
                <div><h4>Why it moved the way it did</h4><p className="cg-take">{why.takeaway}</p><ul>{why.after.map((x) => <li key={x}>{x}</li>)}</ul></div>
              </div>
            )}
          </>
        )}
        <p className="note">Daily candles (Yahoo, unofficial). Markings use common chart-trader definitions and only the bars before the cut until you answer. Charts explain price action, not the news behind it. Practice, not advice.</p>
      </section>
      <section className="ad-card cg-rec">
        <header className="ad-h"><h3>Your record</h3></header>
        <div className="cg-big"><b>{pct(rec.right, rec.calls)}</b><span>you were right</span></div>
        <div className="cg-stats">
          <div><span>Guessing “up” every time</span><b>{rec.calls ? `${Math.round((rec.baseSum / rec.calls) * 100)}%` : '—'}</b></div>
          <div><span>Calls with the trend</span><b>{pct(rec.withT[1], rec.withT[0])}</b></div>
          <div><span>Calls against the trend</span><b>{pct(rec.againstT[1], rec.againstT[0])}</b></div>
          {(['5', '10', '20'] as const).map((k) => <div key={k}><span>{k}-day calls</span><b>{pct(rec.byH[k]?.[1] ?? 0, rec.byH[k]?.[0] ?? 0)}</b></div>)}
          <div><span>Current streak</span><b>{rec.streak}</b></div>
          <div><span>Best streak</span><b>{rec.best}</b></div>
        </div>
        <p className="note">Beat the “up every time” number over many charts before trusting your read. Calls against the trend are where most traders lose.</p>
        {rec.calls > 0 && <button className="small linkish" onClick={() => setRec(EMPTY)}>Reset record</button>}
      </section>
    </div>
  );
}
