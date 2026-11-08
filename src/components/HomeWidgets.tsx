// Home page widgets. Each gets its saved config (cfg) and a setter, plus the shared desk data.
import { useEffect, useMemo, useRef } from 'react';
import { CandlestickSeries, ColorType, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import type { Quote, TF } from '../types';
import type { MacroResult } from '../../shared/types';
import type { ClockState } from '../../shared/clock';
import type { NewsState, CalendarState } from '../data/news';
import type { MoversState } from '../data/scan';
import { useSeries, type DataMode } from '../data/live';
import { bs, breakeven, plAtExpiry, type OptType } from '../../shared/options';
import { useDesk } from '../lib/deskctx';
import { etTime, hms } from '../lib/clock';
import { pct, px, tone } from '../lib/format';
import type { Ping } from '../lib/pings';
import { CoName, Fresh, Seg, Star, LeanDot } from './common';
import { StarredList } from './Pings';
import { Messages } from './Messages';
import type { FeedState } from '../data/feed';
import { BrowserW, CommoditiesW, CryptoW, RiskW, SessionsW } from './HomeWidgets2';
import { BetsW, ClaimsW, SpotifyW, XW } from './Poker';

export interface HomeData {
  mode: DataMode; theme: string; quotes: Record<string, Quote>; news: NewsState; cal: CalendarState | null; movers: MoversState | null;
  clk: ClockState; macro: MacroResult | null; pingLog: Ping[]; sel: string; pingAt: number; setPingAt: (n: number) => void;
  onChart: (s: string) => void; demoLast: (s: string) => number; feed: FeedState | null; now: number;
  /** closed journal trades (R multiples) and account numbers for the simulator */
  trades: { r: number | null; realized: number }[]; riskPct: number; equity: number | null;
  playbooks: import('../lib/playbook').Playbook[];
  /** journal guardrails for the Rules widget */
  rules?: import('./RulesW').RulesData;
}
type Cfg = Record<string, any>;
interface P { d: HomeData; cfg: Cfg; set: (c: Cfg) => void }
import { CongressW, DiscordW, WebullW } from './PrivateWidgets';
import { AgentsW, InsiderW, PolymarketW, SimW } from './MoreWidgets';
import { BacktestW } from './BacktestW';
import { RulesW as RulesInner } from './RulesW';
function RulesW({ d, cfg, set }: P) { return <RulesInner r={d.rules} now={d.now} cfg={cfg} set={set} />; }
const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* ---------------- stock: quote + mini chart + its news ---------------- */
function MiniChart({ sym, tf, d }: { sym: string; tf: TF; d: HomeData }) {
  const el = useRef<HTMLDivElement>(null);
  const c = useRef<IChartApi | null>(null);
  const s = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const series = useSeries(sym, tf, d.mode, d.demoLast(sym));
  useEffect(() => {
    if (!el.current) return;
    const up = cssVar('--up'), down = cssVar('--down'), line = cssVar('--line');
    const ch = createChart(el.current, { autoSize: true, layout: { background: { type: ColorType.Solid, color: cssVar('--panel') }, textColor: cssVar('--muted'), fontSize: 10, attributionLogo: false }, grid: { vertLines: { visible: false }, horzLines: { color: line } }, rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible: tf !== 'D' }, handleScroll: false, handleScale: false });
    s.current = ch.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false });
    c.current = ch;
    return () => { ch.remove(); c.current = null; };
  }, [d.theme, tf]);
  useEffect(() => {
    if (!s.current || !c.current) return;
    const bars = series.bars.slice(tf === 'D' ? -90 : -78);
    s.current.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })));
    c.current.timeScale().fitContent();
  }, [series.bars, tf, d.theme]);
  return <div className="hw-chart" ref={el}>{!series.bars.length && <span className="muted small hw-pad">{series.loading ? 'Loading…' : series.error ?? 'No data'}</span>}</div>;
}

