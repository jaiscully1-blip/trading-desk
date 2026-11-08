// Economic prediction-market odds (Kalshi, CFTC-regulated, public read API). Pure parsing only.
import { outcomeLabel, px } from './calendar.js';

export interface EconTopic { id: string; title: string; why: string; series: string[]; match: RegExp; events: number }
// Known Kalshi series first; if Kalshi renames one, the title regex finds it in the Economics / Financials series list.
export const ECON_TOPICS: EconTopic[] = [
  { id: 'fed', title: 'Fed decisions', why: 'Cuts lift growth stocks and small caps; a surprise hike hits everything.', series: ['KXFEDDECISION'], match: /fed(eral)? (funds|rate|decision)|fomc/i, events: 4 },
  { id: 'cuts', title: 'Rate cuts this year', why: 'More cuts priced in = easier money for risk assets.', series: ['KXRATECUTCOUNT', 'KXRATECUTS'], match: /how many (rate )?cuts|number of (rate )?cuts/i, events: 1 },
  { id: 'recession', title: 'US recession', why: 'Recession odds rising usually means defensives over cyclicals.', series: ['KXRECSSNBER', 'KXRECESSION'], match: /recession/i, events: 1 },
  { id: 'cpi', title: 'Inflation (CPI)', why: 'Hot CPI pushes yields up and growth stocks down.', series: ['KXCPIYOY', 'KXCPI'], match: /\bCPI\b|inflation/i, events: 1 },
  { id: 'jobs', title: 'Jobs report (payrolls)', why: 'Too hot = fewer cuts; too cold = recession fear.', series: ['KXPAYROLLS'], match: /payroll|jobs report/i, events: 1 },
  { id: 'unemp', title: 'Unemployment rate', why: 'A rising rate is the classic recession signal (Sahm rule).', series: ['KXU3'], match: /unemployment/i, events: 1 },
  { id: 'gdp', title: 'GDP growth', why: 'Next quarter’s growth print.', series: ['KXGDP'], match: /\bGDP\b/i, events: 1 },
  { id: 'spx', title: 'S&P 500 at year-end', why: 'Where the crowd thinks the index finishes the year.', series: ['KXINXY'], match: /S&P ?500.*(year|end|close)/i, events: 1 },
];

export interface Outcome { label: string; p: number; ticker: string; strike: number | null; vol: number }
export interface EconEvent { event: string; title: string; closes: number; outcomes: Outcome[]; volume: number }
export interface EconCard { id: string; title: string; why: string; series: string; events: EconEvent[]; binary: boolean; history: [number, number][] | null; histLabel: string | null; url: string }

const prob = (m: any) => {
  const last = px(m.last_price_dollars ?? m.last_price);
  const bid = px(m.yes_bid_dollars ?? m.yes_bid), ask = px(m.yes_ask_dollars ?? m.yes_ask);
  const mid = Number.isFinite(bid) && Number.isFinite(ask) && ask > 0 ? (bid + ask) / 2 : NaN;
  // a stale last trade far outside the live quote is worse than the midpoint
  if (Number.isFinite(last) && last > 0 && (!Number.isFinite(mid) || (last >= bid - 0.02 && last <= ask + 0.02))) return last;
  return mid;
};

/** /events?with_nested_markets=true -> open events, soonest first, outcomes in strike order (or by odds). */
export function parseKalshiEvents(j: any): EconEvent[] {
  const evs: any[] = Array.isArray(j?.events) ? j.events : [];
  return evs.map((e) => {
    const ms: any[] = (e.markets ?? []).filter((m: any) => !m.status || /active|open|initialized/i.test(m.status));
    const outcomes: Outcome[] = ms.map((m) => ({ label: outcomeLabel(m), p: prob(m), ticker: String(m.ticker), strike: Number.isFinite(+m.floor_strike) ? +m.floor_strike : Number.isFinite(+m.cap_strike) ? +m.cap_strike : null, vol: Number(m.volume_fp ?? m.volume ?? 0) || 0 }))
      .filter((o) => Number.isFinite(o.p));
    const strikes = outcomes.every((o) => o.strike != null) && outcomes.length > 2;
    outcomes.sort((a, b) => (strikes ? a.strike! - b.strike! : b.p - a.p));
    const closes = Math.min(...ms.map((m) => Date.parse(m.close_time) || Infinity));
    return { event: String(e.event_ticker), title: String(e.title ?? ''), closes, outcomes, volume: outcomes.reduce((s, o) => s + o.vol, 0) };
  }).filter((e) => e.outcomes.length && Number.isFinite(e.closes)).sort((a, b) => a.closes - b.closes);
}

/** Candlesticks -> [unix s, prob]. */
export function parseCandles(j: any): [number, number][] {
  const list: any[] = Array.isArray(j?.candlesticks) ? j.candlesticks : [];
  return list.map((c) => {
    const close = px(c.price?.close_dollars ?? c.price?.close);
    const bid = px(c.yes_bid?.close_dollars ?? c.yes_bid?.close), ask = px(c.yes_ask?.close_dollars ?? c.yes_ask?.close);
    const p = Number.isFinite(close) && close > 0 ? close : Number.isFinite(bid) && Number.isFinite(ask) ? (bid + ask) / 2 : NaN;
    return [Number(c.end_period_ts), p] as [number, number];
  }).filter(([t, p]) => t > 0 && Number.isFinite(p));
}

/** Pick the series to use for a topic from what Kalshi lists. */
export function pickSeries(topic: EconTopic, listed: { ticker: string; title: string; volume?: number }[]): string | null {
  const have = new Set(listed.map((s) => s.ticker));
  for (const s of topic.series) if (have.has(s)) return s;
  const m = listed.filter((s) => topic.match.test(s.title)).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))[0];
  return m?.ticker ?? (listed.length ? null : topic.series[0]); // list unavailable: try the known ticker anyway
}
