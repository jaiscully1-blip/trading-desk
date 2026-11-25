// Load an option chain from Alpaca (free plan): expiries within 60 days, strikes within ±15% of price.
import { alpacaToCboe } from '../../../shared/alpacaChain.js';
import { alpacaHeaders as H } from '../adapters.js';
import { getJson, take } from '../core.js';

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

async function pages(base: string, field: 'snapshots' | 'option_contracts', max = 8): Promise<any> {
  let tok = '', out: any = field === 'snapshots' ? {} : [];
  for (let i = 0; i < max; i++) {
    if (!take('alpaca')) throw new Error('Alpaca request budget used up for now');
    const j = await getJson(`${base}${tok ? `&page_token=${encodeURIComponent(tok)}` : ''}`, 'alpaca', 15000, { headers: H() });
    if (field === 'snapshots') Object.assign(out, j?.snapshots ?? {}); else out = out.concat(j?.option_contracts ?? []);
    tok = j?.next_page_token ?? '';
    if (!tok) break;
  }
  return out;
}

export async function alpacaChain(sym: string): Promise<any> {
  if (!take('alpaca')) throw new Error('Alpaca request budget used up for now');
  const snap = await getJson(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(sym)}/snapshot?feed=iex`, 'alpaca', 10000, { headers: H() });
  const spot = Number(snap?.latestTrade?.p) || Number(snap?.dailyBar?.c) || Number(snap?.prevDailyBar?.c);
  if (!(spot > 0)) throw new Error(`Alpaca has no price for ${sym}`);
  const q = `expiration_date_gte=${day(Date.now() - 86400_000)}&expiration_date_lte=${day(Date.now() + 60 * 86400_000)}&strike_price_gte=${(spot * 0.85).toFixed(2)}&strike_price_lte=${(spot * 1.15).toFixed(2)}`;
  const [snaps, contracts] = await Promise.all([
    pages(`https://data.alpaca.markets/v1beta1/options/snapshots/${encodeURIComponent(sym)}?feed=indicative&limit=1000&${q}`, 'snapshots'),
    // paper and live accounts use different trading hosts; free keys are usually paper
    pages(`https://paper-api.alpaca.markets/v2/options/contracts?underlying_symbols=${encodeURIComponent(sym)}&limit=10000&${q}`, 'option_contracts', 3)
      .catch(() => pages(`https://api.alpaca.markets/v2/options/contracts?underlying_symbols=${encodeURIComponent(sym)}&limit=10000&${q}`, 'option_contracts', 3))
      .catch(() => [] as any[]),
  ]);
  return { json: alpacaToCboe(spot, snaps, contracts), hasOi: contracts.length > 0 };
}

/** Any option chain, parsed: Alpaca first (free key, stocks and ETFs), Cboe as a fallback (indexes, or no Alpaca key). */
export async function loadChain(sym: string): Promise<import('../../../shared/gamma.js').Chain> {
  const { parseCboe } = await import('../../../shared/gamma.js');
  const { hasKey } = await import('../core.js');
  const idx: Record<string, string> = { SPX: '_SPX', NDX: '_NDX', RUT: '_RUT', VIX: '_VIX' };
  if (hasKey('alpaca') && !idx[sym]) { try { return parseCboe((await alpacaChain(sym)).json, sym); } catch { /* fall back to Cboe */ } }
  if (!take('cboe')) throw new Error('Option chain budget used up for now');
  try { return parseCboe(await getJson(`https://cdn.cboe.com/api/global/delayed_quotes/options/${idx[sym] ?? sym}.json`, 'cboe', 25000), sym); }
  catch { throw new Error(hasKey('alpaca') ? 'No option chain available right now' : 'Option chains need the free Alpaca keys (ALPACA_KEY_ID, ALPACA_SECRET_KEY): Cboe blocks automated requests'); }
}
