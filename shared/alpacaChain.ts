// Alpaca option data -> the same chain shape Cboe's delayed JSON uses, so parseCboe / gammaRead work unchanged.
// Snapshots (indicative feed, free plan): quotes, last trade, today's volume, implied volatility, delta.
// Contracts (trading API): open interest (as of the prior close).

/** Merge Alpaca option snapshots + contracts into { data: { current_price, options: [...] } }. */
export function alpacaToCboe(spot: number, snapshots: Record<string, any>, contracts: any[]): any {
  const oi = new Map<string, number>();
  for (const c of contracts) if (c?.symbol) oi.set(String(c.symbol), Number(c.open_interest) || 0);
  const options: any[] = [];
  for (const [sym, s] of Object.entries(snapshots ?? {})) {
    options.push({
      option: sym,
      iv: Number(s?.impliedVolatility) || 0,
      open_interest: oi.get(sym) ?? 0,
      volume: Number(s?.dailyBar?.v) || 0,
      bid: Number(s?.latestQuote?.bp) || 0,
      ask: Number(s?.latestQuote?.ap) || 0,
      last_trade_price: Number(s?.latestTrade?.p) || 0,
      delta: s?.greeks?.delta,
    });
  }
  // contracts with open interest but no snapshot still count toward OI (no IV: they add OI, not GEX)
  for (const [sym, n] of oi) if (!(sym in (snapshots ?? {})) && n > 0) options.push({ option: sym, iv: 0, open_interest: n, volume: 0 });
  return { data: { current_price: spot, options } };
}