export function StockW({ d, cfg, set }: P) {
  const sym: string = cfg.sym ?? 'SPY';
  const q = d.quotes[sym];
  const items = d.news.items.filter((n) => n.syms.includes(sym)).slice(0, 8);
  const { openArticle } = useDesk();
  return (
    <div className="hw-stock">
      <div className="hw-qrow">
        <Star sym={sym} /><button className="hw-sym" onClick={() => d.onChart(sym)} title="Open on the desk">{sym}</button><CoName sym={sym} />
        <span className="num hw-px">{q ? px(q.last) : '—'}</span><span className={`num ${tone(q?.chgPct ?? NaN)}`}>{q ? pct(q.chgPct) : ''}</span>
        <span className="hw-tf"><Seg<TF> value={cfg.tf ?? 'D'} onChange={(tf) => set({ ...cfg, tf })} options={[{ id: '5m', label: '5m' }, { id: 'D', label: 'D' }]} /></span>
      </div>
      <MiniChart sym={sym} tf={cfg.tf ?? 'D'} d={d} />
      <ul className="hw-news">{items.length ? items.map((n) => <li key={n.id}><span className={`sent ${n.sentiment > 0 ? 'up' : n.sentiment < 0 ? 'down' : 'muted'}`}>●</span><span className="muted num">{etTime(n.t)}</span> <button className="link hw-headline" onClick={() => openArticle({ title: n.title, url: n.url, src: n.src, t: n.t, summary: n.summary, syms: n.syms, sentiment: n.sentiment })}>{n.title}</button></li>) : <li className="muted small">No recent headlines for {sym}.</li>}</ul>
    </div>
  );
}

/* ---------------- live news ---------------- */
export function NewsW({ d, cfg, set }: P) {
  const { stars, openArticle } = useDesk();
  const f: string = cfg.filter ?? 'all';
  const items = d.news.items.filter((n) => f === 'all' || (f === 'macro' && n.macro) || (f === 'starred' && n.syms.some((s) => stars.includes(s)))).slice(0, 60);
  return (
    <div className="hw-col">
      <div className="hw-bar"><Seg value={f} onChange={(filter) => set({ ...cfg, filter })} options={[{ id: 'all', label: 'All' }, { id: 'macro', label: 'Macro' }, { id: 'starred', label: '★ Starred' }]} /><Fresh kind={d.news.freshness} at={d.news.asOf} /></div>
      <ul className="hw-news grow">{items.map((n) => (
        <li key={n.id}><span className={`sent ${n.sentiment > 0 ? 'up' : n.sentiment < 0 ? 'down' : 'muted'}`}>●</span><span className="muted num">{etTime(n.t)}</span> <button className="link hw-headline" onClick={() => openArticle({ title: n.title, url: n.url, src: n.src, t: n.t, summary: n.summary, syms: n.syms, sentiment: n.sentiment })}>{n.title}</button>
          <span className="muted small"> · {n.src}</span><LeanDot lean={n.lean} />{n.syms.slice(0, 3).map((s) => <button key={s} className="sym-chip" onClick={() => d.onChart(s)}>{s}</button>)}</li>
      ))}{!items.length && <li className="muted small">Nothing yet.</li>}</ul>
    </div>
  );
}

