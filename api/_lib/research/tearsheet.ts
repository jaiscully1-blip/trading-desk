// GET /api/research?fn=tearsheet&symbol=NVDA -> one-page numbers: price and market cap (Yahoo, delayed), shares outstanding,
// estimated float, cash, debt, last fiscal year's revenue / net income / free cash flow (SEC XBRL), short interest (FINRA),
// next earnings date (Finnhub, when its key works). Every field says where it came from.
import { parseSecTickers } from '../../../shared/company.js';
import { parseYahooBars } from '../../../shared/rotation.js';
import { closeOn, floatShares, tearFromFacts } from '../../../shared/tearsheet.js';
import { finnhubEarnings, finnhubMetrics, finraShortInterest, secJson } from '../adapters.js';
import { pickWikidata, valuation, wikidataQuery } from '../../../shared/analysis.js';
import { SYMBOL_RE, cached, getJson, hasKey, json } from '../core.js';

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function GET(req: Request): Promise<Response> {
  const sym = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!SYMBOL_RE.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  if (!hasKey('sec')) return json({ error: 'SEC_USER_AGENT is not set' }, { status: 503 });
  const errors: Record<string, string> = {};
  const safe = async <T>(name: string, f: () => Promise<T>): Promise<T | null> => { try { return await f(); } catch (e) { errors[name] = (e as Error).message.slice(0, 120); return null; } };

  const tick = (await cached('sec:tickers', 86400, async () => parseSecTickers(await secJson('https://www.sec.gov/files/company_tickers.json')))).val;
  const t = tick.find((x) => x.ticker === sym || x.ticker === sym.replace('.', '-'));
  const now = Date.now();
  const [facts, bars, si, earn] = await Promise.all([
    t ? safe('sec', async () => (await cached(`tear:facts:${t.cik}`, 86400, async () => tearFromFacts(await secJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(t.cik).padStart(10, '0')}.json`)))).val) : Promise.resolve(null),
    safe('prices', async () => (await cached(`tear:bars:${sym}`, 900, async () => parseYahooBars(await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym.replace('.', '-'))}?range=2y&interval=1d`, 'yahoo', 10000, { headers: { 'user-agent': 'Mozilla/5.0 (trading-desk; personal use)' } }), true))).val),
    safe('finra', async () => (await cached(`tear:si:${sym}`, 12 * 3600, async () => (await finraShortInterest([sym])).get(sym) ?? null)).val),
    hasKey('finnhub') ? safe('finnhub', async () => {
      const from = ymd(now - 86400_000), to = ymd(now + 120 * 86400_000);
      const { val } = await cached(`tear:earn:${sym}:${from}`, 6 * 3600, () => finnhubEarnings(from, to, sym));
      return val.filter((r) => r.sym === sym && r.date >= ymd(now - 86400_000)).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
    }) : Promise.resolve(null),
  ]);
  // company facts (Wikidata), valuation ratios (Finnhub basic financials), dividends (Nasdaq's public quote API, unofficial)
  const NQ = { 'user-agent': 'Mozilla/5.0 (trading-desk; personal use)', accept: 'application/json, text/plain, */*', origin: 'https://www.nasdaq.com', referer: 'https://www.nasdaq.com/' };
  const [wd, metric, divs] = await Promise.all([
    safe('wikidata', async () => (await cached(`wd:${sym}`, 30 * 86400, async () => pickWikidata(await getJson(`https://query.wikidata.org/sparql?query=${encodeURIComponent(wikidataQuery(sym))}`, 'wikipedia', 25000, { headers: { accept: 'application/sparql-results+json', 'user-agent': 'trading-desk/1.0 (personal research tool)' } }), t?.title ?? null))).val),
    hasKey('finnhub') ? safe('finnhubMetrics', async () => (await cached(`metric:${sym}`, 12 * 3600, () => finnhubMetrics(sym))).val) : Promise.resolve(null),
    safe('dividends', async () => (await cached(`nq:div:${sym}`, 12 * 3600, async () => {
      const j = await getJson(`https://api.nasdaq.com/api/quote/${encodeURIComponent(sym)}/dividends?assetclass=stocks`, 'nasdaq', 10000, { headers: NQ });
      const rows: any[] = j?.data?.dividends?.rows ?? [];
      const d = (s: string) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s ?? '')); return m ? `${m[3]}-${m[1]}-${m[2]}` : null; };
      return rows.slice(0, 1).map((r) => ({ exDate: d(r.exOrEffDate), payDate: d(r.paymentDate), amount: Number(String(r.amount ?? '').replace(/[$,]/g, '')) || null }))[0] ?? null;
    })).val),
  ]);
  const last = bars?.length ? bars[bars.length - 1] : null;
  const price = last?.close ?? null;
  const floatCl = facts?.floatAsOf && bars ? closeOn(bars, facts.floatAsOf) : null;
  const floatSh = facts ? floatShares(facts.publicFloatUsd, floatCl, facts.sharesOut) : null;
  return json({
    sym, name: t?.title ?? null, cik: t?.cik ?? null,
    price, priceAt: last ? last.time * 1000 : null,
    marketCap: price != null && facts?.sharesOut ? price * facts.sharesOut : null,
    facts, floatShares: floatSh, floatClose: floatCl,
    shortInterest: si ? { ...si, pctFloat: floatSh ? (si.shares / floatSh) * 100 : null } : si,
    profile: wd, valuation: metric ? valuation(metric as Record<string, unknown>) : null, dividend: divs,
    nextEarnings: earn ? { date: earn.date, hour: earn.hour, epsEst: earn.epsEst } : null,
    errors, asOf: now,
    sources: { prices: 'Yahoo Finance (unofficial, delayed)', facts: 'SEC XBRL company facts (from 10-K / 10-Q filings)', float: 'Estimated: SEC public float (non-affiliate value) ÷ close on that date', shortInterest: 'FINRA consolidated short interest (twice a month)', earnings: 'Finnhub earnings calendar', profile: 'Wikidata (community-edited; check the company site)', valuation: 'Finnhub basic financials', dividend: 'Nasdaq dividend history (unofficial)' },
  }, { sMaxAge: 900 });
}
