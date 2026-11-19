// Dark-pool and "phantom" print levels from the consolidated tape (Alpaca free plan, SIP feed, 15 minutes delayed).
// Off-exchange = exchange code "D" (FINRA ADF / TRF: dark pools, wholesalers and other off-exchange venues report here).
// A block = an off-exchange print of at least $1M or 10,000 shares. A "phantom" print = a block that was reported late or
// out of sequence (condition Z or U), priced from another trade (W average price, 4 derivatively priced), or that printed
// more than 0.5% away from the price trading at the time. This is the desk's own rule: the term has no official definition.
// None of it says who traded or which way: a print is a buyer and a seller.

export interface RawTrade { t: string; x: string; p: number; s: number; c?: string[] }
export interface Print { t: number; price: number; size: number; usd: number; phantom: boolean; why: string[] }
export interface PrintLevel { price: number; usd: number; shares: number; n: number; phantom: number; last: number }

const LATE = new Set(['Z', 'U']), DERIVED = new Set(['W', '4']);
export const BLOCK_USD = 1_000_000, BLOCK_SHARES = 10_000, AWAY = 0.005;

/** Walks trades in time order; keeps off-exchange blocks and flags the phantom ones. */
export function blockPrints(trades: RawTrade[], ref: { last: number | null } = { last: null }): Print[] {
  const out: Print[] = [];
  for (const tr of trades) {
    if (!(tr.p > 0) || !(tr.s > 0)) continue;
    const cs = tr.c ?? [];
    if (tr.x !== 'D') { if (!cs.some((c) => LATE.has(c) || DERIVED.has(c))) ref.last = tr.p; continue; }
    const usd = tr.p * tr.s;
    if (usd < BLOCK_USD && tr.s < BLOCK_SHARES) continue;
    const why: string[] = [];
    if (cs.some((c) => LATE.has(c))) why.push('reported late / out of sequence');
    if (cs.includes('W')) why.push('average-price trade');
    if (cs.includes('4')) why.push('derivatively priced');
    if (ref.last && Math.abs(tr.p / ref.last - 1) > AWAY) why.push(`${((tr.p / ref.last - 1) * 100).toFixed(2)}% away from the market`);
    out.push({ t: Date.parse(tr.t), price: tr.p, size: tr.s, usd, phantom: why.length > 0, why });
  }
  return out;
}

/** Groups blocks into price levels (buckets of about 0.05% of price, at least 1 cent) and ranks them by dollars. */
export function printLevels(prints: Print[], top = 10): PrintLevel[] {
  if (!prints.length) return [];
  const mid = prints.reduce((a, p) => a + p.price, 0) / prints.length, step = Math.max(0.01, +(mid * 0.0005).toFixed(2));
  const m = new Map<number, PrintLevel>();
  for (const p of prints) {
    const k = Math.round(p.price / step);
    const l = m.get(k) ?? { price: 0, usd: 0, shares: 0, n: 0, phantom: 0, last: 0 };
    l.price += p.price * p.size; l.usd += p.usd; l.shares += p.size; l.n++; if (p.phantom) l.phantom++; l.last = Math.max(l.last, p.t);
    m.set(k, l);
  }
  return [...m.values()].map((l) => ({ ...l, price: +(l.price / l.shares).toFixed(2) })).sort((a, b) => b.usd - a.usd).slice(0, top);
}

export const usdShort = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${(v / 1e3).toFixed(0)}K`);
