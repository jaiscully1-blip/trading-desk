// Routes for the free sources added in Nov 2026 (all through /api/research, so no new serverless functions):
//   fn=hours     world exchange status + NYSE holidays (Trade Time, free, no key)
//   fn=housing   home values, rents, homes for sale, sales (Zillow Research monthly CSVs, first rows only)
//   fn=btcnet    bitcoin network: fees, hash rate, difficulty (mempool.space)
//   fn=hisi      the most-shorted listed stocks (FINRA short interest + SEC shares outstanding)
//   fn=reactions the last few earnings reports with the next-day move (earningsapi.com, needs EARNINGSAPI_KEY)
import { highShortInterest, parseHolidays, parseMempool, parseReactions, parseTradeTime, parseZillowHead } from '../../../shared/extras.js';
import { parseSecTickers } from '../../../shared/company.js';
import { parseTranscript, quarterCandidates, transcriptSummary } from '../../../shared/transcript.js';
import { latestByCik, recentInstantPeriods } from '../../../shared/tearsheet.js';
import { frameUrl } from '../../../shared/distressGather.js';
import { secJson } from '../adapters.js';
import { SYMBOL_RE, cached, getCached, getJson, hasKey, json, key, setCached, take } from '../core.js';

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const fail = (e: unknown, status = 502) => json({ error: (e as Error).message.slice(0, 160) }, { status });

export async function hours(): Promise<Response> {
  try {
    const y = new Date().getUTCFullYear();
    const [st, hol, hol2] = await Promise.all([
      cached('tt:status', 60, async () => parseTradeTime(await getJson('https://api.tradeti.me/v1/status', 'tradetime', 8000))),
      cached(`tt:hol:${y}`, 86400, async () => parseHolidays(await getJson(`https://api.tradeti.me/v1/exchanges/nyse/holidays?year=${y}`, 'tradetime', 8000))),
      cached(`tt:hol:${y + 1}`, 86400, async () => parseHolidays(await getJson(`https://api.tradeti.me/v1/exchanges/nyse/holidays?year=${y + 1}`, 'tradetime', 8000))).catch(() => ({ val: { holidays: [], early: [] } })),
    ]);
    const today = ymd(Date.now());
    return json({
      exchanges: st.val, nyse: { holidays: [...hol.val.holidays, ...hol2.val.holidays].filter((d) => d >= today), early: [...hol.val.early, ...hol2.val.early].filter((e) => e.date >= today) },
      asOf: Date.now(), source: 'Trade Time (api.tradeti.me): exchange-published hours and holidays; next-year dates may be estimated until the exchange publishes them',
    }, { sMaxAge: 60 });
  } catch (e) { return fail(e); }
}

const ZILLOW = [
  { id: 'value', label: 'Home value (typical)', unit: '$', path: 'zhvi/Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month' },
  { id: 'rent', label: 'Rent (typical)', unit: '$/mo', path: 'zori/Metro_zori_uc_sfrcondomfr_sm_month' },
  { id: 'listings', label: 'Homes for sale', unit: '', path: 'invt_fs/Metro_invt_fs_uc_sfrcondo_sm_month' },
  { id: 'sales', label: 'Homes sold', unit: '', path: 'sales_count_now/Metro_sales_count_now_uc_sfrcondo_month' },
];
export async function housing(): Promise<Response> {
  const errors: Record<string, string> = {};
  const series = await Promise.all(ZILLOW.map(async (z) => {
    try {
      const { val } = await cached(`zillow:${z.id}`, 86400, async () => {
        if (!take('zillow')) throw new Error('Zillow request budget used up for now');
        // only the first ~90 KB: the US row and the biggest metros come first (the full file is several MB)
        const r = await fetch(`https://files.zillowstatic.com/research/public_csvs/${z.path}.csv`, { headers: { range: 'bytes=0-90000' }, signal: AbortSignal.timeout(15000) });
        if (!r.ok && r.status !== 206) throw new Error(`HTTP ${r.status}`);
        return parseZillowHead(await r.text(), 6);
      });
      return { ...z, rows: val };
    } catch (e) { errors[z.id] = (e as Error).message.slice(0, 120); return { ...z, rows: [] }; }
  }));
  return json({ series: series.map(({ path: _p, ...s }) => s), errors, asOf: Date.now(), source: 'Zillow Research public data (monthly, smoothed and seasonally adjusted where Zillow does so)' }, { sMaxAge: 3600 });
}

export async function btcnet(): Promise<Response> {
  try {
    const { val } = await cached('mempool:net', 120, async () => {
      const g = (p: string) => getJson(`https://mempool.space/api${p}`, 'mempool', 8000).catch(() => null);
      const [fees, diff, hash, height] = await Promise.all([g('/v1/fees/recommended'), g('/v1/difficulty-adjustment'), g('/v1/mining/hashrate/1w'), g('/blocks/tip/height')]);
      if (!fees && !diff) throw new Error('mempool.space did not answer');
      return parseMempool(fees, diff, hash, height);
    });
    return json({ ...val, asOf: Date.now(), source: 'mempool.space public API' }, { sMaxAge: 120 });
  } catch (e) { return fail(e); }
}

