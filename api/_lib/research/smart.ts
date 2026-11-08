// Smart money endpoints (all free):
//   GET /api/research?fn=13f&cik=1067983  -> latest 13F holdings vs the quarter before (SEC EDGAR)
//   GET /api/research?fn=ark               -> ARK's daily buys/sells over the last ~30 days (arkfunds.io)
//   GET /api/research?fn=politician&id=P000197 -> one member's disclosed trades (Alpha Vantage CONGRESS_TRADES)
import { ARK_FUNDS, FUNDS, arkNet, diff13F, normName, parse13F, parseArkTrades, parsePolTrades, polBook, type F13Row } from '../../../shared/smartmoney.js';
import { parseSecTickers } from '../../../shared/company.js';
import { MEMBERS } from '../../../shared/data/congress.js';
import { secJson, secText } from '../adapters.js';
import { cached, getCached, getJson, hasKey, json, key, setCached, take } from '../core.js';

const pad = (cik: string) => cik.padStart(10, '0');

async function filings(cik: string) {
  const j = await secJson(`https://data.sec.gov/submissions/CIK${pad(cik)}.json`);
  const r = j?.filings?.recent ?? {};
  const out: { acc: string; filed: string; period: string }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < (r.form?.length ?? 0); i++) {
    if (r.form[i] !== '13F-HR') continue; // amendments (13F-HR/A) are usually small add-ons; skip
    const period = String(r.reportDate[i] ?? '');
    if (seen.has(period)) continue;
    seen.add(period);
    out.push({ acc: String(r.accessionNumber[i]), filed: String(r.filingDate[i]), period });
    if (out.length === 2) break;
  }
  return { name: String(j?.name ?? ''), filings: out };
}

async function infoTable(cik: string, acc: string, filed: string): Promise<F13Row[]> {
  const dir = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc.replace(/-/g, '')}`;
  const idx = await secJson(`${dir}/index.json`);
  const items: { name: string; size?: string }[] = idx?.directory?.item ?? [];
  const xmls = items.filter((i) => /\.xml$/i.test(i.name) && !/primary_doc/i.test(i.name));
  const pick = xmls.find((i) => /info|table/i.test(i.name)) ?? xmls.sort((a, b) => Number(b.size ?? 0) - Number(a.size ?? 0))[0];
  if (!pick) throw new Error('no information table in filing');
  // filings before 2023 reported values in thousands of dollars
  return parse13F(await secText(`${dir}/${pick.name}`, 25000), filed < '2023-01-03');
}

/** CUSIP -> ticker via OpenFIGI (keyless: 10 per request), then by issuer name against SEC's ticker list. */
async function tickers(rows: { cusip: string; name: string }[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const todo = rows.filter((r) => { const hit = getCached<string>(`figi:${r.cusip}`); if (hit) { if (hit.val) out[r.cusip] = hit.val; return false; } return true; });
  for (let i = 0; i < todo.length; i += 10) {
    const batch = todo.slice(i, i + 10);
    if (!take('openfigi')) break;
    try {
      const res: any[] = await getJson('https://api.openfigi.com/v3/mapping', 'openfigi', 10000, { method: 'POST', body: JSON.stringify(batch.map((r) => ({ idType: 'ID_CUSIP', idValue: r.cusip, exchCode: 'US' }))) });
      batch.forEach((r, k) => {
        const d = res?.[k]?.data?.find((x: any) => x.marketSector === 'Equity') ?? res?.[k]?.data?.[0];
        const t = d?.ticker ? String(d.ticker).replace('/', '.').toUpperCase() : '';
        if (t) out[r.cusip] = t;
        setCached(`figi:${r.cusip}`, t, 30 * 86400);
      });
    } catch { break; }
  }
  const missing = rows.filter((r) => !out[r.cusip]);
  if (missing.length && hasKey('sec')) {
    try {
      const list = (await cached('sec:tickers', 86400, async () => parseSecTickers(await secJson('https://www.sec.gov/files/company_tickers.json')))).val;
      const byName = new Map<string, string>();
      for (const t of list) { const k = normName(t.title); if (!byName.has(k)) byName.set(k, t.ticker); }
      for (const r of missing) { const t = byName.get(normName(r.name)); if (t) out[r.cusip] = t; }
    } catch { /* names only */ }
  }
  return out;
}

async function thirteenF(req: Request): Promise<Response> {
  const cik = (new URL(req.url).searchParams.get('cik') ?? '').replace(/^0+/, '');
  if (!cik) return json({ funds: FUNDS });
  if (!/^\d{1,10}$/.test(cik)) return json({ error: 'bad cik' }, { status: 400 });
  if (!hasKey('sec')) return json({ error: 'needs SEC_USER_AGENT' }, { status: 400 });
  try {
    const { val, stale } = await cached(`13f:${cik}`, 12 * 3600, async () => {
      const f = await filings(cik);
      if (!f.filings.length) throw new Error(`${f.name || 'This filer'} has no 13F-HR filings`);
      const [cur, prev] = await Promise.all(f.filings.map((x) => infoTable(cik, x.acc, x.filed)));
      const pos = diff13F(cur, prev ?? null);
      const want = [...pos.filter((p) => p.change !== 'sold').slice(0, 60), ...pos.filter((p) => p.change === 'sold').sort((a, b) => b.prevValue - a.prevValue).slice(0, 25)];
      const map = await tickers(want);
      const total = cur.reduce((s, r) => s + r.value, 0);
      return {
        cik, filer: f.name, period: f.filings[0].period, filed: f.filings[0].filed, prevPeriod: f.filings[1]?.period ?? null, total, count: cur.length,
        positions: want.map((p) => ({ ...p, sym: map[p.cusip] ?? null })),
        url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=13F-HR`,
      };
    });
    return json({ ...val, stale, asOf: Date.now(), source: 'SEC EDGAR Form 13F-HR; tickers via OpenFIGI' }, { sMaxAge: 12 * 3600, swr: 86400 });
  } catch (e) { return json({ cik, error: (e as Error).message }, { status: 502 }); }
}

