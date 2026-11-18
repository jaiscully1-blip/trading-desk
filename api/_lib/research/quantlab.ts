// GET /api/research?fn=quantlab&symbol=COST -> what the Quant Lab needs to test relationships for one stock:
// month-end closes (dividend-adjusted when Yahoo has them) for the stock and a fixed factor basket, plus quarterly
// fundamentals from SEC XBRL filings. Yahoo is unofficial; SEC is official. Cached: factors for 12 h, the stock for 6 h.
import { parseSecTickers } from '../../../shared/company.js';
import { fundSeries } from '../../../shared/fundseries.js';
import { inflateRawSync } from 'node:zlib';
import { FACTORS, parseFrench, type FFMonth } from '../../../shared/quantlab.js';
import { secJson } from '../adapters.js';
import { SYMBOL_RE, cached, getJson, hasKey, json, key } from '../core.js';

// Kenneth French's files are zips holding one CSV; read the first entry straight from the zip bytes.
async function frenchCsv(file: string): Promise<string> {
  const r = await fetch(`https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/${file}`, { headers: { 'user-agent': 'trading-desk research' } });
  if (!r.ok) throw new Error(`French library HTTP ${r.status}`);
  const b = Buffer.from(await r.arrayBuffer());
  if (b.readUInt32LE(0) !== 0x04034b50) throw new Error('not a zip');
  const method = b.readUInt16LE(8), size = b.readUInt32LE(18), start = 30 + b.readUInt16LE(26) + b.readUInt16LE(28);
  const body = b.subarray(start, size ? start + size : undefined);
  return (method === 8 ? inflateRawSync(body) : body).toString('latin1');
}
async function famaFrench(): Promise<FFMonth[]> {
  const [f5, mo] = await Promise.all([frenchCsv('F-F_Research_Data_5_Factors_2x3_CSV.zip'), frenchCsv('F-F_Momentum_Factor_CSV.zip')]);
  const a = parseFrench(f5, ['Mkt-RF', 'SMB', 'HML', 'RMW', 'CMA', 'RF']), m = parseFrench(mo, ['Mom']);
  const out: FFMonth[] = [];
  for (const [ym, v] of a) { const mm = m.get(ym)?.[0]; if (mm == null || ym < '199001' || v.some((x) => !Number.isFinite(x))) continue; out.push({ ym, mkt: v[0], smb: v[1], hml: v[2], rmw: v[3], cma: v[4], rf: v[5], mom: mm }); }
  return out;
}

