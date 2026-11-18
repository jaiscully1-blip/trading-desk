// Market Plumbing routes (through /api/research):
//   fn=plumb&symbol=HOOD  short volume (FINRA daily, last 10 sessions), off-exchange share (FINRA weekly ATS + OTC), fails to deliver
//                         (SEC, last two files), borrow fee / availability (Interactive Brokers file saved daily by the GitHub Action),
//                         unusual options (Cboe delayed), buybacks and share count (SEC XBRL), dilution filings (S-3 shelves, 424B)
//   fn=plumbmkt           index rebalance calendar, IPO lockups ending soon, recent merger proxies and tender offers (EDGAR search)
import { inflateRawSync } from 'node:zlib';
import { cached, getJson, hasKey, json, take } from '../core.js';
import { secJson } from '../adapters.js';
import { parseSecTickers } from '../../../shared/company.js';
import { parseCboe } from '../../../shared/gamma.js';
import { lockupEnd, parseDisplayName, parseFtd, parseShortVol, rebalanceCalendar, unusualOptions } from '../../../shared/plumbing.js';

const REPO = process.env.GITHUB_REPO || 'jaiscully1-blip/trading-desk';
const SYM = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const SEC_UA = () => ({ 'user-agent': process.env.SEC_USER_AGENT || 'trade-desk-research/0.1 (personal project)' });

