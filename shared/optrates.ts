// Most active options across the big option names (Cboe delayed chains), the Treasury yield curve and rates (FRED),
// and crypto perpetual funding (Hyperliquid public API). Pure functions (tested).
import type { Chain } from './gamma.js';

/** The names whose chains are read for "most active options" (the busiest US option underlyings). */
export const ACTIVE_UNDERLYINGS = ['SPY', 'QQQ', 'NVDA', 'TSLA', 'IWM', 'AAPL', 'AMD', 'AMZN', 'META', 'PLTR', 'MSFT', 'GOOGL'];

export interface ActiveOpt { sym: string; exp: string; dte: number; K: number; cp: 'C' | 'P'; vol: number; oi: number; price: number; premium: number; iv: number; otmPct: number }
/** Every contract from the chains given, ranked by volume. */
export function mostActive(chains: Chain[], max = 40): ActiveOpt[] {
  const out: ActiveOpt[] = [];
  for (const ch of chains) for (const c of ch.contracts) {
    if (c.vol < 100) continue;
    const price = c.last && c.last > 0 ? c.last : c.bid && c.ask ? (c.bid + c.ask) / 2 : 0;
    out.push({ sym: ch.sym, exp: c.exp, dte: c.dte, K: c.K, cp: c.cp, vol: c.vol, oi: c.oi, price, premium: c.vol * price * 100, iv: c.iv, otmPct: c.cp === 'C' ? (c.K / ch.spot - 1) * 100 : (1 - c.K / ch.spot) * 100 });
  }
  return out.sort((a, b) => b.vol - a.vol).slice(0, max);
}
/** Per underlying: total option volume, put/call volume ratio and how much trades in contracts expiring within 2 days. */
export function chainActivity(ch: Chain) {
  let call = 0, put = 0, short = 0;
  for (const c of ch.contracts) { if (c.cp === 'C') call += c.vol; else put += c.vol; if (c.dte <= 2) short += c.vol; }
  const tot = call + put;
  return { sym: ch.sym, spot: ch.spot, volume: tot, pcRatio: call ? put / call : null, zeroDteShare: tot ? short / tot : null };
}

/* ---------------- Treasury yield curve (FRED) ---------------- */
export const CURVE: { id: string; label: string; years: number }[] = [
  { id: 'DGS1MO', label: '1M', years: 1 / 12 }, { id: 'DGS3MO', label: '3M', years: 0.25 }, { id: 'DGS6MO', label: '6M', years: 0.5 }, { id: 'DGS1', label: '1Y', years: 1 },
  { id: 'DGS2', label: '2Y', years: 2 }, { id: 'DGS3', label: '3Y', years: 3 }, { id: 'DGS5', label: '5Y', years: 5 }, { id: 'DGS7', label: '7Y', years: 7 },
  { id: 'DGS10', label: '10Y', years: 10 }, { id: 'DGS20', label: '20Y', years: 20 }, { id: 'DGS30', label: '30Y', years: 30 },
];
export const RATES: { id: string; label: string }[] = [
  { id: 'DFF', label: 'Fed funds (effective)' }, { id: 'SOFR', label: 'SOFR' }, { id: 'MORTGAGE30US', label: '30-year mortgage' }, { id: 'T10YIE', label: '10-year breakeven inflation' }, { id: 'DFII10', label: '10-year real yield (TIPS)' },
];
type Obs = { date: string; value: number }[];
/** Latest value and the value about `days` earlier (the last observation on or before that date). */
export function at(obs: Obs, daysAgo: number, from?: string): { date: string; value: number } | null {
  const s = [...obs].sort((a, b) => a.date.localeCompare(b.date));
  if (!s.length) return null;
  if (!daysAgo) return s[s.length - 1];
  const end = Date.parse(`${from ?? s[s.length - 1].date}T12:00:00Z`) - daysAgo * 86400_000;
  return [...s].reverse().find((o) => Date.parse(`${o.date}T12:00:00Z`) <= end) ?? null;
}
export interface CurvePoint { id: string; label: string; years: number; now: number | null; m1: number | null; y1: number | null }
export function yieldCurve(series: Record<string, Obs>): { points: CurvePoint[]; asOf: string | null; spreads: { label: string; now: number | null; y1: number | null }[] } {
  const points = CURVE.map((c) => { const o = series[c.id] ?? []; return { ...c, now: at(o, 0)?.value ?? null, m1: at(o, 30)?.value ?? null, y1: at(o, 365)?.value ?? null }; });
  const asOf = CURVE.map((c) => at(series[c.id] ?? [], 0)?.date).filter(Boolean).sort().pop() ?? null;
  const v = (id: string, k: 'now' | 'y1') => points.find((p) => p.id === id)?.[k] ?? null;
  const sp = (a: string, b: string, label: string) => ({ label, now: v(a, 'now') != null && v(b, 'now') != null ? (v(a, 'now')! - v(b, 'now')!) * 100 : null, y1: v(a, 'y1') != null && v(b, 'y1') != null ? (v(a, 'y1')! - v(b, 'y1')!) * 100 : null });
  return { points, asOf, spreads: [sp('DGS10', 'DGS2', '10Y − 2Y'), sp('DGS10', 'DGS3MO', '10Y − 3M'), sp('DGS30', 'DGS5', '30Y − 5Y')] };
}

/* ---------------- crypto perpetual funding (Hyperliquid) ---------------- */
export interface Perp { coin: string; mark: number; chgPct: number | null; fundingHr: number; fundingApr: number; oiUsd: number; volUsd: number; premiumPct: number | null; maxLev: number | null }
export function parseHyperliquid(j: any, max = 25): Perp[] {
  const uni = j?.[0]?.universe, ctx = j?.[1];
  if (!Array.isArray(uni) || !Array.isArray(ctx)) return [];
  const out: Perp[] = [];
  uni.forEach((u: any, i: number) => {
    const c = ctx[i];
    const mark = Number(c?.markPx), f = Number(c?.funding), prev = Number(c?.prevDayPx);
    if (!u?.name || u.isDelisted || !(mark > 0) || !Number.isFinite(f)) return;
    out.push({ coin: String(u.name), mark, chgPct: prev > 0 ? (mark / prev - 1) * 100 : null, fundingHr: f * 100, fundingApr: f * 24 * 365 * 100, oiUsd: Number(c.openInterest) * mark || 0, volUsd: Number(c.dayNtlVlm) || 0, premiumPct: Number.isFinite(Number(c.premium)) ? Number(c.premium) * 100 : null, maxLev: Number(u.maxLeverage) || null });
  });
  return out.sort((a, b) => b.volUsd - a.volUsd).slice(0, max);
}