export async function hisi(): Promise<Response> {
  if (!hasKey('sec')) return json({ error: 'SEC_USER_AGENT is not set' }, { status: 503 });
  try {
    const { val } = await cached('hisi:list', 6 * 3600, async () => {
      const now = Date.now();
      const body = {
        limit: 5000, fields: ['symbolCode', 'issueName', 'currentShortPositionQuantity', 'daysToCoverQuantity', 'settlementDate', 'changePercent'],
        compareFilters: [{ compareType: 'greater', fieldName: 'currentShortPositionQuantity', fieldValue: 300000 }],
        domainFilters: [{ fieldName: 'marketClassCode', values: ['NNM', 'NYSE', 'SC', 'AMEX'] }], // Nasdaq and NYSE listings, not OTC
        dateRangeFilters: [{ fieldName: 'settlementDate', startDate: ymd(now - 20 * 86400_000), endDate: ymd(now) }],
      };
      const [rows, tick, frames] = await Promise.all([
        getJson('https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest', 'finra', 20000, { method: 'POST', body: JSON.stringify(body) }),
        cached('sec:tickers', 86400, async () => parseSecTickers(await secJson('https://www.sec.gov/files/company_tickers.json'))),
        cached('sec:sharesout', 86400, async () => [...latestByCik(await Promise.all(recentInstantPeriods(ymd(now), 3).map((p) => secJson(frameUrl('dei', 'EntityCommonStockSharesOutstanding', 'shares', p)).catch(() => null)))).entries()]),
      ]);
      const byCik = new Map(frames.val);
      const so = new Map<string, number>();
      for (const t of tick.val) { const v = byCik.get(t.cik); if (v) so.set(t.ticker.replace('-', '.'), v.val); }
      return highShortInterest(rows, so);
    });
    return json({ rows: val, asOf: Date.now(), source: 'FINRA consolidated short interest (twice a month) ÷ SEC shares outstanding (latest filing). % is of shares outstanding, not float.' }, { sMaxAge: 3600 });
  } catch (e) { return fail(e); }
}

export async function reactions(req: Request): Promise<Response> {
  const sym = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!SYMBOL_RE.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  if (!hasKey('earningsapi')) return json({ needsKey: true, error: 'Add EARNINGSAPI_KEY in Vercel to see past earnings reactions.' }, { status: 503 });
  try {
    const { val } = await cached(`eapi:react:${sym}`, 24 * 3600, async () => parseReactions(await getJson(`https://api.earningsapi.com/v1/earnings-reactions?symbol=${encodeURIComponent(sym)}&apikey=${key('earningsapi')}`, 'earningsapi', 10000)));
    return json({ sym, reports: val, asOf: Date.now(), source: 'Earnings API (earningsapi.com), free plan' }, { sMaxAge: 6 * 3600 });
  } catch (e) { return fail(e); }
}

/** fn=transcript&symbol=AAPL[&quarter=2026Q3] -> an earnings call transcript (Alpha Vantage, free key, 25 calls a day for
 *  the whole desk). Without a quarter it tries the newest fiscal quarters until one has a transcript; found ones are kept 30 days. */
export async function transcript(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const sym = (u.searchParams.get('symbol') ?? '').toUpperCase(), want = u.searchParams.get('quarter') ?? '';
  if (!SYMBOL_RE.test(sym) || (want && !/^\d{4}Q[1-4]$/.test(want))) return json({ error: 'bad symbol or quarter' }, { status: 400 });
  if (!hasKey('alphavantage')) return json({ needsKey: true, error: 'Transcripts need ALPHAVANTAGE_API_KEY (free).' }, { status: 503 });
  // a found transcript is kept 30 days; "not out yet" only 12 hours, so a new call shows up the next day
  const one = async (q: string) => {
    if (getCached<boolean>(`tr:none:${sym}:${q}`)?.fresh) return null;
    const hit = getCached<ReturnType<typeof parseTranscript>>(`tr:${sym}:${q}`);
    if (hit?.fresh) return hit.val;
    if (!take('alphavantage')) throw new Error('Alpha Vantage daily budget (25 calls) used up; try again tomorrow');
    const j = await getJson(`https://www.alphavantage.co/query?function=EARNINGS_CALL_TRANSCRIPT&symbol=${encodeURIComponent(sym)}&quarter=${q}&apikey=${key('alphavantage')}`, 'alphavantage', 20000);
    if (j?.Information || j?.Note) throw new Error(String(j.Information ?? j.Note).slice(0, 140));
    const t = parseTranscript(j, sym, q);
    if (t) setCached(`tr:${sym}:${q}`, t, 30 * 86400); else setCached(`tr:none:${sym}:${q}`, true, 12 * 3600);
    return t;
  };
  try {
    const tries = want ? [want] : quarterCandidates(Date.now(), 3);
    for (const q of tries) {
      const t = await one(q);
      if (t) return json({ ...t, summary: transcriptSummary(t), tried: tries, asOf: Date.now(), source: 'Alpha Vantage earnings call transcripts (sentiment per turn is their model, −1 to 1)' }, { sMaxAge: 86400 });
    }
    return json({ sym, error: `No transcript yet for ${tries.join(', ')}.`, tried: tries }, { status: 404 });
  } catch (e) { return fail(e); }
}
