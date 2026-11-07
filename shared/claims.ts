// Bullish / bearish claims, each tied to a number or a quoted headline. Nothing here is generated text: every claim is a
// rule applied to data, and carries its evidence and source so it can be checked.
import type { Bar } from './types.js';
import { analyze } from './patterns.js';
import { sentimentWords } from './news.js';

export type Side = 'bull' | 'bear';
export type Cat = 'fundamental' | 'technical' | 'news';
export interface Claim { cat: Cat; side: Side; text: string; evidence: string; source: string; url?: string; t?: number; summary?: string }
export type Lean = 'bullish' | 'bearish' | 'mixed' | 'no data';

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const smaAt = (bars: Bar[], n: number) => (bars.length >= n ? avg(bars.slice(-n).map((b) => b.close)) : NaN);
const f2 = (v: number) => v.toFixed(2);

function rsi14(bars: Bar[]): number {
  if (bars.length < 15) return NaN;
  let g = 0, l = 0;
  for (let i = bars.length - 14; i < bars.length; i++) { const d = bars[i].close - bars[i - 1].close; if (d > 0) g += d; else l -= d; }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}

export function technicalClaims(bars: Bar[], src = 'Daily price data'): Claim[] {
  const out: Claim[] = [];
  if (bars.length < 30) return out;
  const last = bars.at(-1)!.close;
  const add = (side: Side, text: string, evidence: string) => out.push({ cat: 'technical', side, text, evidence, source: src });
  for (const n of [20, 50, 200]) {
    const m = smaAt(bars, n);
    if (Number.isFinite(m)) add(last >= m ? 'bull' : 'bear', `Price is ${last >= m ? 'above' : 'below'} its ${n}-day average`, `close ${f2(last)} vs ${n}-day average ${f2(m)}`);
  }
  const ch20 = (last / bars[bars.length - 21].close - 1) * 100;
  if (Math.abs(ch20) >= 5) add(ch20 > 0 ? 'bull' : 'bear', `${ch20 > 0 ? 'Up' : 'Down'} ${Math.abs(ch20).toFixed(1)}% over 20 days`, `close 20 days ago ${f2(bars[bars.length - 21].close)}`);
  const r = rsi14(bars);
  if (r >= 70) add('bear', `Overbought (RSI ${r.toFixed(0)})`, 'RSI(14) at or above 70 often precedes pullbacks');
  if (r <= 30) add('bull', `Oversold (RSI ${r.toFixed(0)})`, 'RSI(14) at or below 30 often precedes bounces');
  const look = bars.slice(-252), hi = Math.max(...look.map((b) => b.high)), lo = Math.min(...look.map((b) => b.low));
  if (last >= hi * 0.97) add('bull', 'Within 3% of its 52-week high', `high ${f2(hi)}`);
  if (last <= lo * 1.03) add('bear', 'Within 3% of its 52-week low', `low ${f2(lo)}`);
  if (bars.length >= 25) {
    const v5 = avg(bars.slice(-5).map((b) => b.volume)), v20 = avg(bars.slice(-25, -5).map((b) => b.volume));
    const up5 = last >= bars[bars.length - 6].close;
    if (v20 > 0 && v5 / v20 >= 1.4) add(up5 ? 'bull' : 'bear', `Heavy volume on a ${up5 ? 'rise' : 'drop'}`, `5-day volume ${(v5 / v20).toFixed(1)}× the prior 20 days`);
  }
  const rep = analyze(bars, '');
  for (const h of rep.charts) if (h.bias !== 'neutral' && h.status !== 'failed') add(h.bias, `${h.name} (${h.status})`, h.trigger != null ? `trigger ${f2(h.trigger)}${h.target != null ? `, measured target ${f2(h.target)}` : ''}` : 'pattern rules');
  const c = rep.candles[0];
  if (c && c.bias !== 'neutral' && c.index >= bars.length - 3) add(c.bias, `${c.name} candle (latest bars)`, 'candlestick rule');
  return out;
}

