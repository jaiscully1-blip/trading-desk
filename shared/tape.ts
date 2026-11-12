// Time & sales from Alpaca's free IEX feed. IEX is one exchange (about 2–3% of US stock volume), so this is a sample of
// the tape, not the whole tape, and the quote is IEX's own best bid / ask, not the national best or full Level 2 depth.
// Pure parsers and summaries (tested); fetching lives in /api.

export interface Print { t: number; p: number; s: number; side: 'up' | 'down' | 'same'; big: boolean }
export interface TopOfBook { bid: number; bidSize: number; ask: number; askSize: number; t: number }

/** Alpaca /v2/stocks/{sym}/trades -> prints oldest first, with the tick rule (up / down / same vs the previous different price). */
export function parseAlpacaTrades(j: any, bigShares = 10_000, bigUsd = 250_000): Print[] {
  const raw: { t: number; p: number; s: number }[] = (Array.isArray(j?.trades) ? j.trades : [])
    .map((x: any) => ({ t: Date.parse(x?.t), p: Number(x?.p), s: Number(x?.s) }))
    .filter((x: any) => Number.isFinite(x.t) && x.p > 0 && x.s > 0)
    .sort((a: any, b: any) => a.t - b.t);
  const out: Print[] = [];
  let ref: number | null = null, last: Print['side'] = 'same';
  for (const x of raw) {
    // tick rule: a trade at the same price keeps the direction of the last price change
    const side: Print['side'] = ref == null ? 'same' : x.p > ref ? 'up' : x.p < ref ? 'down' : last;
    if (ref == null || x.p !== ref) { last = side; ref = x.p; }
    out.push({ ...x, side, big: x.s >= bigShares || x.s * x.p >= bigUsd });
  }
  return out;
}

/** Alpaca /v2/stocks/{sym}/quotes/latest -> IEX top of book (null when IEX has no quote, e.g. outside its hours). */
export function parseAlpacaQuote(j: any): TopOfBook | null {
  const q = j?.quote;
  const bid = Number(q?.bp), ask = Number(q?.ap), t = Date.parse(q?.t);
  if (!(bid > 0) || !(ask > 0) || !Number.isFinite(t)) return null;
  return { bid, bidSize: Number(q?.bs) || 0, ask, askSize: Number(q?.as) || 0, t };
}

/** Volume on upticks vs downticks, VWAP and the largest print over the prints given. */
export function tapeSummary(ps: Print[]) {
  let up = 0, down = 0, vol = 0, pv = 0;
  let biggest: Print | null = null;
  for (const x of ps) {
    vol += x.s; pv += x.p * x.s;
    if (x.side === 'up') up += x.s; else if (x.side === 'down') down += x.s;
    if (!biggest || x.s * x.p > biggest.s * biggest.p) biggest = x;
  }
  return { n: ps.length, vol, vwap: vol ? pv / vol : null, upShare: up + down ? up / (up + down) : null, biggest, from: ps[0]?.t ?? null, to: ps[ps.length - 1]?.t ?? null };
}
