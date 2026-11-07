// GET /api/research?fn=congress&symbol=NVDA -> stock trades members of Congress disclosed under the STOCK Act (Alpha Vantage).
// Free tier is 25 Alpha Vantage calls a day shared with the rest of the desk, so each symbol is cached 12 hours.
import { getJson, json, key, cached, hasKey, take, SYMBOL_RE } from '../core.js';

export interface CongressTrade { who: string; party: string; state: string; chamber: string; type: string; traded: string; filed: string; min: number | null; max: number | null; owner: string; asset: string }

export function parseCongress(j: any): CongressTrade[] {
  const seen = new Set<string>();
  const out: CongressTrade[] = [];
  for (const t of Array.isArray(j?.trades) ? j.trades : []) {
    const r: CongressTrade = {
      who: String(t.politician_canonical || t.politician || '?'), party: String(t.party ?? ''), state: String(t.state_district || t.state || ''),
      chamber: String(t.chamber ?? ''), type: String(t.transaction_type ?? ''), traded: String(t.transaction_date ?? ''), filed: String(t.filed_date || t.notification_date || ''),
      min: Number.isFinite(+t.amount_min) ? +t.amount_min : null, max: Number.isFinite(+t.amount_max) ? +t.amount_max : null, owner: String(t.owner_code ?? ''), asset: String(t.asset_name ?? ''),
    };
    const k = `${r.who}|${r.type}|${r.traded}|${r.min}|${r.max}|${r.owner}`;
    if (seen.has(k)) continue; // the feed repeats a filing when it is amended or re-listed
    seen.add(k); out.push(r);
  }
  return out.sort((a, b) => b.traded.localeCompare(a.traded));
}

export async function GET(req: Request): Promise<Response> {
  const sym = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!SYMBOL_RE.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  if (!hasKey('alphavantage')) return json({ error: 'needs ALPHAVANTAGE_API_KEY' }, { status: 400 });
  try {
    const { val, stale } = await cached(`congress:${sym}`, 12 * 3600, async () => {
      if (!take('alphavantage')) throw new Error('Alpha Vantage daily budget used up; try again later');
      const j = await getJson(`https://www.alphavantage.co/query?function=CONGRESS_TRADES&symbol=${encodeURIComponent(sym)}&apikey=${key('alphavantage')}`, 'alphavantage', 15000);
      if (j?.Note || j?.Information) throw new Error(String(j.Note || j.Information).slice(0, 140));
      return parseCongress(j).slice(0, 150);
    });
    return json({ sym, trades: val, stale, asOf: Date.now(), source: 'Alpha Vantage CONGRESS_TRADES (House Clerk + Senate eFD disclosures)' }, { sMaxAge: 6 * 3600 });
  } catch (e) { return json({ sym, trades: [], error: (e as Error).message }, { status: 502 }); }
}