async function bytes(url: string, headers: Record<string, string> = {}, ms = 20000): Promise<Buffer> {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
/** First file inside a zip (central directory), inflated. */
function unzipFirst(buf: Buffer): Buffer {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip');
  const cd = buf.readUInt32LE(e + 16);
  const method = buf.readUInt16LE(cd + 10), size = buf.readUInt32LE(cd + 20), local = buf.readUInt32LE(cd + 42);
  const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const data = buf.subarray(start, start + size);
  return method === 0 ? data : inflateRawSync(data);
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const tradingDaysBack = (n: number) => { const out: string[] = []; const d = new Date(); while (out.length < n) { d.setUTCDate(d.getUTCDate() - 1); const w = d.getUTCDay(); if (w && w !== 6) out.push(ymd(d).replace(/-/g, '')); } return out; };

async function shortVolume(sym: string) {
  const rows: { date: string; short: number; total: number }[] = [];
  for (const d of tradingDaysBack(12)) {
    try {
      const { val } = await cached(`shvol:${d}`, 24 * 3600, async () => { if (!take('finra')) throw new Error('budget'); return Object.fromEntries(parseShortVol((await bytes(`https://cdn.finra.org/equity/regsho/daily/CNMSshvol${d}.txt`)).toString('utf8'))); });
      const r = (val as Record<string, { short: number; total: number }>)[sym];
      if (r) rows.push({ date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`, ...r });
    } catch { /* holiday or not out yet */ }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

async function offExchange(sym: string) {
  const start = ymd(new Date(Date.now() - 200 * 86400_000));
  const one = async (code: string) => {
    const r = await fetch('https://api.finra.org/data/group/otcMarket/name/weeklySummary', {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ limit: 100, compareFilters: [{ compareType: 'EQUAL', fieldName: 'issueSymbolIdentifier', fieldValue: sym }, { compareType: 'EQUAL', fieldName: 'tierIdentifier', fieldValue: 'T1' }, { compareType: 'EQUAL', fieldName: 'summaryTypeCode', fieldValue: code }], dateRangeFilters: [{ fieldName: 'weekStartDate', startDate: start, endDate: ymd(new Date()) }] }),
    });
    const j = await r.json().catch(() => []);
    return (Array.isArray(j) ? j : []).map((x: any) => ({ week: String(x.weekStartDate), shares: Number(x.totalWeeklyShareQuantity) || 0 }));
  };
  if (!take('finra', 2)) throw new Error('budget');
  const [ats, otc] = await Promise.all([one('ATS_W_SMBL'), one('OTC_W_SMBL')]);
  const weeks = [...new Set([...ats, ...otc].map((x) => x.week))].sort();
  return weeks.map((w) => ({ week: w, ats: ats.find((x) => x.week === w)?.shares ?? 0, otc: otc.find((x) => x.week === w)?.shares ?? 0 }));
}

async function ftds(sym: string) {
  const page = (await cached('ftd:list', 24 * 3600, async () => { const r = await fetch('https://www.sec.gov/data-research/sec-markets-data/fails-deliver-data', { headers: SEC_UA(), signal: AbortSignal.timeout(15000) }); return r.text(); })).val;
  const files = [...new Set(page.match(/cnsfails\d{6}[ab]\.zip/g) ?? [])].sort().reverse().slice(0, 2);
  const out: { date: string; qty: number; price: number | null }[] = [];
  for (const f of files) {
    const { val } = await cached(`ftd:${f}`, 7 * 86400, async () => { if (!take('sec')) throw new Error('budget'); return unzipFirst(await bytes(`https://www.sec.gov/files/data/fails-deliver-data/${f}`, SEC_UA(), 30000)).toString('latin1'); });
    out.push(...parseFtd(val, sym));
  }
  return { files, rows: out.sort((a, b) => a.date.localeCompare(b.date)) };
}

async function secBits(sym: string) {
  if (!hasKey('sec')) return null;
  const tickers = (await cached('sec:tickers', 86400, async () => parseSecTickers(await secJson('https://www.sec.gov/files/company_tickers.json')))).val;
  const cik = tickers.find((t) => t.ticker === sym)?.cik;
  if (!cik) return null;
  const c10 = String(cik).padStart(10, '0');
  const concept = async (tax: string, tag: string) => { try { return (await cached(`cc:${c10}:${tag}`, 24 * 3600, () => secJson(`https://data.sec.gov/api/xbrl/companyconcept/CIK${c10}/${tax}/${tag}.json`))).val; } catch { return null; } };
  const [buy, shares, sub] = await Promise.all([
    concept('us-gaap', 'PaymentsForRepurchaseOfCommonStock'), concept('dei', 'EntityCommonStockSharesOutstanding'),
    cached(`sub:${cik}`, 6 * 3600, () => secJson(`https://data.sec.gov/submissions/CIK${c10}.json`)).then((r) => r.val).catch(() => null),
  ]);
  const usd: any[] = buy?.units?.USD ?? [];
  const quarterly = usd.filter((x) => x.form && /10-[QK]/.test(x.form) && x.frame && /Q\d$/.test(x.frame)).map((x) => ({ period: x.frame as string, end: x.end as string, value: Number(x.val) }));
  const annual = usd.filter((x) => x.frame && /^CY\d{4}$/.test(x.frame)).map((x) => ({ period: x.frame as string, end: x.end as string, value: Number(x.val) }));
  const sh: any[] = shares?.units?.shares ?? [];
  const shareCount = [...new Map(sh.map((x) => [x.end, { end: x.end as string, value: Number(x.val) }])).values()].sort((a, b) => a.end.localeCompare(b.end)).slice(-12);
  const r = sub?.filings?.recent ?? {}, n = Array.isArray(r.form) ? r.form.length : 0, since = ymd(new Date(Date.now() - 2 * 365 * 86400_000));
  const dilution: { date: string; form: string; url: string }[] = [];
  for (let i = 0; i < n; i++) {
    const f = String(r.form[i]);
    if (r.filingDate[i] < since || !/^(S-3|S-3ASR|F-3|F-3ASR|424B[1-5]|S-1|S-8)$/.test(f)) continue;
    dilution.push({ date: r.filingDate[i], form: f, url: `https://www.sec.gov/Archives/edgar/data/${cik}/${String(r.accessionNumber[i]).replace(/-/g, '')}/${r.primaryDocument[i]}` });
  }
  return { cik, buybacks: { quarterly: quarterly.slice(-12), annual: annual.slice(-5) }, shareCount, dilution: dilution.slice(0, 30) };
}

async function borrow(sym: string) {
  const get = async (f: string) => { if (!process.env.VERCEL) { try { const fs = await import('node:fs'); return JSON.parse(fs.readFileSync(`published/${f}`, 'utf8')); } catch { /* fall through */ } } return (await cached(`pub:${f}`, 3600, () => getJson(`https://raw.githubusercontent.com/${REPO}/main/published/${f}`, 'github', 15000))).val; };
  const [latest, hist] = await Promise.all([get('borrow-latest.json').catch(() => null), get('borrow-hist.json').catch(() => null)]);
  const now = latest?.rows?.[sym] ?? null;
  const s = hist?.days ? Object.entries(hist.days as Record<string, Record<string, number>>).sort((a, b) => a[0].localeCompare(b[0])).flatMap(([d, m]) => (m[sym] != null ? [{ date: d, value: m[sym] }] : [])) : [];
  return { date: latest?.date ?? null, fee: now?.[0] ?? null, rebate: now?.[1] ?? null, available: now?.[2] ?? null, history: s, top: latest?.top ?? [] };
}

async function options(sym: string) {
  const { val } = await cached(`optu:${sym}`, 1800, async () => { if (!take('cboe')) throw new Error('budget'); return parseCboe(await getJson(`https://cdn.cboe.com/api/global/delayed_quotes/options/${sym}.json`, 'cboe', 25000), sym); });
  const vol = val.contracts.reduce((s, c) => s + c.vol, 0), callVol = val.contracts.filter((c) => c.cp === 'C').reduce((s, c) => s + c.vol, 0);
  return { spot: val.spot, asOf: val.asOf, totalVolume: vol, putCall: callVol ? (vol - callVol) / callVol : null, unusual: unusualOptions(val.contracts) };
}

export async function plumb(req: Request): Promise<Response> {
  const sym = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!SYM.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  const errors: Record<string, string> = {};
  const safe = async <T,>(k: string, f: () => Promise<T>): Promise<T | null> => { try { return await f(); } catch (e) { errors[k] = (e as Error).message.slice(0, 120); return null; } };
  const [short, off, ftd, sec, bor, opt] = await Promise.all([
    safe('short', () => shortVolume(sym)), safe('offExchange', () => offExchange(sym)), safe('ftd', () => ftds(sym)),
    safe('sec', () => secBits(sym)), safe('borrow', () => borrow(sym)), safe('options', () => options(sym)),
  ]);
  return json({ sym, short, off, ftd, sec, borrow: bor, options: opt, errors, asOf: Date.now() }, { sMaxAge: 900 });
}

export async function plumbmkt(): Promise<Response> {
  const errors: Record<string, string> = {};
  const efts = async (forms: string, q: string, from: string, to: string) => {
    const { val } = await cached(`efts:${forms}:${q}:${from}:${to}`, 12 * 3600, async () => {
      if (!take('sec')) throw new Error('budget');
      const r = await fetch(`https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(q)}&forms=${forms}&dateRange=custom&startdt=${from}&enddt=${to}`, { headers: SEC_UA(), signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`EDGAR search HTTP ${r.status}`);
      return r.json();
    });
    return (val?.hits?.hits ?? []).map((h: any) => ({ ...parseDisplayName(String(h._source?.display_names?.[0] ?? '')), date: String(h._source?.file_date ?? ''), form: String(h._source?.form ?? forms), url: h._source?.ciks?.[0] && h._source?.adsh ? `https://www.sec.gov/Archives/edgar/data/${Number(h._source.ciks[0])}/${String(h._source.adsh).replace(/-/g, '')}/` : null }));
  };
  const day = (n: number) => ymd(new Date(Date.now() - n * 86400_000));
  let lockups: any[] = [], mergers: any[] = [];
  try {
    const ipos = await efts('424B4', '"initial public offering"', day(200), day(140));
    const seen = new Set<string>();
    lockups = ipos.filter((x: any) => x.ticker && !seen.has(x.ticker) && seen.add(x.ticker)).map((x: any) => ({ ...x, ipo: x.date, lockupEnds: lockupEnd(x.date) })).filter((x: any) => x.lockupEnds >= day(7)).sort((a: any, b: any) => a.lockupEnds.localeCompare(b.lockupEnds));
  } catch (e) { errors.lockups = (e as Error).message; }
  try {
    const [proxies, tenders] = await Promise.all([efts('DEFM14A', 'merger', day(90), day(0)), efts('SC TO-T', 'tender offer', day(60), day(0))]);
    const seen = new Set<string>();
    mergers = [...proxies.map((x: any) => ({ ...x, kind: 'Merger vote (DEFM14A)' })), ...tenders.map((x: any) => ({ ...x, kind: 'Tender offer (SC TO-T)' }))].filter((x: any) => { const k = `${x.name}:${x.kind}`; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a: any, b: any) => b.date.localeCompare(a.date)).slice(0, 40);
  } catch (e) { errors.mergers = (e as Error).message; }
  return json({ rebalances: rebalanceCalendar(new Date().getUTCFullYear()).filter((r) => r.date >= day(30)).slice(0, 10), lockups, mergers, errors, source: 'Index calendars computed from each provider\'s published schedule; IPOs, merger proxies and tender offers from SEC EDGAR full-text search' }, { sMaxAge: 3600 });
}
