import { useEffect, useMemo, useRef } from 'react';
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart,
  type IChartApi, type IPriceLine, type ISeriesApi, type UTCTimestamp,
} from 'lightweight-charts';
import type { TF } from '../types';
import type { SeriesState } from '../data/live';
import { sma, toPts, vwapSeries } from '../lib/indicators';
import { LEVEL_SHORT, type Level } from '../lib/levels';
import { usePersisted } from '../lib/store';
import { Fresh, PanelHead, Seg } from './common';
import { pct, px, tone } from '../lib/format';

const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
type Overlays = { vwap: boolean; ma: boolean; lvl: boolean };

export function ChartPanel({
  sym, name, last, chgPct, tf, onTf, theme, series, levels, onPopout,
}: {
  sym: string; name: string; last: number; chgPct: number; tf: TF; onTf: (t: TF) => void; theme: string;
  series: SeriesState; levels: Level[]; onPopout?: () => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const s = useRef<{ c: ISeriesApi<'Candlestick'>; v: ISeriesApi<'Histogram'>; vw: ISeriesApi<'Line'>; m20: ISeriesApi<'Line'>; m50: ISeriesApi<'Line'> } | null>(null);
  const lines = useRef<IPriceLine[]>([]);
  const fitted = useRef('');
  const [ov, setOv] = usePersisted<Overlays>('chartOverlays', { vwap: true, ma: true, lvl: true });
  const bars = series.bars;

  // create once per timeframe/theme
  useEffect(() => {
    if (!el.current) return;
    const up = cssVar('--up'), down = cssVar('--down'), line = cssVar('--line');
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: cssVar('--panel') }, textColor: cssVar('--muted'), fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: line }, horzLines: { color: line } },
      rightPriceScale: { borderColor: line },
      timeScale: { borderColor: line, timeVisible: tf !== 'D', secondsVisible: false, rightOffset: 4 },
      crosshair: { mode: CrosshairMode.Normal },
    });
    const cs = c.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false });
    cs.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.24 } });
    const v = c.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    v.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    const common = { lineWidth: 1 as const, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
    const vw = c.addSeries(LineSeries, { ...common, color: cssVar('--accent'), lineWidth: 2 });
    const m20 = c.addSeries(LineSeries, { ...common, color: cssVar('--warn') });
    const m50 = c.addSeries(LineSeries, { ...common, color: cssVar('--demo') });
    chart.current = c;
    s.current = { c: cs, v, vw, m20, m50 };
    fitted.current = '';
    lines.current = [];
    return () => { c.remove(); chart.current = null; s.current = null; };
  }, [tf, theme]);

  // data (keeps your zoom/scroll; fits only when symbol/timeframe changes)
  useEffect(() => {
    const x = s.current, c = chart.current;
    if (!x || !c) return;
    const up = cssVar('--up'), down = cssVar('--down');
    x.c.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })));
    x.v.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, value: b.volume, color: (b.close >= b.open ? up : down) + '55' })));
    const fk = `${sym}:${tf}`;
    if (bars.length && fitted.current !== fk) {
      if (tf === 'D') c.timeScale().setVisibleLogicalRange({ from: bars.length - 130, to: bars.length + 3 });
      else if (tf === '5m') c.timeScale().setVisibleLogicalRange({ from: bars.length - 160, to: bars.length + 4 });
      else c.timeScale().fitContent();
      fitted.current = fk;
    }
  }, [bars, sym, tf, theme]);

  // overlays
  const closes = useMemo(() => bars.map((b) => b.close), [bars]);
  useEffect(() => {
    const x = s.current;
    if (!x) return;
    const asT = (p: { time: number; value: number }[]) => p.map((q) => ({ time: q.time as UTCTimestamp, value: q.value }));
    x.vw.setData(ov.vwap && tf !== 'D' ? asT(vwapSeries(bars)) : []);
    x.m20.setData(ov.ma ? asT(toPts(bars, sma(closes, 20))) : []);
    x.m50.setData(ov.ma ? asT(toPts(bars, sma(closes, 50))) : []);
  }, [bars, closes, ov, tf, theme]);

  // level lines
  useEffect(() => {
    const x = s.current;
    if (!x) return;
    for (const l of lines.current) x.c.removePriceLine(l);
    lines.current = [];
    if (!ov.lvl) return;
    const color: Record<string, string> = { pdh: cssVar('--up'), pdl: cssVar('--down'), pdc: cssVar('--muted'), vwap: cssVar('--accent'), orh: cssVar('--warn'), orl: cssVar('--warn'), pmh: cssVar('--demo'), pml: cssVar('--demo') };
    for (const l of levels) {
      if (l.value == null || (l.id === 'vwap' && ov.vwap && tf !== 'D')) continue;
      lines.current.push(x.c.createPriceLine({ price: l.value, color: color[l.id], lineWidth: 1, lineStyle: l.id === 'pdc' ? LineStyle.Dotted : LineStyle.Dashed, axisLabelVisible: true, title: LEVEL_SHORT[l.id] }));
    }
  }, [levels, ov, tf, theme, bars]);

  const T = (k: keyof Overlays, label: string, hint: string) => (
    <button className={`chip sm ${ov[k] ? 'on' : ''}`} onClick={() => setOv({ ...ov, [k]: !ov[k] })} title={hint} aria-pressed={ov[k]}>{label}</button>
  );

  return (
    <section className="panel chart-panel">
      <PanelHead
        title={
          <span className="chart-title">
            <b>{sym}</b>
            <span className="muted">{name}</span>
            <span className="num">{px(last)}</span>
            <span className={`num ${tone(chgPct)}`}>{pct(chgPct)}</span>
          </span>
        }
        badge={<Fresh kind={series.freshness} at={series.asOf || undefined} src={series.source || undefined} />}
        onPopout={onPopout}
      >
        {T('vwap', 'VWAP', 'Session VWAP (intraday)')}
        {T('ma', 'MA 20/50', '20 and 50-period simple moving averages')}
        {T('lvl', 'Levels', 'Draw key levels on the chart')}
        <Seg<TF> value={tf} onChange={onTf} options={[{ id: 'D', label: 'D', hint: 'Daily (1)' }, { id: '1H', label: '1H', hint: '1-hour (2)' }, { id: '5m', label: '5m', hint: '5-minute (3)' }]} />
      </PanelHead>
      <div className="chart-wrap" ref={el}>
        {!bars.length && (
          <div className="chart-empty">
            {series.loading ? 'Loading candles…' : series.error ? <><b>No candles.</b> <span className="muted">{series.error}</span></> : 'No data'}
          </div>
        )}
        {series.note && <div className="chart-note">{series.note}</div>}
      </div>
    </section>
  );
}
