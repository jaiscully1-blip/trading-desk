// Pattern lookup page (X): type a ticker, see candlestick signals and chart patterns drawn on the chart,
// read a rule-written description of each, and save the whole thing as an image. $0: no AI calls.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart, createSeriesMarkers,
  type IChartApi, type IPriceLine, type ISeriesApi, type ISeriesMarkersPluginApi, type SeriesMarker, type Time, type UTCTimestamp,
} from 'lightweight-charts';
import { analyze, barLabel, type ChartHit, type Hit, type PatternLine } from '../../shared/patterns';
import { useSeries, type DataMode } from '../data/live';
import { usePersisted } from '../lib/store';
import { px } from '../lib/format';
import { Fresh, Seg } from './common';

type PTF = 'D' | '1H';
const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SYM_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const hitKey = (h: Hit) => (h.kind === 'chart' ? `c:${h.id}:${h.start}` : `k:${h.id}:${h.index}`);

export default function PatternLab({ mode, theme, symbols, demoLast, onChart }: {
  mode: DataMode; theme: string; symbols: string[]; demoLast: (s: string) => number; onChart: (s: string) => void;
}) {
  const [sym, setSym] = usePersisted('patSym', 'SPY');
  const [tf, setTf] = usePersisted<PTF>('patTf', 'D');
  const [draft, setDraft] = useState(sym);
  const [selKey, setSelKey] = useState<string | null>(null);
  const series = useSeries(sym, tf, mode, demoLast(sym));
  const bars = series.bars;
  const intraday = tf !== 'D';
  const report = useMemo(() => analyze(bars, sym, intraday), [bars, sym, intraday]);
  const hits: Hit[] = useMemo(() => [...report.charts, ...report.candles], [report]);
  const sel = hits.find((h) => hitKey(h) === selKey) ?? report.charts[0] ?? null;

  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const cs = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const vol = useRef<ISeriesApi<'Histogram'> | null>(null);
  const mk = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const drawn = useRef<ISeriesApi<'Line'>[]>([]);
  const plines = useRef<IPriceLine[]>([]);

  useEffect(() => setSelKey(null), [sym, tf]);

  // chart: create per theme / timeframe
  useEffect(() => {
    if (!el.current) return;
    const line = cssVar('--line'), up = cssVar('--up'), down = cssVar('--down');
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: cssVar('--panel') }, textColor: cssVar('--muted'), fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: line }, horzLines: { color: line } },
      rightPriceScale: { borderColor: line }, timeScale: { borderColor: line, timeVisible: tf !== 'D', secondsVisible: false, rightOffset: 4 },
      crosshair: { mode: CrosshairMode.Normal },
    });
    const s = c.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false });
    s.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.2 } });
    const v = c.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    v.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    chart.current = c; cs.current = s; vol.current = v; mk.current = createSeriesMarkers(s, []);
    drawn.current = []; plines.current = [];
    return () => { c.remove(); chart.current = null; cs.current = null; };
  }, [theme, tf]);

  // data + candle markers
  useEffect(() => {
    if (!cs.current || !vol.current) return;
    const up = cssVar('--up'), down = cssVar('--down');
    cs.current.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })));
    vol.current.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, value: b.volume, color: b.close >= b.open ? `${up}55` : `${down}55` })));
    const m: SeriesMarker<Time>[] = [...report.candles].reverse().map((h) => ({
      time: bars[h.index].time as UTCTimestamp,
      position: h.bias === 'bear' ? 'aboveBar' : 'belowBar',
      shape: h.bias === 'bull' ? 'arrowUp' : h.bias === 'bear' ? 'arrowDown' : 'circle',
      color: h.bias === 'bull' ? up : h.bias === 'bear' ? down : cssVar('--muted'),
      text: h.name,
      size: sel && hitKey(sel) === hitKey(h) ? 2 : 1,
    }));
    mk.current?.setMarkers(m);
  }, [bars, report, sel, theme, tf]);

  // chart-pattern lines + selected pattern's trigger / stop / target
  useEffect(() => {
    const c = chart.current, s = cs.current;
    if (!c || !s || !bars.length) return;
    drawn.current.forEach((x) => c.removeSeries(x)); drawn.current = [];
    plines.current.forEach((x) => s.removePriceLine(x)); plines.current = [];
    const color = (r: PatternLine['role']) => (r === 'resistance' ? cssVar('--down') : r === 'support' ? cssVar('--up') : r === 'neckline' ? cssVar('--accent') : cssVar('--vwap') || cssVar('--accent'));
    for (const h of report.charts) {
      const on = sel && hitKey(sel) === hitKey(h);
      for (const l of h.lines) {
        if (l.b[0] <= l.a[0] || !bars[l.a[0]] || !bars[l.b[0]]) continue;
        const ls = c.addSeries(LineSeries, { color: color(l.role), lineWidth: on ? 2 : 1, lineStyle: l.role === 'outline' ? LineStyle.Solid : LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        ls.setData([{ time: bars[l.a[0]].time as UTCTimestamp, value: l.a[1] }, { time: bars[l.b[0]].time as UTCTimestamp, value: l.b[1] }]);
        if (!on) ls.applyOptions({ color: `${color(l.role)}66` });
        drawn.current.push(ls);
      }
    }
    if (sel?.kind === 'chart') {
      const add = (v: number | undefined, title: string, col: string) => v != null && plines.current.push(s.createPriceLine({ price: v, color: col, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title }));
      add(sel.trigger, 'trigger', cssVar('--accent'));
      add(sel.stop, 'stop', cssVar('--down'));
      add(sel.target, 'target', cssVar('--up'));
    }
    // frame the selection
    const n = bars.length;
    const from = sel ? (sel.kind === 'chart' ? sel.start : sel.index) : n - 90;
    c.timeScale().setVisibleLogicalRange({ from: Math.max(0, Math.min(from - 12, n - 60)), to: n + 4 });
  }, [bars, report, sel, theme, tf]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const s = draft.trim().toUpperCase();
    if (SYM_RE.test(s)) setSym(s);
  };

  const saveImage = () => {
    const c = chart.current;
    if (!c) return;
    const shot = c.takeScreenshot();
    const dpr = shot.width / (el.current?.clientWidth || shot.width);
    const W = shot.width, pad = 20 * dpr;
    const font = (sz: number, w = 400) => `${w} ${sz * dpr}px "IBM Plex Sans", system-ui, sans-serif`;
    const g0 = document.createElement('canvas').getContext('2d')!;
    const wrap = (text: string, sz: number) => {
      g0.font = font(sz);
      const out: string[] = []; let line = '';
      for (const w of text.split(' ')) { const t = line ? `${line} ${w}` : w; if (g0.measureText(t).width > W - 2 * pad && line) { out.push(line); line = w; } else line = t; }
      if (line) out.push(line);
      return out;
    };
    const blocks: { head?: string; lines: string[] }[] = [{ lines: wrap(report.summary, 14) }];
    for (const h of hits.slice(0, 4)) blocks.push({ head: `${h.name}${h.kind === 'chart' ? ` · ${h.status}` : ''}`, lines: wrap(h.text, 13) });
    const lh = 19 * dpr;
    const textH = blocks.reduce((s, b) => s + (b.head ? lh * 1.2 : 0) + b.lines.length * lh + 10 * dpr, 0);
    const head = 56 * dpr;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = head + shot.height + textH + pad;
    const g = cv.getContext('2d')!;
    g.fillStyle = cssVar('--panel'); g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = cssVar('--accent'); g.font = `600 ${20 * dpr}px "IBM Plex Mono", monospace`; g.fillText(`${sym} · ${tf === 'D' ? 'Daily' : 'Hourly'} patterns`, pad, 30 * dpr);
    g.fillStyle = cssVar('--muted'); g.font = font(12);
    g.fillText(`${series.source || 'data'} · ${series.freshness === 'demo' ? 'DEMO DATA' : 'as of ' + new Date(series.asOf || Date.now()).toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET'} · rule-based detection, not advice`, pad, 48 * dpr);
    g.drawImage(shot, 0, head);
    let y = head + shot.height + pad;
    for (const b of blocks) {
      if (b.head) { g.fillStyle = cssVar('--accent'); g.font = font(14, 600); g.fillText(b.head, pad, y); y += lh * 1.2; }
      g.fillStyle = cssVar('--text'); g.font = font(b.head ? 13 : 14);
      for (const l of b.lines) { g.fillText(l, pad, y); y += lh; }
      y += 10 * dpr;
    }
    const a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = `${sym}-${tf}-patterns-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  };

  const biasTag = (b: Hit['bias']) => <span className={`tag ${b === 'bull' ? 'up' : b === 'bear' ? 'down' : ''}`}>{b === 'bull' ? 'bullish' : b === 'bear' ? 'bearish' : 'neutral'}</span>;
  const quick = [...new Set(['SPY', 'QQQ', ...symbols])].slice(0, 14);

  return (
    <div className="page page-split pat">
      <section className="panel pat-chart">
        <div className="phead">
          <form className="pat-form" onSubmit={submit}>
            <label className="sr-only" htmlFor="pat-sym">Ticker</label>
            <input id="pat-sym" className="pat-input" value={draft} onChange={(e) => setDraft(e.target.value.toUpperCase())} placeholder="Ticker, e.g. NVDA" spellCheck={false} autoComplete="off" />
            <button className="btn primary" type="submit">Find patterns</button>
          </form>
          <div className="phead-ctl">
            <Seg value={tf} onChange={setTf} options={[{ id: 'D', label: 'D' }, { id: '1H', label: '1H' }]} />
            <Fresh kind={series.freshness} at={series.asOf} src={series.source} />
            <button className="btn" onClick={saveImage} disabled={!bars.length} title="Download chart + descriptions as a PNG">Save image</button>
          </div>
        </div>
        <div className="pat-quick">{quick.map((s) => <button key={s} className={`sym-chip ${s === sym ? 'on' : ''}`} onClick={() => { setDraft(s); setSym(s); }}>{s}</button>)}</div>
        <div className="pat-canvas" ref={el} />
        {series.error && <p className="small down pat-err">Couldn’t load {sym}: {series.error}</p>}
      </section>
      <section className="panel pat-side">
        <div className="phead"><div className="phead-title">{sym} · what the chart shows</div><button className="btn" onClick={() => onChart(sym)}>Open on desk</button></div>
        <div className="pat-body">
          <p className="pat-sum">{series.loading && !bars.length ? 'Loading…' : report.summary}</p>
          {report.charts.length > 0 && <h4>Chart patterns</h4>}
          {report.charts.map((h: ChartHit) => (
            <button key={hitKey(h)} className={`pat-hit ${sel && hitKey(sel) === hitKey(h) ? 'on' : ''}`} onClick={() => setSelKey(hitKey(h))}>
              <div className="pat-hit-h"><b>{h.name}</b>{biasTag(h.bias)}<span className={`tag ${h.status === 'confirmed' ? 'up' : h.status === 'failed' ? 'down' : ''}`}>{h.status}</span></div>
              <p>{h.text}</p>
              {(h.trigger != null || h.target != null) && <div className="pat-lv num small">{h.trigger != null && <span>Trigger {px(h.trigger)}</span>}{h.stop != null && <span>Stop {px(h.stop)}</span>}{h.target != null && <span>Target {px(h.target)}</span>}</div>}
            </button>
          ))}
          {report.candles.length > 0 && <h4>Candlestick signals (last 25 bars)</h4>}
          {report.candles.map((h) => (
            <button key={hitKey(h)} className={`pat-hit ${sel && hitKey(sel) === hitKey(h) ? 'on' : ''}`} onClick={() => setSelKey(hitKey(h))}>
              <div className="pat-hit-h"><b>{h.name}</b>{biasTag(h.bias)}<span className="muted small">{barLabel(bars[h.index].time, intraday)}</span></div>
              <p>{h.text.replace(/^[^:]+: /, '')}</p>
            </button>
          ))}
          <p className="note">Rule-based detection on {tf === 'D' ? 'daily' : 'hourly'} bars: swing points, trendline fits and candle-shape rules, described from templates (no AI, $0). Measured-move targets are the textbook projection, not a forecast. Patterns fail often; use the trigger and stop, not the target, to manage risk.</p>
        </div>
      </section>
    </div>
  );
}
