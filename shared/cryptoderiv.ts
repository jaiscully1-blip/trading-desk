// Crypto derivatives across exchanges, from their free public APIs (no keys): funding rates and open interest on OKX,
// Kraken Futures, Deribit and Hyperliquid, OKX's open-interest history and long / short account ratio, and OKX's latest
// liquidations. Bybit, Binance futures and BitMEX refuse US servers, so they are not used. Funding is shown as a yearly
// rate so venues with 1-hour and 8-hour funding compare. Pure + tested. Facts, not advice.

export interface Venue { venue: string; aprPct: number | null; oiUsd: number | null }
const num = (x: unknown) => { const v = Number(x); return Number.isFinite(v) ? v : null; };
const H_YEAR = 24 * 365;

/** OKX perpetual funding: the rate per funding period, period from the timestamps (usually 8 hours). */
export function okxFunding(j: any): { aprPct: number | null; periodH: number | null } {
  const d = j?.data?.[0]; const r = num(d?.fundingRate), a = num(d?.fundingTime), b = num(d?.nextFundingTime);
  const periodH = a && b && b > a ? (b - a) / 3_600_000 : null;
  return { aprPct: r != null && periodH ? (r * (H_YEAR / periodH)) * 100 : null, periodH };
}
export const okxOiUsd = (j: any) => num(j?.data?.[0]?.oiUsd);

/** Kraken Futures perpetual (PF_XBTUSD...): relativeFundingRate is per hour; open interest is in coins. */
export function krakenPerp(j: any, symbol: string): Venue | null {
  const t = (j?.tickers ?? []).find((x: any) => x.symbol === symbol); if (!t) return null;
  const f = num(t.relativeFundingRate), oi = num(t.openInterest), px = num(t.markPrice);
  return { venue: 'Kraken', aprPct: f != null ? f * H_YEAR * 100 : null, oiUsd: oi != null && px ? oi * px : null };
}

/** Deribit inverse perpetual (BTC-PERPETUAL, ETH-PERPETUAL): funding_8h is the rate over 8 hours; open interest is in USD. */
export function deribitPerp(j: any, coin: string): Venue | null {
  const r = (j?.result ?? []).find((x: any) => x.instrument_name === `${coin}-PERPETUAL`); if (!r) return null;
  const f = num(r.funding_8h);
  return { venue: 'Deribit', aprPct: f != null ? f * (H_YEAR / 8) * 100 : null, oiUsd: num(r.open_interest) };
}

/** OKX daily open interest (USD, all its contracts on the coin), newest first in the API: change over 1, 7 and 30 days. */
export function oiHistory(j: any): { last: number | null; d1: number | null; d7: number | null; d30: number | null; series: [number, number][] } {
  const rows: [number, number][] = (j?.data ?? []).map((r: string[]) => [Number(r[0]), Number(r[1])] as [number, number]).filter((r: [number, number]) => r[0] > 0 && r[1] > 0).sort((a: [number, number], b: [number, number]) => a[0] - b[0]);
  const last = rows.at(-1)?.[1] ?? null;
  const ago = (n: number) => { const r = rows.at(-1 - n); return last != null && r ? Math.round((last / r[1] - 1) * 1000) / 10 : null; };
  return { last, d1: ago(1), d7: ago(7), d30: ago(30), series: rows.slice(-90) };
}

/** OKX long / short account ratio (accounts net long / net short), hourly for 30 days: the latest and where it sits in that range. */
export function longShort(j: any): { last: number | null; pctile: number | null; min: number | null; max: number | null } {
  const v: number[] = (j?.data ?? []).map((r: string[]) => Number(r[1])).filter((x: number) => x > 0);
  if (!v.length) return { last: null, pctile: null, min: null, max: null };
  const last = v[0]; // newest first
  return { last, pctile: Math.round((v.filter((x) => x <= last).length / v.length) * 100), min: Math.min(...v), max: Math.max(...v) };
}

/** OKX's latest liquidations (the API returns only the most recent ~100): USD wiped on each side and the time span covered.
 *  posSide "long" = a long position was force-closed. Size is in contracts; ctVal coins per contract. */
export function liquidations(j: any, ctVal: number): { longUsd: number; shortUsd: number; n: number; spanMin: number | null; from: number | null; to: number | null } {
  const ds: any[] = (j?.data ?? []).flatMap((b: any) => b?.details ?? []);
  let longUsd = 0, shortUsd = 0; const ts: number[] = [];
  for (const d of ds) {
    const usd = (num(d.sz) ?? 0) * ctVal * (num(d.bkPx) ?? 0); const t = num(d.ts ?? d.time); if (t) ts.push(t);
    if (d.posSide === 'long') longUsd += usd; else if (d.posSide === 'short') shortUsd += usd;
  }
  const from = ts.length ? Math.min(...ts) : null, to = ts.length ? Math.max(...ts) : null;
  return { longUsd: Math.round(longUsd), shortUsd: Math.round(shortUsd), n: ds.length, spanMin: from != null && to != null ? Math.round((to - from) / 6000) / 10 : null, from, to };
}

/** Plain facts about crowding, no calls: funding sign across venues, open-interest build-up, account ratio vs its month. */
export function crowdingNotes(venues: Venue[], oi: ReturnType<typeof oiHistory>, ls: ReturnType<typeof longShort>): string[] {
  const out: string[] = [];
  const f = venues.map((v) => v.aprPct).filter((x): x is number => x != null);
  if (f.length >= 2) {
    const pos = f.filter((x) => x > 0).length, avg = f.reduce((a, b) => a + b, 0) / f.length;
    if (pos === f.length) out.push(`Funding positive on all ${f.length} venues (longs pay shorts), about ${avg.toFixed(1)}% a year on average.`);
    else if (pos === 0) out.push(`Funding negative on all ${f.length} venues (shorts pay longs), about ${avg.toFixed(1)}% a year on average.`);
    else out.push(`Funding mixed: positive on ${pos} of ${f.length} venues.`);
    if (avg >= 30) out.push('Funding above 30% a year: longs are paying a lot to stay in.');
  }
  if (oi.d7 != null && Math.abs(oi.d7) >= 10) out.push(`Open interest ${oi.d7 > 0 ? 'up' : 'down'} ${Math.abs(oi.d7)}% in 7 days on OKX (${oi.d7 > 0 ? 'new positions building' : 'positions closing'}).`);
  if (ls.pctile != null && (ls.pctile >= 90 || ls.pctile <= 10)) out.push(`OKX long / short account ratio ${ls.last} is at the ${ls.pctile >= 90 ? 'top' : 'bottom'} of its 30-day range.`);
  return out;
}
