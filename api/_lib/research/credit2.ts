// GET /api/research?fn=credit2 -> ratings ladder, Moody's yields, tranche / loan proxies, credit-vs-stocks, Treasury futures positioning.
// GET /api/research?fn=credlook&q=Oracle Corp&ticker=ORCL -> which funds (N-PORT) and lenders (10-Q/10-K, incl. BDCs) mention a
// name, its debt from SEC filings and a Merton distance to default. Free sources; FRED and SEC need the keys already set.
import { COT, LADDER, MOODYS, PROXIES, annVol, deltas, divergence, merton, pctChg } from '../../../shared/credit2.js';
import { parseFredSeries } from '../../../shared/parse.js';
import { parseSpark } from '../../../shared/distressGather.js';
import { cached, getJson, hasKey, json, key, take } from '../core.js';

const YH = { 'user-agent': 'Mozilla/5.0 (trading-desk; personal use)' };
async function fredPts(id: string): Promise<[string, number][]> {
  const j = await getJson(`https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key('fred')}&file_type=json&sort_order=desc&limit=300`, 'fred', 12000);
  return parseFredSeries(j).map((o) => [o.date, o.value] as [string, number]).sort((a, b) => a[0].localeCompare(b[0]));
}
async function spark(syms: string[], range = '1y') {
  const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/spark?symbols=${syms.join(',')}&range=${range}&interval=1d`, 'yahoo', 12000, { headers: YH });
  return parseSpark(j, syms);
}

export async function credit2(): Promise<Response> {
  const errors: Record<string, string> = {};
  const { val } = await cached('credit2', 3 * 3600, async () => {
    const ladder = await Promise.all(LADDER.map(async (g) => {
      try { const [o, y] = await Promise.all([fredPts(g.oas), fredPts(g.yld)]); return { grade: g.grade, oas: deltas(o), yld: deltas(y) }; }
      catch (e) { errors[g.grade] = (e as Error).message.slice(0, 80); return { grade: g.grade, oas: deltas([]), yld: deltas([]) }; }
    }));
    const moodys = await Promise.all(MOODYS.map(async (m) => { try { return { ...m, ...deltas(await fredPts(m.id)) }; } catch (e) { errors[m.id] = (e as Error).message.slice(0, 80); return { ...m, ...deltas([]) }; } }));
    let proxies: { sym: string; what: string; last: number | null; m1: number | null; m3: number | null; y1: number | null }[] = [];
    try { const m = await spark(PROXIES.map((p) => p.sym)); proxies = PROXIES.map((p) => { const c = m.get(p.sym) ?? []; return { ...p, last: c.at(-1) ?? null, m1: pctChg(c, 21), m3: pctChg(c, 63), y1: pctChg(c, 250) }; }); }
    catch (e) { errors.etfs = (e as Error).message.slice(0, 80); }
    let hy: [string, number][] = [];
    try { hy = await fredPts('BAMLH0A0HYM2'); } catch (e) { errors.hy = (e as Error).message.slice(0, 80); }
    const hd = deltas(hy);
    let cot: { label: string; date: string; assetNet: number; levNet: number; levNetChg: number; oi: number }[] = [];
    try {
      if (!take('cftc')) throw new Error('rate limited');
      const rows: any[] = await getJson(`https://publicreporting.cftc.gov/resource/gpe5-46if.json?$limit=60&$order=report_date_as_yyyy_mm_dd%20DESC&$where=cftc_contract_market_code%20in(${COT.map((c) => `'${c.code}'`).join(',')})`, 'cftc', 12000);
      cot = COT.map((c) => { const r = rows.find((x) => x.cftc_contract_market_code === c.code); if (!r) return null; const n = (k: string) => Number(r[k]) || 0;
        return { label: c.label, date: String(r.report_date_as_yyyy_mm_dd).slice(0, 10), assetNet: n('asset_mgr_positions_long') - n('asset_mgr_positions_short'), levNet: n('lev_money_positions_long') - n('lev_money_positions_short'), levNetChg: n('change_in_lev_money_long') - n('change_in_lev_money_short'), oi: n('open_interest_all') }; }).filter(Boolean) as typeof cot;
    } catch (e) { errors.cot = (e as Error).message.slice(0, 80); }
    const spy = proxies.find((p) => p.sym === 'SPY');
    return { ladder, moodys, proxies, hy: hd, divergence: divergence(hd.last, hd.m1, spy?.m1 ?? null), cot, errors };
  });
  return json({ ...val, asOf: Date.now(), source: "FRED (ICE BofA indices by rating, Moody's Aaa/Baa yields), ETF prices from Yahoo Finance (unofficial), CFTC Traders in Financial Futures" }, { sMaxAge: 1800 });
}