/** Finnhub /stock/metric?metric=all (free) + /stock/recommendation (free). Thresholds are plain and stated in the text. */
export function fundamentalClaims(m: Record<string, number | null | undefined>, recs: { period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number }[], src = 'Finnhub fundamentals'): Claim[] {
  const out: Claim[] = [];
  const add = (side: Side, text: string, evidence: string, source = src) => out.push({ cat: 'fundamental', side, text, evidence, source });
  const v = (k: string) => (typeof m[k] === 'number' && Number.isFinite(m[k] as number) ? (m[k] as number) : null);
  const rg = v('revenueGrowthTTMYoy');
  if (rg != null && Math.abs(rg) >= 5) add(rg > 0 ? 'bull' : 'bear', `Revenue ${rg > 0 ? 'growing' : 'shrinking'} ${Math.abs(rg).toFixed(0)}% year over year`, 'trailing 12 months vs a year earlier');
  const eg = v('epsGrowthTTMYoy');
  if (eg != null && Math.abs(eg) >= 10) add(eg > 0 ? 'bull' : 'bear', `Earnings per share ${eg > 0 ? 'up' : 'down'} ${Math.abs(eg).toFixed(0)}% year over year`, 'trailing 12 months');
  const nm = v('netProfitMarginTTM');
  if (nm != null) { if (nm >= 15) add('bull', `High profit margin (${nm.toFixed(0)}%)`, 'net margin ≥ 15%'); else if (nm < 0) add('bear', `Losing money (net margin ${nm.toFixed(0)}%)`, 'net margin below 0'); }
  const de = v('totalDebt/totalEquityQuarterly');
  if (de != null) { if (de >= 2) add('bear', `Heavy debt (debt/equity ${de.toFixed(1)})`, 'debt/equity ≥ 2'); else if (de <= 0.5) add('bull', `Light debt (debt/equity ${de.toFixed(2)})`, 'debt/equity ≤ 0.5'); }
  const cr = v('currentRatioQuarterly');
  if (cr != null && cr < 1) add('bear', `Current ratio below 1 (${cr.toFixed(2)})`, 'short-term liabilities exceed short-term assets');
  const pe = v('peTTM') ?? v('peBasicExclExtraTTM');
  if (pe != null && pe > 0) { if (pe >= 60) add('bear', `Expensive: P/E ${pe.toFixed(0)}`, 'P/E ≥ 60 leaves little room for misses'); else if (pe <= 12) add('bull', `Cheap: P/E ${pe.toFixed(0)}`, 'P/E ≤ 12'); }
  const r = recs[0];
  if (r) {
    const tot = r.strongBuy + r.buy + r.hold + r.sell + r.strongSell;
    if (tot >= 3) {
      const buys = (r.strongBuy + r.buy) / tot, sells = (r.sell + r.strongSell) / tot;
      if (buys >= 0.6) add('bull', `${Math.round(buys * 100)}% of ${tot} analysts rate it Buy`, `${r.strongBuy} strong buy, ${r.buy} buy, ${r.hold} hold, ${r.sell + r.strongSell} sell (${r.period})`, 'Finnhub analyst recommendations');
      else if (sells >= 0.3) add('bear', `${Math.round(sells * 100)}% of ${tot} analysts rate it Sell`, `${r.sell} sell, ${r.strongSell} strong sell (${r.period})`, 'Finnhub analyst recommendations');
      const p = recs[1];
      if (p) { const pt = p.strongBuy + p.buy + p.hold + p.sell + p.strongSell; const pb = pt ? (p.strongBuy + p.buy) / pt : NaN; if (Number.isFinite(pb) && Math.abs(buys - pb) >= 0.1) add(buys > pb ? 'bull' : 'bear', `Analysts turned more ${buys > pb ? 'bullish' : 'bearish'} this month`, `Buy share ${Math.round(pb * 100)}% → ${Math.round(buys * 100)}%`, 'Finnhub analyst recommendations'); }
    }
  }
  return out;
}

export interface Headline { title: string; src: string; url?: string; t: number; summary?: string }
/** A headline counts only if its own words say so (matched words are the evidence). */
export function newsClaims(items: Headline[]): Claim[] {
  const out: Claim[] = [];
  for (const h of items) {
    const w = sentimentWords(h.title);
    if (w.bull.length === w.bear.length) continue;
    const side: Side = w.bull.length > w.bear.length ? 'bull' : 'bear';
    out.push({ cat: 'news', side, text: h.title, evidence: `words: ${(side === 'bull' ? w.bull : w.bear).join(', ')}`, source: h.src, url: h.url, t: h.t, summary: h.summary });
  }
  return out;
}

export function lean(cs: Claim[]): Lean {
  if (!cs.length) return 'no data';
  const b = cs.filter((c) => c.side === 'bull').length, s = cs.length - b;
  return b >= s * 1.5 && b > s ? 'bullish' : s >= b * 1.5 && s > b ? 'bearish' : 'mixed';
}
/** Overall: each category with data votes once (bullish +1, bearish −1). */
export function consensus(cs: Claim[]): { overall: Lean; by: Record<Cat, Lean>; score: number } {
  const by = { fundamental: lean(cs.filter((c) => c.cat === 'fundamental')), technical: lean(cs.filter((c) => c.cat === 'technical')), news: lean(cs.filter((c) => c.cat === 'news')) };
  const vals = Object.values(by).filter((x) => x !== 'no data');
  const score = vals.reduce((a, x) => a + (x === 'bullish' ? 1 : x === 'bearish' ? -1 : 0), 0);
  return { by, score, overall: !vals.length ? 'no data' : score >= 2 || (score === 1 && vals.length === 1) ? 'bullish' : score <= -2 || (score === -1 && vals.length === 1) ? 'bearish' : 'mixed' };
}
