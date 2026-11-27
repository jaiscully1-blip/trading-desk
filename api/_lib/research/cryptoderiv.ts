// GET /api/research?fn=cryptoderiv -> BTC, ETH and SOL perpetual futures across exchanges that answer US servers (OKX, Kraken
// Futures, Deribit, Hyperliquid): yearly funding and open interest per venue, OKX open-interest history (90 days), its long /
// short account ratio vs the last 30 days, its latest liquidations, and plain crowding facts. Free public APIs, no keys.
// Cached 2 minutes. Facts, not advice; nothing here can trade.
import { crowdingNotes, deribitPerp, krakenPerp, liquidations, longShort, oiHistory, okxFunding, okxOiUsd, type Venue } from '../../../shared/cryptoderiv.js';
import { parseHyperliquid } from '../../../shared/optrates.js';
import { cached, getJson, json, take } from '../core.js';

const COINS = [{ coin: 'BTC', kraken: 'PF_XBTUSD', deribit: true }, { coin: 'ETH', kraken: 'PF_ETHUSD', deribit: true }, { coin: 'SOL', kraken: 'PF_SOLUSD', deribit: false }] as const;
const OKX = 'https://www.okx.com/api/v5';
const get = (url: string, init?: Parameters<typeof getJson>[3]) => { if (!take('cryptoex')) throw new Error('rate limited'); return getJson(url, 'cryptoex', 9000, init); };
const safe = async <T,>(p: () => Promise<T>, errs: string[], what: string): Promise<T | null> => { try { return await p(); } catch (e) { errs.push(`${what}: ${(e as Error).message}`); return null; } };

export async function cryptoderiv(): Promise<Response> {
  const { val } = await cached('cryptoderiv', 120, async () => {
    const errors: string[] = [];
    const [kr, hl, db] = await Promise.all([
      safe(() => get('https://futures.kraken.com/derivatives/api/v3/tickers'), errors, 'Kraken'),
      safe(() => getJson('https://api.hyperliquid.xyz/info', 'binance', 10000, { method: 'POST', body: JSON.stringify({ type: 'metaAndAssetCtxs' }) }).then((j) => parseHyperliquid(j, 300)), errors, 'Hyperliquid'),
      Promise.all(['BTC', 'ETH'].map((c) => safe(() => get(`https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${c}&kind=future`), errors, `Deribit ${c}`))),
    ]);
    const coins = [];
    for (const c of COINS) { // one coin at a time: OKX allows 20 calls per 2 seconds per endpoint
      const id = `${c.coin}-USDT-SWAP`;
      const [fund, oi, hist, ls, liq, inst] = await Promise.all([
        safe(() => get(`${OKX}/public/funding-rate?instId=${id}`), errors, `OKX ${c.coin} funding`),
        safe(() => get(`${OKX}/public/open-interest?instType=SWAP&instId=${id}`), errors, `OKX ${c.coin} open interest`),
        safe(() => get(`${OKX}/rubik/stat/contracts/open-interest-volume?ccy=${c.coin}&period=1D`), errors, `OKX ${c.coin} history`),
        safe(() => get(`${OKX}/rubik/stat/contracts/long-short-account-ratio?ccy=${c.coin}&period=1H`), errors, `OKX ${c.coin} long/short`),
        safe(() => get(`${OKX}/public/liquidation-orders?instType=SWAP&uly=${c.coin}-USDT&state=filled`), errors, `OKX ${c.coin} liquidations`),
        safe(() => get(`${OKX}/public/instruments?instType=SWAP&instId=${id}`), errors, `OKX ${c.coin} contract size`),
      ]);
      const venues: Venue[] = [];
      if (fund || oi) venues.push({ venue: 'OKX', aprPct: fund ? okxFunding(fund).aprPct : null, oiUsd: oi ? okxOiUsd(oi) : null });
      const k = kr ? krakenPerp(kr, c.kraken) : null; if (k) venues.push(k);
      const d = c.deribit ? db[c.coin === 'BTC' ? 0 : 1] : null; const dv = d ? deribitPerp(d, c.coin) : null; if (dv) venues.push(dv);
      const h = hl?.find((p) => p.coin === c.coin); if (h) venues.push({ venue: 'Hyperliquid', aprPct: h.fundingApr, oiUsd: h.oiUsd });
      const oiH = oiHistory(hist), lsR = longShort(ls);
      const ctVal = Number(inst?.data?.[0]?.ctVal);
      coins.push({ coin: c.coin, venues, oi: oiH, longShort: lsR, liq: liq && ctVal > 0 ? liquidations(liq, ctVal) : null, notes: crowdingNotes(venues, oiH, lsR), mark: h?.mark ?? null });
    }
    return { coins, errors, asOf: Date.now() };
  });
  return json({ ...val, source: 'Public market data from OKX, Kraken Futures, Deribit and Hyperliquid (no keys). Bybit, Binance futures and BitMEX block US servers, so they are not included' }, { sMaxAge: 120 });
}