const SEC_H = () => ({ 'user-agent': key('sec'), 'accept-encoding': 'gzip, deflate' });
const day = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
async function efts(q: string, forms: string, fromDays: number) {
  if (!take('sec')) throw new Error('rate limited');
  const j = await getJson(`https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${q}"`)}&forms=${forms}&dateRange=custom&startdt=${day(fromDays)}&enddt=${day(0)}`, 'sec', 12000, { headers: SEC_H() });
  const hits = (j?.hits?.hits ?? []).map((h: any) => ({ who: String(h._source?.display_names?.[0] ?? '').replace(/\s*\(CIK \d+\)/, ''), date: h._source?.file_date, form: h._source?.form ?? h._source?.root_forms?.[0], url: `https://www.sec.gov/Archives/edgar/data/${parseInt(h._source?.ciks?.[0] ?? '0', 10)}/${String(h._source?.adsh ?? '').replace(/-/g, '')}/${String(h._id ?? '').split(':')[1] ?? ''}` }));
  const uniq = [...new Map(hits.map((h: any) => [h.who, h])).values()];
  return { total: Number(j?.hits?.total?.value) || 0, hits: uniq.slice(0, 15) };
}
const lastFact = (facts: any, tags: string[]): { val: number; end: string; tag: string } | null => {
  let best: { val: number; end: string; tag: string } | null = null;
  for (const tag of tags) for (const ns of ['us-gaap', 'dei']) for (const u of Object.values(facts?.facts?.[ns]?.[tag]?.units ?? {}) as any[][]) for (const f of u) if (f.form?.startsWith('10-') && (!best || f.end > best.end)) best = { val: Number(f.val), end: f.end, tag };
  return best;
};

export async function credlook(req: Request): Promise<Response> {
  const u = new URL(req.url), q = (u.searchParams.get('q') ?? '').trim().slice(0, 60), ticker = (u.searchParams.get('ticker') ?? '').trim().toUpperCase().slice(0, 10);
  if (!q && !ticker) return json({ error: 'q or ticker needed' }, { status: 400 });
  if (!hasKey('sec')) return json({ error: 'needs SEC_USER_AGENT (a contact email SEC asks automated tools to send)' }, { status: 400 });
  const errors: Record<string, string> = {};
  const { val } = await cached(`credlook:${q}:${ticker}`, 6 * 3600, async () => {
    const [funds, lenders] = await Promise.all([
      q ? efts(q, 'NPORT-P', 200).catch((e) => { errors.funds = (e as Error).message.slice(0, 80); return null; }) : null,
      q ? efts(q, '10-Q,10-K', 200).catch((e) => { errors.lenders = (e as Error).message.slice(0, 80); return null; }) : null,
    ]);
    let company: any = null;
    if (ticker && /^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker)) {
      try {
        const map = await getJson('https://www.sec.gov/files/company_tickers.json', 'sec', 12000, { headers: SEC_H() });
        const row: any = Object.values(map ?? {}).find((x: any) => x.ticker === ticker);
        if (!row) throw new Error('ticker not found at SEC');
        const facts = await getJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(row.cik_str).padStart(10, '0')}.json`, 'sec', 20000, { headers: SEC_H() });
        const shares = lastFact(facts, ['EntityCommonStockSharesOutstanding', 'CommonStockSharesOutstanding']);
        const total = lastFact(facts, ['DebtLongtermAndShorttermCombinedAmount', 'DebtInstrumentCarryingAmount', 'LongTermDebt', 'LongTermNotesPayable', 'LongTermDebtNoncurrent']);
        const st = lastFact(facts, ['DebtCurrent', 'LongTermDebtCurrent', 'NotesPayableCurrent', 'ShortTermBorrowings', 'CommercialPaper']);
        const lt = total ? { ...total, val: Math.max(0, total.val - (st && st.end >= total.end ? st.val : 0)) } : null;
        const M = [['next 12 months', 'LongTermDebtMaturitiesRepaymentsOfPrincipalInNextTwelveMonths'], ['year 2', 'LongTermDebtMaturitiesRepaymentsOfPrincipalInYearTwo'], ['year 3', 'LongTermDebtMaturitiesRepaymentsOfPrincipalInYearThree'], ['year 4', 'LongTermDebtMaturitiesRepaymentsOfPrincipalInYearFour'], ['year 5', 'LongTermDebtMaturitiesRepaymentsOfPrincipalInYearFive'], ['after year 5', 'LongTermDebtMaturitiesRepaymentsOfPrincipalAfterYearFive']];
        const maturities = M.map(([label, tag]) => { const f = lastFact(facts, [tag]); return f ? { label, val: f.val, end: f.end } : null; }).filter(Boolean);
        const hist = ((Object.values(facts?.facts?.['us-gaap']?.[total?.tag ?? 'LongTermDebt']?.units ?? {})[0] as any[]) ?? []).filter((f) => f.form?.startsWith('10-')).map((f) => [f.end, Number(f.val)] as [string, number]);
        const series = [...new Map(hist.sort((a, b) => a[0].localeCompare(b[0]))).entries()].slice(-12);
        const c = (await spark([ticker])).get(ticker) ?? [];
        const px = c.at(-1) ?? null, vol = annVol(c);
        const eq = px && shares ? px * shares.val : null;
        company = { name: row.title, cik: row.cik_str, price: px, vol, equity: eq, shares, totalDebt: total, ltDebt: lt, stDebt: st, maturities, debtHistory: series, merton: eq && vol ? merton(eq, st?.val ?? 0, lt?.val ?? 0, vol) : null };
      } catch (e) { errors.company = (e as Error).message.slice(0, 100); }
    }
    return { funds, lenders, company };
  });
  return json({ q, ticker, ...val, errors, asOf: Date.now(), source: 'SEC EDGAR full-text search (N-PORT fund holdings, 10-Q / 10-K incl. BDC loan schedules), SEC XBRL company facts, Yahoo Finance prices (unofficial)' }, { sMaxAge: 3600 });
}
