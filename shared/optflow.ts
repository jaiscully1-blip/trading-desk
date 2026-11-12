// Options activity from a delayed chain: contracts trading more than their open interest ("unusual activity") and
// max pain per expiry. Pure functions (tested). This shows where trading happened; it does not say who bought or sold,
// or whether a trade opened or closed a position. Open interest is from the start of the day.
import type { Chain, Contract } from './gamma.js';

export interface Unusual {
  exp: string; dte: number; K: number; cp: 'C' | 'P'; vol: number; oi: number; ratio: number;
  /** volume × price per contract × 100; price = last trade, else bid/ask midpoint */
  premium: number; price: number; iv: number; delta: number | null; otmPct: number;
}

const priceOf = (c: Contract) => (c.last && c.last > 0 ? c.last : c.bid && c.ask && c.ask >= c.bid ? (c.bid + c.ask) / 2 : 0);

/** Contracts whose volume today is above their opening open interest, biggest premium first. */
export function unusualActivity(ch: Chain, { minVol = 300, minRatio = 1, minPremium = 25_000, max = 30 } = {}): Unusual[] {
  const S = ch.spot;
  const out: Unusual[] = [];
  for (const c of ch.contracts) {
    if (c.vol < minVol || c.vol <= c.oi * minRatio) continue;
    const otm = c.cp === 'C' ? (c.K / S - 1) * 100 : (1 - c.K / S) * 100;
    if (otm < -15) continue; // deep in-the-money contracts trade like stock (often hedges or spreads); left out
    const price = priceOf(c), premium = c.vol * price * 100;
    if (premium < minPremium) continue;
    out.push({
      exp: c.exp, dte: c.dte, K: c.K, cp: c.cp, vol: c.vol, oi: c.oi, ratio: c.oi > 0 ? c.vol / c.oi : Infinity, premium, price, iv: c.iv,
      delta: c.delta ?? null, otmPct: otm,
    });
  }
  return out.sort((a, b) => b.premium - a.premium).slice(0, max);
}

/** Premium in unusual calls vs puts, and how much of it is short-dated (≤7 days). */
export function unusualSummary(rows: Unusual[]) {
  let call = 0, put = 0, short = 0;
  for (const r of rows) { if (r.cp === 'C') call += r.premium; else put += r.premium; if (r.dte <= 7) short += r.premium; }
  const total = call + put;
  return { call, put, total, callShare: total ? call / total : null, shortShare: total ? short / total : null, n: rows.length };
}

export interface MaxPain { exp: string; dte: number; strike: number; distPct: number; oi: number }
/**
 * Max pain: the expiry price at which option holders would collect the least (calls pay max(0, S−K), puts max(0, K−S),
 * weighted by open interest). Candidates are the listed strikes. Expiries with little open interest are skipped.
 */
export function maxPain(ch: Chain, maxExp = 4, minOi = 1000): MaxPain[] {
  const byExp = new Map<string, Contract[]>();
  for (const c of ch.contracts) if (c.oi > 0) byExp.set(c.exp, [...(byExp.get(c.exp) ?? []), c]);
  const out: MaxPain[] = [];
  for (const exp of [...byExp.keys()].sort()) {
    if (out.length >= maxExp) break;
    const cs = byExp.get(exp)!;
    const oi = cs.reduce((a, c) => a + c.oi, 0);
    if (oi < minOi) continue;
    const strikes = [...new Set(cs.map((c) => c.K))].sort((a, b) => a - b);
    let best = strikes[0], low = Infinity;
    for (const s of strikes) {
      let pay = 0;
      for (const c of cs) pay += c.oi * (c.cp === 'C' ? Math.max(0, s - c.K) : Math.max(0, c.K - s));
      if (pay < low) { low = pay; best = s; }
    }
    out.push({ exp, dte: cs[0].dte, strike: best, distPct: (best / ch.spot - 1) * 100, oi });
  }
  return out;
}