type C = { t: number; c: number };
async function monthly(sym: string): Promise<C[]> {
  const y = sym.startsWith('^') ? sym : sym.replace('.', '-');
  const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?period1=946684800&period2=${Math.floor(Date.now() / 1000)}&interval=1mo`, 'yahoo', 12000, { headers: { 'user-agent': 'Mozilla/5.0 (trading-desk; personal use)' } });
  const r = j?.chart?.result?.[0]; if (!r) return [];
  const ts: number[] = r.timestamp ?? [], adj: (number | null)[] = r.indicators?.adjclose?.[0]?.adjclose ?? [], cl: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [];
  return ts.map((t, i) => ({ t: t * 1000, c: Number(adj[i] ?? cl[i]) })).filter((x) => Number.isFinite(x.c) && x.c > 0);
}

export async function quantlab(req: Request): Promise<Response> {
  const sym = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!SYMBOL_RE.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  try {
    const [stock, factors, fund, ff] = await Promise.all([
      cached(`ql2:m:${sym}`, 6 * 3600, () => monthly(sym)).then((x) => x.val),
      cached('ql2:factors', 12 * 3600, async () => {
        const out: Record<string, C[]> = {};
        for (let i = 0; i < FACTORS.length; i += 6) await Promise.all(FACTORS.slice(i, i + 6).map(async (f) => { try { out[f.sym] = await monthly(f.sym); } catch { out[f.sym] = []; } }));
        return out;
      }).then((x) => x.val),
      (async () => {
        if (!hasKey('sec')) return { error: 'SEC_USER_AGENT is not set, so earnings are left out.' };
        try {
          const tick = (await cached('sec:tickers', 86400, async () => parseSecTickers(await secJson('https://www.sec.gov/files/company_tickers.json')))).val;
          const t = tick.find((x) => x.ticker === sym || x.ticker === sym.replace('.', '-'));
          if (!t) return { error: `${sym} doesn't file 10-Qs with the SEC (foreign or a fund), so earnings are left out.` };
          return { name: t.title, quarterly: (await cached(`ql:fund:${t.cik}`, 86400, async () => fundSeries(await secJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(t.cik).padStart(10, '0')}.json`), 1, 80))).val.quarterly };
        } catch (e) { return { error: (e as Error).message.slice(0, 120) }; }
      })(),
      cached('ql:ff', 86400, famaFrench).then((x) => x.val).catch(() => [] as FFMonth[]),
    ]);
    if (stock.length < 24) return json({ error: `Not enough monthly price history for ${sym}.` }, { status: 404 });
    return json({ sym, stock, factors, fund, ff, asOf: Date.now(), source: 'Prices: Yahoo Finance monthly (unofficial, dividend-adjusted). Earnings: SEC XBRL 10-Q and 10-K filings (official). Factors: Kenneth French data library (monthly, about 2 months behind).' }, { sMaxAge: 3600 });
  } catch (e) { return json({ error: (e as Error).message.slice(0, 160) }, { status: 502 }); }
}

// GET /api/research?fn=qlevents&symbol=COST -> daily closes for the stock and SPY since 2005, plus dated earnings
// reports with the surprise (Alpha Vantage, when its key is set; otherwise SEC 10-Q/10-K filing dates, no surprise).
async function dailyCloses(sym: string): Promise<{ d: string; c: number }[]> {
  const y = sym.startsWith('^') ? sym : sym.replace('.', '-');
  const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?period1=1104537600&period2=${Math.floor(Date.now() / 1000)}&interval=1d`, 'yahoo', 15000, { headers: { 'user-agent': 'Mozilla/5.0 (trading-desk; personal use)' } });
  const r = j?.chart?.result?.[0]; if (!r) return [];
  const ts: number[] = r.timestamp ?? [], adj: (number | null)[] = r.indicators?.adjclose?.[0]?.adjclose ?? [], cl: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [], off = Number(r.meta?.gmtoffset ?? 0);
  return ts.map((t, i) => ({ d: new Date((t + off) * 1000).toISOString().slice(0, 10), c: Number(adj[i] ?? cl[i]) })).filter((x) => Number.isFinite(x.c) && x.c > 0);
}
type ERow = { date: string; eps: number | null; est: number | null; surprisePct: number | null; time?: string };
async function earningsRows(sym: string): Promise<{ rows: ERow[]; source: string }> {
  const num = (v: unknown) => { const n = Number(v); return v == null || v === 'None' || !Number.isFinite(n) ? null : n; };
  if (hasKey('alphavantage')) {
    try {
      const j = (await cached(`ql:avearn:${sym}`, 7 * 86400, () => getJson(`https://www.alphavantage.co/query?function=EARNINGS&symbol=${encodeURIComponent(sym)}&apikey=${key('alphavantage')}`, 'alphavantage', 12000))).val;
      const q = (j?.quarterlyEarnings ?? []) as any[];
      if (q.length) return { rows: q.map((r) => ({ date: String(r.reportedDate), eps: num(r.reportedEPS), est: num(r.estimatedEPS), surprisePct: num(r.surprisePercentage), time: r.reportTime })), source: 'Alpha Vantage earnings history (reported vs estimated EPS)' };
    } catch { /* fall through to SEC */ }
  }
  if (!hasKey('sec')) return { rows: [], source: 'No earnings source (SEC_USER_AGENT not set)' };
  const tick = (await cached('sec:tickers', 86400, async () => parseSecTickers(await secJson('https://www.sec.gov/files/company_tickers.json')))).val;
  const t = tick.find((x) => x.ticker === sym || x.ticker === sym.replace('.', '-')); if (!t) return { rows: [], source: 'Not an SEC filer' };
  const sub = (await cached(`ql:subs:${t.cik}`, 86400, () => secJson(`https://data.sec.gov/submissions/CIK${String(t.cik).padStart(10, '0')}.json`))).val;
  // 8-K item 2.02 ("Results of Operations") is the earnings press release itself, filed the day it comes out.
  // Older filings sit in extra pages; read up to three of them.
  const pages = [sub?.filings?.recent ?? {}];
  for (const fl of (sub?.filings?.files ?? []).slice(0, 3)) { try { pages.push((await cached(`ql:subs:${fl.name}`, 7 * 86400, () => secJson(`https://data.sec.gov/submissions/${fl.name}`))).val); } catch { /* skip */ } }
  const seen = new Set<string>(), rows: ERow[] = [];
  for (const f of pages) (f.form ?? []).forEach((form: string, i: number) => { const d = f.filingDate?.[i]; if (form === '8-K' && /2\.02/.test(f.items?.[i] ?? '') && d && !seen.has(d)) { seen.add(d); rows.push({ date: d, eps: null, est: null, surprisePct: null, time: (f.acceptanceDateTime?.[i] ?? '').slice(11, 13) >= '16' ? 'post-market' : undefined }); } });
  return { rows, source: 'SEC 8-K earnings releases (item 2.02), no analyst estimates: add an Alpha Vantage key to split beats from misses' };
}
export async function qlevents(req: Request): Promise<Response> {
  const sym = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!SYMBOL_RE.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  try {
    const [stock, spy, earn] = await Promise.all([
      cached(`ql:d:${sym}`, 6 * 3600, () => dailyCloses(sym)).then((x) => x.val),
      cached('ql:d:SPY', 6 * 3600, () => dailyCloses('SPY')).then((x) => x.val),
      earningsRows(sym).catch((e) => ({ rows: [] as ERow[], source: `Earnings unavailable: ${(e as Error).message.slice(0, 80)}` })),
    ]);
    if (stock.length < 300) return json({ error: `Not enough daily history for ${sym}.` }, { status: 404 });
    return json({ sym, stock, spy, earnings: earn.rows, earnSource: earn.source, asOf: Date.now(), source: 'Daily prices: Yahoo Finance (unofficial, dividend-adjusted).' }, { sMaxAge: 3600 });
  } catch (e) { return json({ error: (e as Error).message.slice(0, 160) }, { status: 502 }); }
}
