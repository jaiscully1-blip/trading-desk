// Journal -> Crypto: BTC and ETH candles that refresh on their own (Binance public market data through /api/candles, 24/7, keyless).
// Market data only: nothing here can trade.
import { useEffect, useRef, useState } from 'react';
import { CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { usePersisted } from '../lib/store';
import { Fresh, Seg } from './common';

type TF = '15m' | '1H' | 'D' | 'W';
interface Bar { time: number; open: number; high: number; low: number; close: number; volume?: number }
const SYMS = ['BTC-USD', 'ETH-USD'] as const;
const REFRESH_MS = 30_000;
const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const money = (n: number) => `$${n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : n.toFixed(2)}`;

function CryptoChart({ sym, tf }: { sym: string; tf: TF }) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const cs = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const vs = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [bars, setBars] = useState<Bar[]>([]);
  const [err, setErr] = useState('');
  const [at, setAt] = useState<number | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const up = cssVar('--up'), down = cssVar('--down'), line = cssVar('--line');
    const c = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: cssVar('--chart-bg') || cssVar('--panel') }, textColor: cssVar('--muted'), fontSize: 11 },
      grid: { vertLines: { color: line }, horzLines: { color: line } },
      rightPriceScale: { borderColor: line },
      timeScale: { borderColor: line, timeVisible: tf !== 'D' && tf !== 'W', secondsVisible: false, rightOffset: 4 },
      crosshair: { mode: CrosshairMode.Normal },
    });
    const s = c.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false });
    s.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.24 } });
    const v = c.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false, color: line });
    c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chart.current = c; cs.current = s; vs.current = v;
    return () => { c.remove(); chart.current = null; cs.current = null; vs.current = null; };
  }, [sym, tf]);

  // load now, then every 30 seconds while the tab is visible
  useEffect(() => {
    let stop = false;
    const load = () => {
      if (document.hidden) return;
      fetch(`/api/candles?symbol=${encodeURIComponent(sym)}&tf=${tf}`).then(async (r) => {
        const j = await r.json();
        if (stop) return;
        if (!r.ok) { setErr(j.error ?? `HTTP ${r.status}`); return; }
        setErr(''); setBars(j.bars ?? []); setAt(Date.now());
      }).catch((e) => { if (!stop) setErr(String(e?.message ?? e)); });
    };
    setBars([]); setErr(''); load();
    const id = setInterval(load, REFRESH_MS);
    const vis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', vis);
    return () => { stop = true; clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, [sym, tf]);

  const fitted = useRef('');
  useEffect(() => {
    if (!cs.current || !vs.current || !bars.length) return;
    cs.current.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })));
    vs.current.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, value: b.volume ?? 0, color: b.close >= b.open ? `${cssVar('--up')}55` : `${cssVar('--down')}55` })));
    if (fitted.current !== `${sym}${tf}`) { chart.current?.timeScale().fitContent(); fitted.current = `${sym}${tf}`; }
  }, [bars, sym, tf]);

  const last = bars[bars.length - 1], first = bars[0];
  const chg = last && first ? (last.close / first.open - 1) * 100 : null;
  const hi = bars.length ? Math.max(...bars.map((b) => b.high)) : null, lo = bars.length ? Math.min(...bars.map((b) => b.low)) : null;
  return (
    <section className="cr-card">
      <div className="cr-head">
        <b>{sym.replace('-USD', '')}</b>
        <span className="cr-px num">{last ? money(last.close) : '…'}</span>
        {chg != null && <span className={`num ${chg >= 0 ? 'up' : 'down'}`} title="Change over the candles shown">{chg >= 0 ? '+' : ''}{chg.toFixed(2)}%</span>}
        {hi != null && lo != null && <span className="small muted">range {money(lo)} – {money(hi)}</span>}
        <span className="es-sp" />
        {at != null && !err && <Fresh kind="live" at={at} src="Binance public market data" />}
      </div>
      {err && <p className="small down">{err}. Retrying every 30 seconds.</p>}
      <div ref={box} className="cr-chart" />
    </section>
  );
}

export default function CryptoCharts() {
  const [tf, setTf] = usePersisted<TF>('cryptoTf', '1H');
  const [pick, setPick] = usePersisted<'both' | 'BTC-USD' | 'ETH-USD'>('cryptoPick', 'both');
  return (
    <div className="cr">
      <div className="cr-bar">
        <Seg value={pick} onChange={setPick} options={[{ id: 'both', label: 'BTC + ETH' }, { id: 'BTC-USD', label: 'BTC' }, { id: 'ETH-USD', label: 'ETH' }]} />
        <Seg value={tf} onChange={setTf} options={[{ id: '15m', label: '15m' }, { id: '1H', label: '1H' }, { id: 'D', label: 'Daily' }, { id: 'W', label: 'Weekly' }]} />
        <span className="small muted">Updates every 30 seconds. Crypto trades 24/7, so these keep moving after the stock market closes.</span>
      </div>
      <div className={`cr-grid ${pick === 'both' ? 'two' : ''}`}>
        {SYMS.filter((s) => pick === 'both' || s === pick).map((s) => <CryptoChart key={s} sym={s} tf={tf} />)}
      </div>
    </div>
  );
}
