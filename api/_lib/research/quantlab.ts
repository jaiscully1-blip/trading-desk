// GET /api/research?fn=quantlab&symbol=COST -> what the Quant Lab needs to test relationships for one stock:
// month-end closes (dividend-adjusted when Yahoo has them) for the stock and a fixed factor basket, plus quarterly
// fundamentals from SEC XBRL filings. Yahoo is unofficial; SEC is official. Cached: factors for 12 h, the stock for 6 h.
import { parseSecTickers } from '../../../shared/company.js';
import { fundSeries } from '../../../shared/fundseries.js';
import { inflateRawSync } from 'node:zlib';
import { FACTORS, parseFrench, type FFMonth } from '../../../shared/quantlab.js';
import { secJson } from '../adapters.js';
import { SYMBOL_RE, cached, getJson, hasKey, json } from '../core.js';

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