/* ---------------- options calculator ---------------- */
export function OptionsW({ d, cfg, set }: P) {
  const sym: string = cfg.sym ?? 'SPY';
  const live = d.quotes[sym]?.last;
  const S = Number.isFinite(cfg.S) && cfg.S > 0 ? cfg.S : Number.isFinite(live) ? live : 100;
  const type: OptType = cfg.type ?? 'call';
  const K: number = cfg.K ?? Math.round(S);
  const days: number = cfg.days ?? 7;
  const iv: number = cfg.iv ?? 35;
  const r: number = cfg.r ?? +(d.macro?.tnx?.value ?? 4.2).toFixed(2);
  const prem: number | undefined = cfg.prem;
  const n: number = cfg.n ?? 1;
  const o = bs({ type, S, K, days, iv: iv / 100, r: r / 100 });
  const paid = prem ?? o.price;
  const be = breakeven(type, K, paid);
  const num = (k: string, label: string, v: number, step = 1, extra?: string) => (
    <label className="hw-in"><span>{label}</span><input type="number" step={step} value={Number.isFinite(v) ? +v.toFixed(step < 1 ? 2 : 0) : ''} onChange={(e) => set({ ...cfg, [k]: e.target.value === '' ? undefined : +e.target.value })} />{extra && <em>{extra}</em>}</label>
  );
  // P/L at expiry chart over ±20%
  const lo = S * 0.8, hi = S * 1.2, Wd = 280, Hd = 90;
  const pts = Array.from({ length: 41 }, (_, i) => { const s = lo + ((hi - lo) * i) / 40; return [s, plAtExpiry(type, K, paid, s) * n] as const; });
  const maxAbs = Math.max(1, ...pts.map((p) => Math.abs(p[1])));
  const X = (s: number) => ((s - lo) / (hi - lo)) * Wd, Y = (v: number) => Hd / 2 - (v / maxAbs) * (Hd / 2 - 4);
  return (
    <div className="hw-col hw-opt">
      <div className="hw-bar">
        <input className="hw-ticker" value={sym} onChange={(e) => set({ ...cfg, sym: e.target.value.toUpperCase(), S: undefined, K: undefined })} aria-label="Ticker" />
        <Seg<OptType> value={type} onChange={(t) => set({ ...cfg, type: t })} options={[{ id: 'call', label: 'Call' }, { id: 'put', label: 'Put' }]} />
        <span className="muted small">{Number.isFinite(live) ? `last ${px(live)}` : ''}</span>
      </div>
      <div className="hw-grid">
        {num('S', 'Stock $', S, 0.01, cfg.S ? 'manual' : 'live')}{num('K', 'Strike', K, 0.5)}{num('days', 'Days left', days, 1)}
        {num('iv', 'IV %', iv, 1)}{num('r', 'Rate %', r, 0.05)}{num('prem', 'Paid $', paid, 0.01, prem == null ? 'model' : '')}{num('n', 'Contracts', n, 1)}
      </div>
      <div className="hw-out">
        <div><span>Model price</span><b className="num">{o.price.toFixed(2)}</b></div>
        <div><span>Delta</span><b className="num">{o.delta.toFixed(2)}</b></div>
        <div><span>Gamma</span><b className="num">{o.gamma.toFixed(3)}</b></div>
        <div><span>Theta/day</span><b className="num down">{(o.thetaDay * 100 * n).toFixed(2)}</b></div>
        <div><span>Vega/1%</span><b className="num">{(o.vega * 100 * n).toFixed(2)}</b></div>
        <div><span>Breakeven</span><b className="num">{be.toFixed(2)}</b></div>
        <div><span>Cost</span><b className="num">${(paid * 100 * n).toFixed(0)}</b></div>
        <div><span>Ends ITM</span><b className="num">{(o.itmProb * 100).toFixed(0)}%</b></div>
      </div>
      <svg viewBox={`0 0 ${Wd} ${Hd}`} className="hw-pl" role="img" aria-label="Profit and loss at expiry">
        <line x1={0} x2={Wd} y1={Hd / 2} y2={Hd / 2} className="hw-axis" />
        <line x1={X(S)} x2={X(S)} y1={0} y2={Hd} className="hw-now" />
        <polyline points={pts.map(([s, v]) => `${X(s)},${Y(v)}`).join(' ')} className="hw-plline" />
        <text x={4} y={11} className="hw-pltx">+${Math.round(Math.max(...pts.map((p) => p[1])))}</text>
        <text x={4} y={Hd - 3} className="hw-pltx">{Math.round(Math.min(...pts.map((p) => p[1])))}</text>
        <text x={Wd - 4} y={Hd - 3} className="hw-pltx" textAnchor="end">P/L at expiry, ±20%</text>
      </svg>
      <p className="note">Black-Scholes, European style, no dividends. Theta and vega are dollars for your contracts. Enter IV from your broker’s option chain (free data has no live IV). Not a quote.</p>
    </div>
  );
}

