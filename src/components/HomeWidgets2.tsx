// More Home widgets: risk calculator, session clock, crypto, commodities, browser.
import { useEffect, useRef, useState } from 'react';
import { CandlestickSeries, ColorType, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import type { Bar, TF } from '../types';
import { calc, expectancy, kelly, positionSize, recoverPct, rr, streakOdds } from '../../shared/risk';
import { MARKETS, sessionState } from '../../shared/sessions';
import { hms } from '../lib/clock';
import { makeCandles } from '../lib/demo';
import { pct, px, tone } from '../lib/format';
import { Seg, Star, LeanDot, Q } from './common';
import type { HomeData } from './HomeWidgets';
import { useTick } from '../lib/useTick';

type Cfg = Record<string, any>;
interface P { d: HomeData; cfg: Cfg; set: (c: Cfg) => void }
const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const money = (v: number) => (Number.isFinite(v) ? `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—');

/* ---------------- risk calculator ---------------- */
type RiskTab = 'calc' | 'size' | 'rr' | 'edge' | 'dd';
export function RiskW({ cfg, set }: P) {
  const tab: RiskTab = cfg.tab ?? 'size';
  const v = (k: string, dflt: number) => (Number.isFinite(cfg[k]) ? cfg[k] : dflt);
  const In = ({ k, label, dflt, step = 1, unit }: { k: string; label: string; dflt: number; step?: number; unit?: string }) => (
    <label className="hw-in"><span>{label}{unit ? ` (${unit})` : ''}</span><input type="number" step={step} value={v(k, dflt)} onChange={(e) => set({ ...cfg, [k]: e.target.value === '' ? undefined : +e.target.value })} /></label>
  );
  const Out = ({ label, value, cls = '' }: { label: string; value: string; cls?: string }) => <div className="rk-out"><span>{label}</span><b className={`num ${cls}`}>{value}</b></div>;
  let body;
  if (tab === 'calc') {
    const expr: string = cfg.expr ?? '';
    const res = expr ? calc(expr) : NaN;
    const press = (k: string) => set({ ...cfg, expr: k === 'C' ? '' : k === '⌫' ? expr.slice(0, -1) : k === '=' ? (Number.isFinite(res) ? String(+res.toFixed(8)) : expr) : expr + k });
    body = (
      <div className="rk-calc">
        <input className="rk-screen num" value={expr} onChange={(e) => set({ ...cfg, expr: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') press('='); }} aria-label="Expression" />
        <div className="rk-res num">{Number.isFinite(res) ? `= ${+res.toFixed(8)}` : expr ? '…' : '0'}</div>
        <div className="rk-keys">{['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '%', '0', '.', '⌫', '='].map((k) => <button key={k} className={`rk-key ${'÷×-+='.includes(k) ? 'op' : ''} ${k === '=' ? 'eq' : ''}`} onClick={() => press(k)}>{k}</button>)}</div>
      </div>
    );
  } else if (tab === 'size') {
    const r = positionSize(v('acct', 1250), v('riskPct', 1), v('entry', 50), v('stop', 48), v('bp', Infinity) || Infinity);
    body = (<>
      <div className="hw-grid"><In k="acct" label="Account" dflt={1250} unit="$" /><In k="riskPct" label="Risk per trade" dflt={1} step={0.25} unit="%" /><In k="entry" label="Entry" dflt={50} step={0.01} /><In k="stop" label="Stop" dflt={48} step={0.01} /><In k="bp" label="Buying power" dflt={0} unit="$, 0 = none" /></div>
      <div className="rk-big"><span>Buy</span><b className="num">{r.shares}</b><span>shares</span></div>
      <div className="rk-grid"><Out label="Max loss at stop" value={money(r.riskUsd)} cls="down" /><Out label="Risk per share" value={money(r.perShare)} /><Out label="Position cost" value={money(r.cost)} /><Out label="Share of account" value={`${((r.cost / v('acct', 1250)) * 100).toFixed(0)}%`} /></div>
      {r.cappedBy && <p className="small warn-txt rk-pad">Capped by buying power.</p>}
      <p className="note rk-pad">Shares = (account × risk %) ÷ |entry − stop|. Keep risk at 1–2% so a losing streak can’t sink the account.</p>
    </>);
  } else if (tab === 'rr') {
    const r = rr(v('e2', 100), v('s2', 95), v('t2', 115));
    body = (<>
      <div className="hw-grid"><In k="e2" label="Entry" dflt={100} step={0.01} /><In k="s2" label="Stop" dflt={95} step={0.01} /><In k="t2" label="Target" dflt={115} step={0.01} /></div>
      <div className="rk-big"><span>Reward : risk</span><b className={`num ${r.ratio >= 2 ? 'up' : r.ratio < 1 ? 'down' : ''}`}>{Number.isFinite(r.ratio) ? `${r.ratio.toFixed(2)} : 1` : '—'}</b></div>
      <div className="rk-grid">{r.targets.map((t, i) => <Out key={i} label={`${i + 1}R target`} value={px(t)} />)}<Out label="Win rate to break even" value={Number.isFinite(r.ratio) ? `${(100 / (1 + r.ratio)).toFixed(0)}%` : '—'} /></div>
      <p className="note rk-pad">1R = the distance from entry to stop. A 3:1 trade only needs to win 25% of the time to break even.</p>
    </>);
  } else if (tab === 'edge') {
    const e = expectancy(v('wp', 45), v('aw', 200), v('al', 100));
    const k = kelly(v('wp', 45), e.payoff);
    body = (<>
      <div className="hw-grid"><In k="wp" label="Win rate" dflt={45} unit="%" /><In k="aw" label="Avg win" dflt={200} unit="$" /><In k="al" label="Avg loss" dflt={100} unit="$" /><In k="n" label="Next trades" dflt={20} /><In k="streak" label="Losing streak" dflt={5} /></div>
      <div className="rk-big"><span>Expectancy</span><b className={`num ${tone(e.perTrade)}`}>{money(e.perTrade)}</b><span>per trade ({Number.isFinite(e.perR) ? `${e.perR.toFixed(2)}R` : '—'})</span></div>
      <div className="rk-grid"><Out label="Payoff (win ÷ loss)" value={Number.isFinite(e.payoff) ? e.payoff.toFixed(2) : '—'} /><Out label="Break-even win rate" value={`${e.breakevenWinPct.toFixed(0)}%`} /><Out label="Kelly (half)" value={Number.isFinite(k.half) ? `${Math.max(0, k.half).toFixed(1)}% of account` : '—'} cls={k.full <= 0 ? 'down' : ''} /><Out label={`Odds of ${v('streak', 5)} losses in a row within ${v('n', 20)} trades`} value={`${streakOdds(v('wp', 45), v('streak', 5), v('n', 20)).toFixed(0)}%`} /><Out label={`Expected over ${v('n', 20)} trades`} value={money(e.perTrade * v('n', 20))} cls={tone(e.perTrade)} /></div>
      <p className="note rk-pad">Positive expectancy = an edge. Half Kelly is the most anyone should risk; most traders use far less.</p>
    </>);
  } else {
    const dd = v('dd', 20);
    body = (<>
      <div className="hw-grid"><In k="dd" label="Drawdown" dflt={20} unit="%" /></div>
      <div className="rk-big"><span>Gain needed to recover</span><b className="num down">{Number.isFinite(recoverPct(dd)) ? `${recoverPct(dd).toFixed(1)}%` : '∞'}</b></div>
      <div className="rk-grid">{[10, 20, 30, 50].map((x) => <Out key={x} label={`−${x}% needs`} value={`+${recoverPct(x).toFixed(0)}%`} />)}</div>
      <p className="note rk-pad">Losses compound against you: a 50% drawdown needs a 100% gain to get back to even.</p>
    </>);
  }
  return (
    <div className="hw-col hw-scroll rk">
      <div className="hw-bar"><Seg<RiskTab> value={tab} onChange={(t) => set({ ...cfg, tab: t })} options={[{ id: 'size', label: 'Size' }, { id: 'rr', label: 'R:R' }, { id: 'edge', label: 'Edge' }, { id: 'dd', label: 'Drawdown' }, { id: 'calc', label: 'Calc' }]} /></div>
      {body}
    </div>
  );
}

/* ---------------- session clock: NY / London / Asia ---------------- */
export function SessionsW({ d }: P) {
  const now = useTick(1000);
  const nyClosed = !!d.clk.holiday;
  return (
    <div className="hw-col hw-scroll ss">
      <div className="ss-now num">{new Date(now).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false })} <span>ET</span></div>
      {MARKETS.map((m) => {
        const s = sessionState(m, now, m.id === 'ny' && nyClosed);
        return (
          <div key={m.id} className={`ss-row ${s.status}`}>
            <div className="ss-l1"><span className="ss-dot" aria-hidden="true" /><b>{m.name}</b><span className="ss-st">{s.status === 'open' ? 'OPEN' : s.status === 'lunch' ? 'LUNCH' : 'CLOSED'}</span><span className="num muted ss-loc">{s.local} local</span></div>
            <div className="ss-l2"><span className="num">{s.next} in {hms(s.inSec)}</span><span className="muted small">{m.open}–{m.close}{m.lunch ? ` · lunch ${m.lunch[0]}–${m.lunch[1]}` : ''}</span></div>
          </div>
        );
      })}
      <p className="note">Regular hours, local time. Weekends handled; holidays only for New York{nyClosed ? ` (closed today: ${d.clk.holiday})` : ''}.</p>
    </div>
  );
}

/* ---------------- crypto ---------------- */
function useCrypto(sym: string, tf: TF, d: HomeData): { bars: Bar[]; error?: string; source: string } {
  const [st, setSt] = useState<{ bars: Bar[]; error?: string; source: string }>({ bars: [], source: '' });
  useEffect(() => {
    if (d.mode.kind === 'demo') { setSt({ bars: makeCandles(sym, tf === '5m' ? '5m' : 'D', sym.startsWith('BTC') ? 98000 : sym.startsWith('ETH') ? 3400 : 150), source: 'Generated sample candles' }); return; }
    if (d.mode.kind !== 'live') return;
    let stop = false;
    const go = () => fetch(`/api/candles?symbol=${sym}&tf=${tf}`).then(async (r) => { const j = await r.json(); if (!stop) setSt(r.ok ? { bars: j.bars, source: j.source } : { bars: [], error: j.error, source: '' }); }).catch((e) => !stop && setSt({ bars: [], error: String(e), source: '' }));
    go();
    const id = setInterval(go, 60_000);
    return () => { stop = true; clearInterval(id); };
  }, [sym, tf, d.mode.kind]);
  return st;
}
function Candles({ bars, theme, timeVisible }: { bars: Bar[]; theme: string; timeVisible: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const c = useRef<IChartApi | null>(null);
  const s = useRef<ISeriesApi<'Candlestick'> | null>(null);
  useEffect(() => {
    if (!el.current) return;
    const up = cssVar('--up'), down = cssVar('--down');
    const ch = createChart(el.current, { autoSize: true, layout: { background: { type: ColorType.Solid, color: cssVar('--panel') }, textColor: cssVar('--muted'), fontSize: 10, attributionLogo: false }, grid: { vertLines: { visible: false }, horzLines: { color: cssVar('--line') } }, rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible } });
    s.current = ch.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false });
    c.current = ch;
    return () => { ch.remove(); c.current = null; };
  }, [theme, timeVisible]);
  useEffect(() => {
    if (!s.current || !c.current) return;
    s.current.setData(bars.slice(-150).map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })));
    c.current.timeScale().fitContent();
  }, [bars, theme, timeVisible]);
  return <div className="hw-chart" ref={el} />;
}
interface CNews { id: string; t: number; title: string; src: string; url: string; sentiment: number; lean?: import('../../shared/bias').Lean }
export function CryptoW({ d, cfg, set }: P) {
  const sym: string = cfg.sym ?? 'BTC-USD';
  const tf: TF = cfg.tf ?? 'D';
  const { bars, error, source } = useCrypto(sym, tf, d);
  const [news, setNews] = useState<CNews[]>([]);
  useEffect(() => {
    if (d.mode.kind !== 'live') { setNews([{ id: 'x', t: Date.now(), title: 'Sample crypto headline (demo)', src: 'Demo feed', url: '', sentiment: 0 }]); return; }
    fetch('/api/research?fn=crypto-news').then((r) => r.json()).then((j) => setNews(j.items ?? [])).catch(() => {});
  }, [d.mode.kind]);
  const last = bars.at(-1), first = tf === 'D' ? bars.at(-2) : bars.find((b) => b.time >= (last?.time ?? 0) - 86400);
  const chg = last && first ? (last.close / (tf === 'D' ? first.close : first.open) - 1) * 100 : NaN;
  const base = sym.replace('-USD', '');
  return (
    <div className="hw-stock">
      <div className="hw-qrow">
        <select className="hw-ticker" value={sym} onChange={(e) => set({ ...cfg, sym: e.target.value })} aria-label="Coin">
          {['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'BNB', 'LTC'].map((c) => <option key={c} value={`${c}-USD`}>{c}</option>)}
        </select>
        <span className="num hw-px">{last ? px(last.close) : '—'}</span><span className={`num ${tone(chg)}`}>{pct(chg)}</span>
        <span className="hw-tf"><Seg<TF> value={tf} onChange={(t) => set({ ...cfg, tf: t })} options={[{ id: '5m', label: '5m' }, { id: '1H', label: '1H' }, { id: 'D', label: 'D' }]} /></span>
      </div>
      {error ? <p className="small down hw-pad">{error}</p> : <Candles bars={bars} theme={d.theme} timeVisible={tf !== 'D'} />}
      <ul className="hw-news">{[...news.filter((n) => n.title.toUpperCase().includes(base)), ...news.filter((n) => !n.title.toUpperCase().includes(base))].slice(0, 10).map((n) => <li key={n.id}><span className={`sent ${n.sentiment > 0 ? 'up' : n.sentiment < 0 ? 'down' : 'muted'}`}>●</span>{n.url ? <a href={n.url} target="_blank" rel="noreferrer noopener">{n.title}</a> : n.title}<span className="muted small"> · {n.src}</span><LeanDot lean={n.lean} /></li>)}</ul>
      <p className="note hw-pad"><Q k={d.mode.kind === 'demo' ? 'demo' : 'live'} src={source || 'Binance'} />{source || 'Binance'} · 24/7, refreshes every minute · crypto news: Finnhub</p>
    </div>
  );
}

/* ---------------- commodities (ETF proxies with live quotes) ---------------- */
export const COMMODITIES: [string, string][] = [['USO', 'WTI crude oil'], ['BNO', 'Brent crude'], ['UNG', 'Natural gas'], ['GLD', 'Gold'], ['SLV', 'Silver'], ['CPER', 'Copper'], ['CORN', 'Corn'], ['WEAT', 'Wheat'], ['UUP', 'US dollar']];
export function CommoditiesW({ d }: P) {
  return (
    <div className="hw-col hw-scroll">
      <ul className="hw-movers">{COMMODITIES.map(([s, n]) => { const q = d.quotes[s]; return (
        <li key={s} onClick={() => d.onChart(s)} className="cm-row"><Star sym={s} /><b>{s}</b><span className="small cm-name">{n}</span><span className="num">{q ? px(q.last) : '—'}</span><span className={`num ${tone(q?.chgPct ?? NaN)}`}>{q ? pct(q.chgPct, 1) : ''}</span></li>
      ); })}</ul>
      <p className="note hw-pad"><Q k={d.mode.kind === 'demo' ? 'demo' : 'live'} src="ETF quotes (Finnhub / Twelve Data), not futures" />Exchange-traded funds that track each commodity (live quotes, free). Futures prices themselves aren’t free in real time. Click to chart.</p>
    </div>
  );
}

/* ---------------- browser ---------------- */
const QUICK: [string, string][] = [['Yahoo Finance', 'https://finance.yahoo.com'], ['TradingView', 'https://www.tradingview.com'], ['Finviz', 'https://finviz.com'], ['CNBC', 'https://www.cnbc.com'], ['Reuters', 'https://www.reuters.com/markets/'], ['SEC EDGAR', 'https://www.sec.gov/edgar/search/'], ['Fed releases', 'https://www.federalreserve.gov/newsevents.htm'], ['Econ calendar', 'https://www.investing.com/economic-calendar/'], ['YouTube', 'https://www.youtube.com'], ['X', 'https://x.com']];
function toEmbed(u: string): string {
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/.exec(u);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  return u;
}
export function BrowserW({ d, cfg, set }: P) {
  const url: string = cfg.url ?? '';
  const [draft, setDraft] = useState(url);
  const [chk, setChk] = useState<{ embeddable: boolean; reason?: string } | null>(null);
  const embed = toEmbed(url);
  useEffect(() => {
    setChk(null);
    if (!url) return;
    if (embed.includes('youtube-nocookie.com/embed')) { setChk({ embeddable: true }); return; }
    if (d.mode.kind !== 'live') { setChk({ embeddable: false, reason: 'the preview can’t check sites; works on the live desk' }); return; }
    fetch(`/api/research?fn=frame&url=${encodeURIComponent(url)}`).then((r) => r.json()).then(setChk).catch(() => setChk({ embeddable: false, reason: 'check failed' }));
  }, [url, d.mode.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    const u = /^https?:\/\//i.test(t) ? t : /^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(t) ? `https://${t}` : `https://duckduckgo.com/?q=${encodeURIComponent(t)}`;
    setDraft(u); set({ ...cfg, url: u });
  };
  return (
    <div className="hw-col br">
      <form className="hw-bar" onSubmit={(e) => { e.preventDefault(); go(draft); }}>
        <button type="button" className="hw-btn" onClick={() => { setDraft(''); set({ ...cfg, url: '' }); }} title="Home" aria-label="Browser home">⌂</button>
        <input className="br-url" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search, or type a URL / YouTube link" aria-label="Address" />
        {url && <a className="btn" href={url} target="_blank" rel="noreferrer noopener" title="Open in a new tab">↗</a>}
      </form>
      {!url ? (
        <div className="br-home">
          <div className="br-quick">{QUICK.map(([n, u]) => <button key={n} className="br-tile" onClick={() => go(u)}>{n}</button>)}</div>
          <p className="note">Many sites (Yahoo, TradingView, X, most news sites) refuse to be shown inside other sites. The desk checks first and gives you an “open in new tab” button when a site blocks it. YouTube links play right here.</p>
        </div>
      ) : chk && !chk.embeddable ? (
        <div className="br-block"><p><b>{new URL(url).hostname}</b> doesn’t allow being shown inside other sites{chk.reason ? ` (${chk.reason})` : ''}.</p><a className="btn primary" href={url} target="_blank" rel="noreferrer noopener">Open in a new tab ↗</a></div>
      ) : chk ? (
        <iframe className="br-frame" src={embed} title="Browser" sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation" allow="encrypted-media; picture-in-picture; fullscreen" referrerPolicy="no-referrer" />
      ) : <p className="small muted hw-pad">Checking…</p>}
    </div>
  );
}