async function ark(): Promise<Response> {
  const from = new Date(Date.now() - 35 * 86400_000).toISOString().slice(0, 10);
  try {
    const { val, stale } = await cached('ark:trades', 3600, async () => {
      if (!take('ark')) throw new Error('rate limit');
      return parseArkTrades(await getJson(`https://arkfunds.io/api/v2/etf/trades?symbol=${ARK_FUNDS.join(',')}&date_from=${from}`, 'ark', 15000));
    });
    return json({ trades: val.slice(0, 400), net: arkNet(val).slice(0, 40), stale, asOf: Date.now(), source: 'ARK Invest daily trade files via arkfunds.io' }, { sMaxAge: 3600 });
  } catch (e) { return json({ trades: [], net: [], error: (e as Error).message }, { status: 502 }); }
}

async function politician(req: Request): Promise<Response> {
  const id = (new URL(req.url).searchParams.get('id') ?? '').toUpperCase();
  if (!/^[A-Z]\d{6}$/.test(id)) return json({ error: 'bad member id' }, { status: 400 });
  if (!hasKey('alphavantage')) return json({ error: 'needs ALPHAVANTAGE_API_KEY' }, { status: 400 });
  const m = MEMBERS.find((x) => x[0] === id);
  try {
    const { val, stale } = await cached(`pol:${id}`, 12 * 3600, async () => {
      if (!take('alphavantage')) throw new Error('Alpha Vantage daily budget (25 calls) used up; try again tomorrow');
      const j = await getJson(`https://www.alphavantage.co/query?function=CONGRESS_TRADES&bioguide_id=${id}&apikey=${key('alphavantage')}`, 'alphavantage', 20000);
      if (j?.Note || j?.Information) throw new Error(String(j.Note || j.Information).slice(0, 140));
      return parsePolTrades(j);
    });
    return json({ id, name: m?.[1] ?? val.name, party: m?.[2] ?? val.party, state: m?.[3] ?? val.state, chamber: m?.[4] ?? '', trades: val.trades.slice(0, 300), book: polBook(val.trades), stale, asOf: Date.now(), source: 'Alpha Vantage CONGRESS_TRADES (House Clerk + Senate eFD disclosures)' }, { sMaxAge: 12 * 3600, swr: 86400 });
  } catch (e) { return json({ id, error: (e as Error).message }, { status: 502 }); }
}

export const SMART_ROUTES = { '13f': thirteenF, ark: () => ark(), politician };
