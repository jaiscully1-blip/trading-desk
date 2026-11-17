// Weekly cross-fund 13F patterns. Reads the latest two 13F-HR filings of every fund in shared/smartmoney.ts FUNDS, aggregates them
// (shared/f13agg.ts) and writes published/f13.json, which the desk shows on 13F Tracker -> Patterns. Run by .github/workflows/f13.yml, or by hand:
//   SEC_USER_AGENT="your-app contact@example.com" npx --yes tsx@4.19.2 scripts/f13-build.ts
// Optional: LIMIT=5 (first N funds, quick test), EXTRA_CIKS=123,456 (also include these filers). Free sources only (SEC EDGAR, OpenFIGI).
// Only funds whose latest quarter matches the most common latest quarter are counted; the rest are named in `skipped`. Nothing here can trade.
import { writeFileSync, mkdirSync } from 'node:fs';
import { FUNDS, normName, parse13F, type F13Row } from '../shared/smartmoney.js';
import { aggregate, type F13File, type FundSnap } from '../shared/f13agg.js';
import { parseSecTickers } from '../shared/company.js';

const UA = process.env.SEC_USER_AGENT;
if (!UA) { console.error('Set SEC_USER_AGENT (an app name and a contact email, as SEC asks).'); process.exit(1); }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let next = 0;
async function sec(url: string, as: 'json' | 'text' = 'json'): Promise<any> {
  const wait = next - Date.now(); next = Math.max(Date.now(), next) + 170; if (wait > 0) await sleep(wait); // SEC fair access: stay near 6 a second
  for (let a = 0; a < 3; a++) {
    const r = await fetch(url, { headers: { 'user-agent': UA!, 'accept-encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(90000) }).catch((e) => e as Error);
    if (r instanceof Error) { if (a === 2) throw r; await sleep(2000); continue; }
    if (r.status === 429 || r.status >= 500) { await sleep(3000 * (a + 1)); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url.slice(0, 90)}`);
    return as === 'json' ? r.json() : r.text();
  }
  throw new Error(`gave up ${url.slice(0, 90)}`);
}
const pad = (c: string) => c.padStart(10, '0');

async function two(cik: string) {
  const j = await sec(`https://data.sec.gov/submissions/CIK${pad(cik)}.json`);
  const r = j?.filings?.recent ?? {};
  const out: { acc: string; filed: string; period: string }[] = []; const seen = new Set<string>();
  for (let i = 0; i < (r.form?.length ?? 0) && out.length < 2; i++) {
    if (r.form[i] !== '13F-HR') continue;
    const period = String(r.reportDate[i] ?? ''); if (seen.has(period)) continue; seen.add(period);
    out.push({ acc: String(r.accessionNumber[i]), filed: String(r.filingDate[i]), period });
  }
  return { name: String(j?.name ?? ''), out };
}
async function table(cik: string, acc: string, filed: string): Promise<F13Row[]> {
  const dir = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc.replace(/-/g, '')}`;
  const items: { name: string; size?: string }[] = (await sec(`${dir}/index.json`))?.directory?.item ?? [];
  const xmls = items.filter((i) => /\.xml$/i.test(i.name) && !/primary_doc/i.test(i.name));
  const pick = xmls.find((i) => /info|table/i.test(i.name)) ?? xmls.sort((a, b) => Number(b.size ?? 0) - Number(a.size ?? 0))[0];
  if (!pick) throw new Error('no information table');
  return parse13F(await sec(`${dir}/${pick.name}`, 'text'), filed < '2023-01-03');
}

const limit = Number(process.env.LIMIT) || Infinity;
const funds = [...FUNDS.map((f) => ({ cik: f.cik, who: f.who, cat: f.cat ?? 'Other' })), ...(process.env.EXTRA_CIKS ?? '').split(',').filter(Boolean).map((c) => ({ cik: c.trim(), who: `CIK ${c.trim()}`, cat: 'Added' }))].slice(0, limit);
const skipped: Record<string, string> = {};
const got: FundSnap[] = [];
for (const f of funds) {
  try {
    const { out } = await two(f.cik);
    if (!out.length) { skipped[f.who] = 'no 13F-HR filings'; continue; }
    const cur = await table(f.cik, out[0].acc, out[0].filed);
    const prev = out[1] ? await table(f.cik, out[1].acc, out[1].filed).catch(() => null) : null;
    got.push({ cik: f.cik, who: f.who, cat: f.cat, period: out[0].period, cur, prev });
    console.log('ok', f.who, out[0].period, cur.length);
  } catch (e) { skipped[f.who] = (e as Error).message.slice(0, 120); console.log('skip', f.who, skipped[f.who]); }
}
// the most common latest quarter wins; funds still on an older quarter are left out so quarters never mix
const counts = new Map<string, number>(); for (const g of got) counts.set(g.period, (counts.get(g.period) ?? 0) + 1);
const period = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] ?? '';
const snaps = got.filter((g) => { if (g.period === period) return true; skipped[g.who] = `latest filing is ${g.period}, not ${period}`; return false; });

// first pass without tickers, to know which CUSIPs matter, then tickers for the top ones only
const first = aggregate(snaps, {}, 700).stocks;
const tick: Record<string, string> = {};
const batches: typeof first[] = []; for (let i = 0; i < first.length; i += 10) batches.push(first.slice(i, i + 10));
for (const b of batches) { // OpenFIGI, keyless: 25 requests a minute
  try {
    const r = await fetch('https://api.openfigi.com/v3/mapping', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b.map((s) => ({ idType: 'ID_CUSIP', idValue: s.cusip, exchCode: 'US' }))), signal: AbortSignal.timeout(20000) });
    if (r.ok) { const res: any[] = await r.json(); b.forEach((s, k) => { const d = res?.[k]?.data?.find((x: any) => x.marketSector === 'Equity') ?? res?.[k]?.data?.[0]; if (d?.ticker) tick[s.cusip] = String(d.ticker).replace('/', '.').toUpperCase(); }); }
  } catch { /* names only */ }
  await sleep(2600);
}
try { // fallback by issuer name against SEC's ticker list
  const list = parseSecTickers(await sec('https://www.sec.gov/files/company_tickers.json')); const by = new Map<string, string>();
  for (const t of list) { const k = normName(t.title); if (!by.has(k)) by.set(k, t.ticker); }
  for (const s of first) if (!tick[s.cusip]) { const t = by.get(normName(s.name)); if (t) tick[s.cusip] = t; }
} catch { /* ok */ }

const { stocks, fundStats } = aggregate(snaps, tick, 600);
const file: F13File = { built: new Date().toISOString(), period, funds: snaps.length, skipped, stocks, fundStats, source: 'SEC EDGAR Form 13F-HR (latest two quarters per fund); tickers via OpenFIGI and SEC' };
mkdirSync('published', { recursive: true });
writeFileSync('published/f13.json', JSON.stringify(file));
console.log(`wrote published/f13.json: ${snaps.length} funds, ${stocks.length} stocks, quarter ${period}, skipped ${Object.keys(skipped).length}`);