/* ---------------- clocks ---------------- */
const CITIES: [string, string][] = [['London', 'Europe/London'], ['Tokyo', 'Asia/Tokyo'], ['Hong Kong', 'Asia/Hong_Kong']];
export function ClockW({ d }: P) {
  const c = d.clk;
  const t = (tz: string) => new Date(c.now).toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  return (
    <div className="hw-clock">
      <div className="hw-big num">{etTime(c.now, true)}<span> ET</span></div>
      <div className="hw-sess">{c.holiday ? `Closed: ${c.holiday}` : c.session}{c.earlyClose ? ` · early close` : ''}</div>
      <div className="hw-count num">{c.toClose != null ? `Close in ${hms(c.toClose)}` : `Open in ${hms(c.toOpen ?? 0)}`}</div>
      <div className="hw-next small muted">Next: {c.nextLabel} in {hms(c.toNext)}</div>
      <div className="hw-cities">{CITIES.map(([n, tz]) => <span key={n}><b className="num">{t(tz)}</b> {n}</span>)}<span><b className="num">{new Date(c.now).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</b> You</span></div>
    </div>
  );
}

/* ---------------- notes ---------------- */
export function NotesW({ cfg, set }: P) {
  return <textarea className="hw-notes" value={cfg.text ?? ''} placeholder="Notes for today: plan, levels, reminders…" onChange={(e) => set({ ...cfg, text: e.target.value })} aria-label="Notes" />;
}

/* ---------------- starred ---------------- */
export function StarredW({ d }: P) {
  return <div className="hw-scroll"><StarredList quotes={d.quotes} log={d.pingLog} sel={d.sel} onSelect={d.onChart} threshold={d.pingAt} setThreshold={d.setPingAt} /></div>;
}

/* ---------------- movers ---------------- */
export function MoversW({ d, cfg, set }: P) {
  const list: 'gainers' | 'losers' | 'active' = cfg.list ?? 'gainers';
  const ms = (d.movers?.movers ?? []).filter((m) => m.list === list).slice(0, 15);
  return (
    <div className="hw-col">
      <div className="hw-bar"><Seg value={list} onChange={(l) => set({ ...cfg, list: l })} options={[{ id: 'gainers', label: 'Gainers' }, { id: 'losers', label: 'Losers' }, { id: 'active', label: 'Active' }]} /></div>
      <ul className="hw-movers grow">{ms.map((m) => <li key={m.sym} onClick={() => d.onChart(m.sym)}><Star sym={m.sym} /><b>{m.sym}</b><CoName sym={m.sym} /><span className="num">{px(m.price)}</span><span className={`num ${tone(m.chgPct)}`}>{pct(m.chgPct, 1)}</span></li>)}</ul>
      {!ms.length && <p className="small muted hw-pad">{d.mode.kind === 'live' ? (d.movers?.error ?? 'Loading market movers (Alpha Vantage, end-of-day-ish, 25 calls/day free)…') : 'Market movers need live data (Alpha Vantage).'}</p>}
      {d.movers?.lastUpdated && <p className="note">Alpha Vantage, updated {d.movers.lastUpdated}. Price ≥ $2, volume ≥ 500k.</p>}
    </div>
  );
}

/* ---------------- calendar ---------------- */
export function CalendarW({ d }: P) {
  const today = `${d.clk.et.y}-${String(d.clk.et.mo).padStart(2, '0')}-${String(d.clk.et.d).padStart(2, '0')}`;
  const econ = (d.cal?.econ ?? []).filter((e) => e.date >= today).slice(0, 6);
  const earn = useMemo(() => { const m = d.cal?.earnings; const all = [...(m?.mine ?? []), ...(m?.week ?? [])]; const seen = new Set<string>(); return all.filter((e) => e.date >= today && !seen.has(e.sym) && seen.add(e.sym)).slice(0, 10); }, [d.cal, today]);
  return (
    <div className="hw-col hw-scroll">
      <h5>Economy</h5>
      <ul className="hw-cal">{econ.map((e) => <li key={e.key + e.date}><span className="num muted">{e.date.slice(5)} {e.time}</span> <span className={`imp i${e.impact}`}>{'!'.repeat(e.impact)}</span> {e.label}</li>)}{!econ.length && <li className="muted small">No events loaded.</li>}</ul>
      <h5>Earnings</h5>
      <ul className="hw-cal">{earn.map((e) => <li key={e.sym + e.date}><span className="num muted">{e.date.slice(5)} {e.when}</span> <button className="sym-chip" onClick={() => d.onChart(e.sym)}>{e.sym}</button> <span className="small">{e.name}</span>{e.estimate != null && <span className="muted small"> · est {e.estimate}</span>}</li>)}{!earn.length && <li className="muted small">No earnings loaded.</li>}</ul>
      {d.cal && <Fresh kind={d.cal.freshness} at={d.cal.asOf} />}
    </div>
  );
}

export function MessagesW({ d }: P) {
  return <Messages feed={d.feed} cal={d.cal} nowMs={d.now} onChart={d.onChart} compact />;
}

export const WIDGETS = {
  stock: { title: 'Stock', make: StockW },
  messages: { title: 'Messages', make: MessagesW },
  crypto: { title: 'Crypto', make: CryptoW },
  commodities: { title: 'Commodities', make: CommoditiesW },
  risk: { title: 'Risk calculator', make: RiskW },
  sessions: { title: 'Market sessions', make: SessionsW },
  browser: { title: 'Browser', make: BrowserW },
  bets: { title: 'Bet board', make: BetsW },
  claims: { title: 'Bull / bear claims', make: ClaimsW },
  spotify: { title: 'Spotify', make: SpotifyW },
  x: { title: 'X', make: XW },
  news: { title: 'Live news', make: NewsW },
  options: { title: 'Options calculator', make: OptionsW },
  clock: { title: 'Clock', make: ClockW },
  notes: { title: 'Notes', make: NotesW },
  starred: { title: '★ Starred', make: StarredW },
  movers: { title: 'Movers', make: MoversW },
  calendar: { title: 'Calendar', make: CalendarW },
  webull: { title: 'Webull account', make: WebullW },
  discord: { title: 'Discord bot', make: DiscordW },
  congress: { title: 'Congress trades', make: CongressW },
  insider: { title: 'Insider trades', make: InsiderW },
  polymarket: { title: 'Polymarket odds', make: PolymarketW },
  sim: { title: 'Odds simulator', make: SimW },
  agents: { title: 'AI analysts', make: AgentsW },
  backtest: { title: 'Playbook backtest', make: BacktestW },
  rules: { title: 'My rules', make: RulesW },
} as const;
