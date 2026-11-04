import { useEffect, useMemo, useRef } from 'react';
import { CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, createChart, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import type { Quote, TF } from '../types';
import { makeCandles, DEMO_AT } from '../lib/demo';
import { Fresh, PanelHead, Seg } from './common';
import { pct, px, tone } from '../lib/format';

const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export function ChartPanel({
  q,
  tf,
  onTf,
  theme,
  onPopout,
}: {
  q: Quote;
  tf: TF;
  onTf: (t: TF) => void;
  theme: string;
  onPopout?: () => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const bars = useMemo(() => makeCandles(q.sym, tf, q.last), [q.sym, tf, q.last]);

  useEffect(() => {
    if (!el.current) return;
    const up = cssVar('--up'), down = cssVar('--down'), line = cssVar('--line'), text = cssVar('--muted');
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: cssVar('--panel') }, textColor: text, fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: line }, horzLines: { color: line } },
      rightPriceScale: { borderColor: line },
      timeScale: { borderColor: line, timeVisible: tf !== 'D', secondsVisible: false, rightOffset: 4 },
      crosshair: { mode: CrosshairMode.Normal },
    });
    const candles = c.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false });
    candles.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.24 } });
    const vol = c.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    candles.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })));
    vol.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, value: b.volume, color: b.close >= b.open ? up + '55' : down + '55' })));
    if (tf === 'D') c.timeScale().setVisibleLogicalRange({ from: bars.length - 120, to: bars.length + 3 });
    else c.timeScale().fitContent();
    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
    };
  }, [bars, tf, theme]);

  return (
    <section className="panel chart-panel">
      <PanelHead
        title={
          <span className="chart-title">
            <b>{q.sym}</b>
            <span className="muted">{q.name}</span>
            <span className="num">{px(q.last)}</span>
            <span className={`num ${tone(q.chgPct)}`}>{pct(q.chgPct)}</span>
          </span>
        }
        badge={<Fresh kind="demo" at={DEMO_AT} src="Generated sample candles (Milestone 2 wires Twelve Data)" />}
        onPopout={onPopout}
      >
        <Seg<TF>
          value={tf}
          onChange={onTf}
          options={[
            { id: 'D', label: 'D', hint: 'Daily (1)' },
            { id: '1H', label: '1H', hint: '1-hour (2)' },
            { id: '5m', label: '5m', hint: '5-minute (3)' },
          ]}
        />
      </PanelHead>
      <div className="chart-wrap" ref={el} />
    </section>
  );
}
