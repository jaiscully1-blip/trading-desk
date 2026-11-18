// Small live chart for an indicator lesson: real daily bars (or today's 5-minute bars for VWAP) with the indicator drawn
// on top or in a pane below, and a slider for its period so you can see how the setting changes it.
import { useMemo, useState } from 'react';
import type { Bar } from '../../shared/types';
import type { ChartKind } from '../../shared/lessons';
import { atr, ema, macd, rsi, sma } from '../lib/indicators';

const W = 520, H = 150, P = 70, N = 140;
type L = (number | null)[];

function path(vals: L, lo: number, hi: number, h: number, y0 = 0) {
  let d = '';
  vals.forEach((v, i) => { if (v == null || !Number.isFinite(v)) return; const x = (i / (vals.length - 1)) * W, y = y0 + 4 + ((hi - v) / (hi - lo || 1)) * (h - 8); d += `${d ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`; });
  return d;
}

export function MiniChart({ kind, daily, intraday, period }: { kind: ChartKind; daily: Bar[]; intraday: Bar[]; period?: [number, number, number] }) {
  const [n, setN] = useState(period?.[2] ?? 14);
  const pane = ['rsi', 'macd', 'atr', 'volume', 'stoch'].includes(kind);
  const src = kind === 'vwap' ? intraday : daily;
  const view = useMemo(() => {
    if (src.length < 30) return null;
    const take = kind === 'vwap' ? src : src.slice(-Math.max(N, kind === 'avwap' || kind === 'fib' ? n + 10 : N));
    const extra = 250; // indicator warm-up
    const full = kind === 'vwap' ? take : src.slice(-(take.length + extra));
    const closes = full.map((b) => b.close), off = full.length - take.length;
    const cut = (x: L) => x.slice(off);
    const over: { v: L; cls: string }[] = [], sub: { v: L; cls: string; bars?: boolean }[] = [];
    let subLo = 0, subHi = 100, hlines: number[] = [], levels: number[] = [];
    if (kind === 'sma') over.push({ v: cut(sma(closes, n)), cls: 'mc-a' });
    if (kind === 'ema') over.push({ v: cut(ema(closes, n)), cls: 'mc-a' }, { v: cut(sma(closes, n)), cls: 'mc-ghost' });
    if (kind === 'cross') over.push({ v: cut(ema(closes, n)), cls: 'mc-a' }, { v: cut(ema(closes, Math.round(n * 2.33))), cls: 'mc-b' });
    if (kind === 'bb') { const m = sma(closes, n); const sd = closes.map((_, i) => { if (i < n - 1) return null; const w = closes.slice(i - n + 1, i + 1), mu = m[i]!; return Math.sqrt(w.reduce((a, x) => a + (x - mu) ** 2, 0) / n); }); over.push({ v: cut(m), cls: 'mc-a' }, { v: cut(m.map((x, i) => (x != null && sd[i] != null ? x + 2 * sd[i]! : null))), cls: 'mc-b' }, { v: cut(m.map((x, i) => (x != null && sd[i] != null ? x - 2 * sd[i]! : null))), cls: 'mc-b' }); }
    if (kind === 'vwap') { let pv = 0, v = 0; over.push({ v: take.map((b) => { pv += ((b.high + b.low + b.close) / 3) * b.volume; v += b.volume; return v ? pv / v : null; }), cls: 'mc-a' }); }
    if (kind === 'avwap') { const a = take.length - n; let pv = 0, v = 0; over.push({ v: take.map((b, i) => { if (i < a) return null; pv += ((b.high + b.low + b.close) / 3) * b.volume; v += b.volume; return v ? pv / v : null; }), cls: 'mc-a' }); }
    if (kind === 'fib') { const w = take.slice(-n), hi = Math.max(...w.map((b) => b.high)), lo = Math.min(...w.map((b) => b.low)); levels = [0.382, 0.5, 0.618].map((r) => hi - (hi - lo) * r); }
    if (kind === 'rsi') { sub.push({ v: cut(rsi(closes, n)), cls: 'mc-a' }); hlines = [30, 70]; }
    if (kind === 'stoch') { const k = full.map((b, i) => { if (i < n - 1) return null; const w = full.slice(i - n + 1, i + 1), hh = Math.max(...w.map((x) => x.high)), ll = Math.min(...w.map((x) => x.low)); return hh > ll ? ((b.close - ll) / (hh - ll)) * 100 : 50; }); sub.push({ v: cut(k), cls: 'mc-a' }, { v: cut(sma(k.map((x) => x ?? 50), 3)), cls: 'mc-b' }); hlines = [20, 80]; }
    if (kind === 'macd') { const m = macd(closes); const l = cut(m.line), s = cut(m.signal), h = cut(m.hist); const all = [...l, ...s, ...h].filter((x): x is number => x != null); subLo = Math.min(...all); subHi = Math.max(...all); sub.push({ v: h, cls: 'mc-hist', bars: true }, { v: l, cls: 'mc-a' }, { v: s, cls: 'mc-b' }); hlines = [0]; }
    if (kind === 'atr') { const a = cut(atr(full, n)); const xs = a.filter((x): x is number => x != null); subLo = Math.min(...xs); subHi = Math.max(...xs); sub.push({ v: a, cls: 'mc-a' }); }
    if (kind === 'volume') { const vol = take.map((b) => b.volume), avg = cut(sma(full.map((b) => b.volume), n)); subLo = 0; subHi = Math.max(...vol); sub.push({ v: vol, cls: 'mc-vol', bars: true }, { v: avg, cls: 'mc-a' }); }
    const prices = take.flatMap((b) => [b.high, b.low]).concat(over.flatMap((o) => o.v.filter((x): x is number => x != null)), levels);
    return { take, over, sub, lo: Math.min(...prices), hi: Math.max(...prices), subLo, subHi, hlines, levels, avgVol: kind === 'volume' ? cut(sma(full.map((b) => b.volume), n)) : null };
  }, [src, kind, n]);
  if (!view) return <div className="mc-empty small muted">Loading SPY…</div>;
  const total = pane ? H + P : H, bw = W / view.take.length;
  return (
    <div className="mc">
      <svg viewBox={`0 0 ${W} ${total}`} className="mc-svg" role="img" aria-label="Indicator example chart">
        <path d={path(view.take.map((b) => b.close), view.lo, view.hi, H)} className="mc-price" />
        {view.over.map((o, i) => <path key={i} d={path(o.v, view.lo, view.hi, H)} className={o.cls} />)}
        {view.levels.map((lv) => { const y = 4 + ((view.hi - lv) / (view.hi - view.lo)) * (H - 8); return <g key={lv}><line x1={0} x2={W} y1={y} y2={y} className="mc-lvl" /></g>; })}
        {pane && <>
          <line x1={0} x2={W} y1={H + 2} y2={H + 2} className="mc-sep" />
          {view.hlines.map((h) => { const y = H + 4 + ((view.subHi - h) / (view.subHi - view.subLo || 1)) * (P - 8); return <line key={h} x1={0} x2={W} y1={y} y2={y} className="mc-lvl" />; })}
          {view.sub.map((s, i) => s.bars ? <g key={i}>{s.v.map((v, k) => { if (v == null) return null; const y0 = H + 4 + ((view.subHi - Math.max(0, view.subLo)) / (view.subHi - view.subLo || 1)) * (P - 8), y = H + 4 + ((view.subHi - v) / (view.subHi - view.subLo || 1)) * (P - 8); const hot = s.cls === 'mc-vol' && view.avgVol?.[k] != null && v > view.avgVol[k]!; return <rect key={k} x={k * bw} width={Math.max(1, bw * 0.7)} y={Math.min(y, y0)} height={Math.abs(y0 - y)} className={`${s.cls} ${hot ? 'hot' : ''} ${v < 0 ? 'neg' : ''}`} />; })}</g> : <path key={i} d={path(s.v, view.subLo, view.subHi, P, H)} className={s.cls} />)}
        </>}
      </svg>
      {period && <label className="mc-slider small"><span>{kind === 'avwap' ? 'Anchor' : kind === 'fib' ? 'Swing over' : 'Period'} <b className="num">{n}</b>{kind === 'avwap' || kind === 'fib' ? ' days' : ''}{kind === 'cross' ? ` / ${Math.round(n * 2.33)}` : ''}</span><input type="range" min={period[0]} max={period[1]} value={n} onChange={(e) => setN(Number(e.target.value))} /></label>}
      <span className="small muted">{kind === 'vwap' ? 'SPY, latest session, 5-minute bars' : 'SPY, daily'} · Yahoo (unofficial, delayed)</span>
    </div>
  );
}
