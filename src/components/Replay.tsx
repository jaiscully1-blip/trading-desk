// Replay a journal trade over its candles with the real fills, plus the ghost exit your rules would have taken.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CandlestickSeries, ColorType, CrosshairMode, LineStyle, createChart, createSeriesMarkers, type IChartApi, type IPriceLine, type ISeriesApi, type ISeriesMarkersPluginApi, type SeriesMarker, type Time, type UTCTimestamp } from 'lightweight-charts';
import type { Bar, Freshness, TF } from '../types';
import type { TradeView } from '../lib/journal';
import { DEFAULT_RULES, pickResolution, simulateGhost, type ExitRules } from '../lib/replay';
import { encodeInstant } from '../../shared/parse';
import { barIndexFor } from '../../shared/news';
import { etDay } from '../lib/journal';
import { rng } from '../lib/demo';
import { px, sUsd, tone } from '../lib/format';
import { Fresh, Kbd, Seg } from './common';

const PERIOD: Record<TF, number> = { '5m': 300, '15m': 900, '1H': 3600, D: 86400, W: 7 * 86400, M: 31 * 86400 };
const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/** Preview only: a 5-minute path that passes through the trade's real fill prices (Brownian bridge). Badged DEMO. */
function syntheticBars(v: TradeView): Bar[] {
  const fills = [...v.t.fills].sort((a, b) => a.t - b.t);
  const r = rng(fills[0].t % 100000);
  const points = fills.map((f) => ({ t: Math.floor(encodeInstant(f.t) / 300) * 300, p: f.price }));
  const start = points[0].t - 12 * 300, end = (v.status === 'open' ? points[0].t + 36 * 300 : points[points.length - 1].t + 18 * 300);
  const anchors = [{ t: start, p: points[0].p * (1 + (r() - 0.5) * 0.01) }, ...points, { t: end, p: points[points.length - 1].p * (1 + (r() - 0.45) * 0.012) }];
  const out: Bar[] = [];
  let prev = anchors[0].p;
  for (let k = 0; k < anchors.length - 1; k++) {
    const a = anchors[k], b = anchors[k + 1];
    const n = Math.max(1, (b.t - a.t) / 300);
    for (let i = 0; i < n; i++) {
      const target = a.p + ((b.p - a.p) * (i + 1)) / n;
      const close = target * (1 + (r() - 0.5) * 0.002);
      const vol = Math.abs(target) * 0.0015;
      out.push({ time: a.t + i * 300, open: prev, high: Math.max(prev, close) + r() * vol, low: Math.min(prev, close) - r() * vol, close, volume: 1000 });
      prev = close;
    }
  }
  return out;
}

