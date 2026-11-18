// Learn → Chart game: a real daily chart from a random stock and date with the ending hidden. Call up or down over the
// next 5, 10 or 20 trading days, then see what happened, the base rate for that stock, and any pattern the desk's own
// detector saw at the cut. The ticker and date stay hidden until you answer. Practice only, not advice.
import { useEffect, useState } from 'react';
import type { Bar } from '../../shared/types';
import { analyze } from '../../shared/patterns';
import { baseRate, GAME_SYMBOLS, outcome, pickCut, pickIndex, SHOW } from '../../shared/chartgame';
import { usePersisted } from '../lib/store';

interface Round { sym: string; bars: Bar[]; cut: number; pattern: { name: string; bias: string } | null }
interface Score { rounds: number; right: number; byPattern: Record<string, { n: number; right: number }> }

function Candles({ bars, from, cut, to }: { bars: Bar[]; from: number; cut: number; to: number }) {
  const xs = bars.slice(from, to + 1);
  const hi = Math.max(...xs.map((b) => b.high)), lo = Math.min(...xs.map((b) => b.low));
  const W = 900, H = 320, n = to - from + 1, cw = W / n, y = (p: number) => 8 + ((hi - p) / (hi - lo || 1)) * (H - 16);
  return (
    <svg className="cg-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Price chart">
      {xs.map((b, k) => { const i = from + k, x = k * cw + cw / 2, up = b.close >= b.open, after = i > cut; return (
        <g key={i} className={`${up ? 'cg-up' : 'cg-dn'} ${after ? 'cg-after' : ''}`}>
          <line x1={x} x2={x} y1={y(b.high)} y2={y(b.low)} />
          <rect x={x - cw * 0.35} width={cw * 0.7} y={y(Math.max(b.open, b.close))} height={Math.max(1, Math.abs(y(b.open) - y(b.close)))} />
        </g>
      ); })}
      {to > cut && <line className="cg-cut" x1={(cut - from + 1) * cw} x2={(cut - from + 1) * cw} y1={0} y2={H} />}
    </svg>
  );
}

export default function LearnChartGame() {
  const [h, setH] = usePersisted<5 | 10 | 20>('cgH', 10);
  const [score, setScore] = usePersisted<Score>('cgScore', { rounds: 0, right: 0, byPattern: {} });
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
        const rep = analyze(bars.slice(0, cut + 1), sym, false);
        const ch = rep.charts.find((c) => c.end >= cut - 3) ?? null, cd = rep.candles.find((c) => c.index === cut) ?? null;
        const p = ch ?? cd;
        setRound({ sym, bars, cut, pattern: p ? { name: p.name, bias: p.bias } : null });
        setLoading(false); return;
      } catch { /* try another symbol */ }
    }
    setErr('Could not load a chart right now (price data is rate-limited). Try again in a minute.'); setLoading(false);
  };
  useEffect(() => { void deal(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = (g: 'up' | 'down') => {
    if (!round || guess) return;
    setGuess(g);
    const move = outcome(round.bars, round.cut, h), right = (move > 0) === (g === 'up');
    const key = round.pattern?.name ?? 'No pattern';
    setScore((s) => ({ rounds: s.rounds + 1, right: s.right + (right ? 1 : 0), byPattern: { ...s.byPattern, [key]: { n: (s.byPattern[key]?.n ?? 0) + 1, right: (s.byPattern[key]?.right ?? 0) + (right ? 1 : 0) } } }));
  };

  const move = round && guess ? outcome(round.bars, round.cut, h) : NaN;
  const base = round ? baseRate(round.bars, h) : NaN;
  const right = guess ? (move > 0) === (guess === 'up') : null;
  const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
  const date = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
  const top = Object.entries(score.byPattern).sort((a, b) => b[1].n - a[1].n).slice(0, 8);

  return (
    <div className="cg">
      <section className="ad-card">
        <header className="ad-h">
          <h3>What happened next?</h3>
          <span className="ln-chips">{([5, 10, 20] as const).map((x) => <button key={x} className={`chip sm ${h === x ? 'on' : ''}`} onClick={() => !guess && setH(x)}>{x} days</button>)}</span>
        </header>
        {err && <p className="small down">{err}</p>}
        {loading && !round && <p className="small muted">Dealing a chart…</p>}
        {round && (
          <>
            <Candles bars={round.bars} from={round.cut - SHOW + 1} cut={round.cut} to={guess ? round.cut + h : round.cut} />
            <p className="small muted">Daily candles, last {SHOW} trading days shown. {round.pattern ? <>The desk’s pattern detector sees: <b>{round.pattern.name}</b> ({round.pattern.bias === 'bull' ? 'usually read as bullish' : round.pattern.bias === 'bear' ? 'usually read as bearish' : 'neutral'}).</> : 'No pattern flagged at this point.'}</p>
            {!guess ? (
              <div className="ln-chips"><span className="small">Next {h} trading days:</span><button className="chip cg-btn up" onClick={() => answer('up')}>Up</button><button className="chip cg-btn dn" onClick={() => answer('down')}>Down</button></div>
            ) : (
              <div className={`cg-result ${right ? 'up' : 'down'}`}>
                <b>{right ? 'Right' : 'Wrong'}:</b> {round.sym} went {pct(move)} over the next {h} trading days (from {date(round.bars[round.cut].time)}).
                <span className="small"> In this stock’s last {round.bars.length} days, {Math.round(base * 100)}% of {h}-day windows ended higher: that is the bar to beat by guessing “up” every time.</span>
                <button className="chip on" onClick={() => void deal()}>Next chart</button>
              </div>
            )}
          </>
        )}
      </section>
      <section className="ad-card">
        <header className="ad-h"><h3>Your record</h3><span className="small muted">{score.rounds} rounds · {score.rounds ? Math.round((score.right / score.rounds) * 100) : 0}% right</span></header>
        {top.length ? <table className="ad-table"><thead><tr><th>Pattern at the cut</th><th className="r">Rounds</th><th className="r">You were right</th></tr></thead><tbody>{top.map(([k, v]) => <tr key={k}><td>{k}</td><td className="r num">{v.n}</td><td className="r num">{Math.round((v.right / v.n) * 100)}%</td></tr>)}</tbody></table> : <p className="small muted">Play a few rounds to see which patterns you read well.</p>}
        <p className="note">A handful of rounds proves little either way; after 50 or more, compare your hit rate to the base rate. Real price history from the desk’s chart feed (Yahoo, unofficial). Practice, not advice.</p>
        {score.rounds > 0 && <button className="small linkish" onClick={() => setScore({ rounds: 0, right: 0, byPattern: {} })}>Reset record</button>}
      </section>
    </div>
  );
}