export function ReplayOverlay({ v, live, theme, rules, setRules, onClose }: {
  v: TradeView; live: boolean; theme: string; rules: ExitRules; setRules: (r: ExitRules) => void; onClose: () => void;
}) {
  const [data, setData] = useState<{ bars: Bar[]; tf: TF; fresh: Freshness; src: string; error?: string } | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState('4');
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markers = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const lines = useRef<IPriceLine[]>([]);
  const t = v.t;
  const entryMs = v.openedAt ?? t.created;

  // load candles at the finest resolution that covers the entry
  useEffect(() => {
    let stop = false;
    (async () => {
      if (!live || t.demo) { setData({ bars: syntheticBars(v), tf: '5m', fresh: 'demo', src: 'Synthetic path through your real fill prices (preview)' }); return; }
      const get = async (tf: TF) => { const r = await fetch(`/api/candles?symbol=${t.sym}&tf=${tf}`); const j = await r.json(); return r.ok ? (j.bars as Bar[]) : null; };
      try {
        const b5 = await get('5m');
        const first = (bs: Bar[] | null) => (bs?.length ? bs[0].time : null);
        const entryEnc = encodeInstant(entryMs);
        let tf = pickResolution(entryEnc, first(b5), null);
        let bars = b5;
        if (tf !== '5m') { const b1 = await get('1H'); tf = pickResolution(entryEnc, first(b5), first(b1)); bars = tf === '1H' ? b1 : await get('D'); }
        if (!stop) setData(bars?.length ? { bars, tf, fresh: 'live', src: `Twelve Data ${tf} candles` } : { bars: [], tf, fresh: 'nodata', src: '', error: 'No candles for this trade (check API keys or try later).' });
      } catch (e) { if (!stop) setData({ bars: [], tf: '5m', fresh: 'nodata', src: '', error: (e as Error).message }); }
    })();
    return () => { stop = true; };
  }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const entryEnc = encodeInstant(entryMs);
  const period = data ? PERIOD[data.tf] : 300;
  const all = data?.bars ?? [];
  const ghost = useMemo(() => (all.length ? simulateGhost(all, v, data!.tf === 'D' ? Math.floor(entryEnc / 86400) * 86400 : entryEnc, rules, period) : null), [all, v, rules, period, entryEnc, data]);

  // window: a few bars before entry to a few after the later of the real exit and the ghost exit
  const win = useMemo(() => {
    if (!all.length) return { from: 0, to: 0 };
    const times = all.map((b) => b.time);
    const idx = (ms: number) => barIndexFor(times, period, data!.tf === 'D' ? Math.floor(encodeInstant(ms) / 86400) * 86400 : encodeInstant(ms));
    const ei = Math.max(0, idx(entryMs));
    const xi = v.closedAt ? idx(v.closedAt) : -1;
    const gi = ghost?.barIndex ?? -1;
    const last = Math.max(ei, xi < 0 ? all.length - 1 : xi, gi);
    const pad = data!.tf === '5m' ? 12 : 6;
    return { from: Math.max(0, ei - pad), to: Math.min(all.length - 1, last + pad), entryIdx: ei };
  }, [all, ghost, entryMs, v.closedAt, period, data]);
  const total = all.length ? win.to - win.from + 1 : 0;
  useEffect(() => { setCursor(Math.min(total, ((win as { entryIdx?: number }).entryIdx ?? win.from) - win.from + 1)); }, [total]); // eslint-disable-line react-hooks/exhaustive-deps

  // chart
  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: css('--panel') }, textColor: css('--muted'), fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: css('--line') }, horzLines: { color: css('--line') } },
      rightPriceScale: { borderColor: css('--line') }, timeScale: { borderColor: css('--line'), timeVisible: true, rightOffset: 6 },
      crosshair: { mode: CrosshairMode.Normal },
    });
    const s = c.addSeries(CandlestickSeries, { upColor: css('--up'), downColor: css('--down'), wickUpColor: css('--up'), wickDownColor: css('--down'), borderVisible: false });
    chart.current = c; series.current = s; markers.current = createSeriesMarkers(s, []); lines.current = [];
    return () => { c.remove(); chart.current = null; series.current = null; };
  }, [theme]);

  useEffect(() => {
    const s = series.current, c = chart.current;
    if (!s || !c || !all.length) return;
    const shown = all.slice(win.from, win.from + cursor);
    s.setData(shown.map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })));
    c.timeScale().setVisibleLogicalRange({ from: -2, to: total + 4 });
    const lastT = shown.at(-1)?.time ?? 0;
    const times = all.map((b) => b.time);
    const m: SeriesMarker<Time>[] = [];
    for (const f of [...t.fills].sort((a, b) => a.t - b.t)) {
      const i = barIndexFor(times, period, data!.tf === 'D' ? Math.floor(encodeInstant(f.t) / 86400) * 86400 : encodeInstant(f.t));
      if (i < 0 || times[i] > lastT) continue;
      const buy = f.action === 'buy';
      m.push({ time: times[i] as UTCTimestamp, position: buy ? 'belowBar' : 'aboveBar', shape: buy ? 'arrowUp' : 'arrowDown', color: buy ? css('--up') : css('--down'), text: `${buy ? 'BUY' : 'SELL'} ${f.qty} @ ${f.price}` });
    }
    if (ghost && times[ghost.barIndex] <= lastT) m.push({ time: times[ghost.barIndex] as UTCTimestamp, position: t.side === 'long' ? 'aboveBar' : 'belowBar', shape: 'square', color: css('--demo'), text: `GHOST ${ghost.reason} @ ${ghost.price.toFixed(2)}` });
    markers.current?.setMarkers(m.sort((a, b) => (a.time as number) - (b.time as number)));
    for (const l of lines.current) s.removePriceLine(l);
    lines.current = [];
    const line = (price: number | null | undefined, color: string, title: string, style = LineStyle.Dashed) => { if (price != null && Number.isFinite(price)) lines.current.push(s.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, title, axisLabelVisible: true })); };
    line(v.avgEntry, css('--accent'), 'entry', LineStyle.Solid);
    line(t.initialStop, css('--down'), 'stop');
    if (rules.targetR && v.avgEntry != null && t.initialStop != null) line(v.avgEntry + (t.side === 'long' ? 1 : -1) * rules.targetR * Math.abs(v.avgEntry - t.initialStop), css('--up'), `${rules.targetR}R`);
    if (ghost && times[ghost.barIndex] <= lastT) line(ghost.price, css('--demo'), 'ghost', LineStyle.Dotted);
  }, [cursor, all, win, ghost, theme, rules, data, period, t, v, total]);

  // playback
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setCursor((c) => { if (c >= total) { setPlaying(false); return c; } return c + 1; }), 1000 / (+speed * 2));
    return () => clearInterval(id);
  }, [playing, speed, total]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setCursor((c) => Math.min(total, c + 1)); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setCursor((c) => Math.max(1, c - 1)); }
      else if (e.key === 'Home') setCursor(1);
      else if (e.key === 'End') setCursor(total);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [total]);

  const actualR = v.r, actual$ = v.realized;
  const dR = ghost && actualR != null ? ghost.r - actualR : null;
  const d$ = ghost && v.status === 'closed' ? ghost.pnl - actual$ : null;
  const setR = (p: Partial<ExitRules>) => setRules({ ...rules, ...p });
  const num = (x: string) => (x === '' ? null : Math.max(0, +x || 0));

  return (
    <div className="overlay" role="dialog" aria-label="Trade replay">
      <div className="overlay-in rp">
        <div className="phead">
          <div className="phead-title">Replay · {t.sym} {t.side} · {etDay(entryMs)}{data && <span className="muted small">&nbsp;· {data.tf} candles</span>}</div>
          <div className="phead-ctl">{data && <Fresh kind={data.fresh} src={data.src} />}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="rp-body">
          <div className="rp-main">
            <div className="rp-chart" ref={el}>{!data ? <div className="chart-empty">Loading candles…</div> : data.error ? <div className="chart-empty">{data.error}</div> : null}</div>
            <div className="rp-ctl">
              <button className="btn primary" onClick={() => { if (cursor >= total) setCursor(1); setPlaying((p) => !p); }} disabled={!total}>{playing ? 'Pause' : cursor >= total ? 'Replay' : 'Play'}</button>
              <button className="btn" onClick={() => setCursor((c) => Math.max(1, c - 1))} aria-label="Step back">◀</button>
              <button className="btn" onClick={() => setCursor((c) => Math.min(total, c + 1))} aria-label="Step forward">▶</button>
              <input type="range" min={1} max={Math.max(1, total)} value={cursor} onChange={(e) => { setPlaying(false); setCursor(+e.target.value); }} aria-label="Scrub" />
              <Seg value={speed} onChange={setSpeed} options={[{ id: '1', label: '1x' }, { id: '4', label: '4x' }, { id: '10', label: '10x' }]} />
              <span className="muted small"><Kbd>Space</Kbd> play · <Kbd>←</Kbd><Kbd>→</Kbd> step</span>
            </div>
          </div>
          <aside className="rp-side">
            <h4>Actual</h4>
            <div className="kv">
              <span>Entry</span><b className="num">{v.avgEntry != null ? px(v.avgEntry) : '—'} × {v.maxQty}</b>
              <span>Exit</span><b className="num">{v.avgExit != null ? px(v.avgExit) : v.status}</b>
              <span>Result</span><b className={`num ${tone(actual$)}`}>{sUsd(actual$)} · {actualR != null ? `${actualR.toFixed(2)}R` : '—'}</b>
            </div>
            <h4>Ghost exit (your rules)</h4>
            {ghost ? (
              <div className="kv">
                <span>Exit</span><b className="num">{px(ghost.price)} · {ghost.reason}</b>
                <span>Result</span><b className={`num ${tone(ghost.pnl)}`}>{sUsd(ghost.pnl)} · {ghost.r.toFixed(2)}R</b>
                <span>Difference</span><b className={`num ${tone(d$ ?? 0)}`}>{d$ != null ? `${sUsd(d$)} · ${dR! >= 0 ? '+' : ''}${dR!.toFixed(2)}R` : 'trade still open'}</b>
              </div>
            ) : <p className="small muted">{t.initialStop == null ? 'No stop logged, so there is no 1R to simulate from.' : 'Waiting for candles…'}</p>}
            {d$ != null && <p className={`rp-verdict ${d$ > 0 ? 'warn-txt' : 'up'}`}>{d$ > 0 ? `Your rules would have made ${sUsd(d$)} more (+${dR!.toFixed(2)}R).` : d$ < 0 ? `You beat your rules by ${sUsd(-d$)}.` : 'Same result as your rules.'}</p>}
            <h4>Exit rules</h4>
            <div className="rp-rules">
              <label><input type="checkbox" checked={rules.stop} onChange={(e) => setR({ stop: e.target.checked })} /> Initial stop</label>
              <label><input type="checkbox" checked={rules.targetR != null} onChange={(e) => setR({ targetR: e.target.checked ? 2 : null })} /> Target at <input inputMode="decimal" value={rules.targetR ?? ''} disabled={rules.targetR == null} onChange={(e) => setR({ targetR: num(e.target.value) })} /> R</label>
              <label><input type="checkbox" checked={rules.trail.on} onChange={(e) => setR({ trail: { ...rules.trail, on: e.target.checked } })} /> Trail after <input inputMode="decimal" value={rules.trail.startR} onChange={(e) => setR({ trail: { ...rules.trail, startR: num(e.target.value) ?? 1 } })} /> R by <input inputMode="decimal" value={rules.trail.distR} onChange={(e) => setR({ trail: { ...rules.trail, distR: num(e.target.value) ?? 1 } })} /> R</label>
              <label><input type="checkbox" checked={rules.timeStopMin != null} onChange={(e) => setR({ timeStopMin: e.target.checked ? 90 : null })} /> Time stop <input inputMode="numeric" value={rules.timeStopMin ?? ''} disabled={rules.timeStopMin == null} onChange={(e) => setR({ timeStopMin: num(e.target.value) })} /> min</label>
              <label><input type="checkbox" checked={rules.eod} onChange={(e) => setR({ eod: e.target.checked })} /> Flat by the close</label>
              <button className="chip sm" onClick={() => setRules(DEFAULT_RULES)}>Reset to defaults</button>
            </div>
            <p className="note">Simulated on {data?.tf ?? '5m'} candles starting the bar after entry. If a stop and target fall inside the same candle, the stop is assumed first. Gaps fill at the open.</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
