// GET /api/research?fn=quantlab&symbol=COST -> what the Quant Lab needs to test relationships for one stock:
// month-end closes (dividend-adjusted when Yahoo has them) for the stock and a fixed factor basket, plus quarterly
// fundamentals from SEC XBRL filings. Yahoo is unofficial; SEC is official. Cached: factors for 12 h, the stock for 6 h.
import { parseSecTickers } from '../../../shared/company.js';
import { fundSeries } from '../../../shared/fundseries.js';
import { inflateRawSync } from 'node:zlib';
import { FACTORS, parseFrench, type FFMonth } from '../../../shared/quantlab.js';
import { CFPB_CO, FDA_FIRM, LIVE_TICKERS, NHTSA_MFR, STEAM_GAMES, countByQuarter, fdaDate, quarterRange, steamQuarterly, type LiveBlock, type QPoint } from '../../../shared/livefeeds.js';
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

// GET /api/research?fn=qlfeeds&symbol=JPM -> live customer-voice feeds for the ticker, where one is mapped:
// Steam reviews, CFPB complaints, NHTSA recalls, openFDA recalls. Each block lists quarterly series for the
// relationship finder, dated events for the event study, and the latest readings.
const pct1 = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`;
async function steamBlock(games: [number, string][]): Promise<LiveBlock> {
  const hist = await Promise.all(games.map(async ([id]) => { try { const j = await getJson(`https://store.steampowered.com/appreviewhistogram/${id}?l=english&review_score_preference=0`, 'steam', 10000); return { rollups: j?.results?.rollups ?? [] }; } catch { return { rollups: [] }; } }));
  const { pos, vol } = steamQuarterly(hist);
  const last = pos[pos.length - 1], yago = pos.find((p) => p[0] === `${+(last?.[0] ?? '0').slice(0, 4) - 1}${(last?.[0] ?? '').slice(4)}`);
  return { kind: 'Steam reviews', source: `Steam store review histograms for ${games.map((g) => g[1]).join(', ')}`, events: [],
    series: [{ id: 'lv:steam:pos', label: 'Steam % positive (change)', group: 'Live feeds', source: 'Steam', points: pos }, { id: 'lv:steam:vol', label: 'Steam review volume', group: 'Live feeds', source: 'Steam', points: vol }],
    latest: last ? [{ label: `Players positive, ${last[0]}`, value: `${last[1].toFixed(0)}%`, note: yago ? `${(last[1] - yago[1]) >= 0 ? '+' : ''}${(last[1] - yago[1]).toFixed(1)} pts vs a year ago` : undefined }, { label: 'Reviews that quarter', value: (vol[vol.length - 1]?.[1] ?? 0).toLocaleString() }] : [] };
}
async function cfpbBlock(name: string): Promise<LiveBlock> {
  const qs = quarterRange(2012), out: QPoint[] = [];
  for (let i = 0; i < qs.length; i += 10) await Promise.all(qs.slice(i, i + 10).map(async (r) => {
    try { const j = await getJson(`https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/?company=${encodeURIComponent(name)}&size=0&no_aggs=true&date_received_min=${r.from}&date_received_max=${r.to}`, 'cfpb', 12000); const v = Number(j?.hits?.total?.value); if (Number.isFinite(v)) out.push([r.q, v]); } catch { /* skip quarter */ }
  }));
  out.sort((a, b) => a[0].localeCompare(b[0]));
  const last = out[out.length - 1], yago = out[out.length - 5];
  return { kind: 'CFPB complaints', source: `CFPB consumer complaint database (company: ${name})`, events: [],
    series: [{ id: 'lv:cfpb', label: 'Consumer complaints (yearly growth)', group: 'Live feeds', source: 'CFPB', points: out }],
    latest: last ? [{ label: `Complaints, ${last[0]}`, value: last[1].toLocaleString(), note: yago && yago[1] ? `${pct1((last[1] / yago[1] - 1) * 100)} vs a year ago` : undefined }] : [] };
}
async function nhtsaBlock(pats: string[]): Promise<LiveBlock> {
  const where = pats.map((p) => `upper(manufacturer) like '${p.replace(/'/g, "''")}'`).join(' OR ');
  const rows: any[] = await getJson(`https://data.transportation.gov/resource/6axg-epim.json?$select=report_received_date,potentially_affected,subject,component&$where=${encodeURIComponent(`(${where}) AND report_received_date >= '2005-01-01'`)}&$order=report_received_date DESC&$limit=5000`, 'nhtsa', 15000);
  const ev = rows.map((r) => ({ date: String(r.report_received_date ?? '').slice(0, 10), v: Number(r.potentially_affected) || 0, subject: String(r.subject ?? '') })).filter((r) => r.date);
  const { n, sum } = countByQuarter(ev), yr = ev.filter((r) => r.date >= new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10));
  const big = yr.slice().sort((a, b) => b.v - a.v)[0];
  return { kind: 'Vehicle recalls', source: 'NHTSA recalls (data.transportation.gov), by report date',
    series: [{ id: 'lv:nhtsa:n', label: 'Recalls filed (count, change)', group: 'Live feeds', source: 'NHTSA', points: n }, { id: 'lv:nhtsa:veh', label: 'Vehicles recalled (yearly growth)', group: 'Live feeds', source: 'NHTSA', points: sum }],
    events: ev.filter((r) => r.v >= 50000).map((r) => ({ date: r.date, group: r.v >= 500000 ? 'Huge recall (500k+ vehicles)' : 'Big recall (50k+ vehicles)', label: `${r.subject.slice(0, 70)} · ${r.v.toLocaleString()} vehicles` })),
    latest: [{ label: 'Recalls, last 12 months', value: String(yr.length), note: `${yr.reduce((a, r) => a + r.v, 0).toLocaleString()} vehicles` }, ...(big ? [{ label: 'Biggest', value: big.v.toLocaleString(), note: big.subject.slice(0, 60) }] : [])] };
}
async function fdaBlock(kind: 'food' | 'drug' | 'device', firm: string): Promise<LiveBlock> {
  const q = `recalling_firm:"${firm.replace(/ /g, '+')}"`;
  const j = await getJson(`https://api.fda.gov/${kind}/enforcement.json?search=${encodeURIComponent(q).replace(/%2B/g, '+')}&limit=1000&sort=report_date:desc`, 'openfda', 15000).catch((e) => { if (/404/.test((e as Error).message)) return { results: [] }; throw e; });
  const rows = ((j?.results ?? []) as any[]).map((r) => ({ date: fdaDate(String(r.report_date ?? '')), cls: String(r.classification ?? ''), what: String(r.product_description ?? '').slice(0, 70), why: String(r.reason_for_recall ?? '').slice(0, 80) })).filter((r) => r.date);
  const { n } = countByQuarter(rows), yr = rows.filter((r) => r.date >= new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10));
  return { kind: `FDA ${kind} recalls`, source: `openFDA ${kind} enforcement reports (recalling firm contains "${firm}")`,
    series: n.length >= 12 ? [{ id: 'lv:fda', label: `FDA ${kind} recalls (count, change)`, group: 'Live feeds', source: 'openFDA', points: n }] : [],
    events: rows.filter((r) => r.cls === 'Class I' || r.cls === 'Class II').map((r) => ({ date: r.date, group: r.cls === 'Class I' ? 'Class I recall (serious)' : 'Class II recall', label: `${r.what} · ${r.why}` })),
    latest: [{ label: 'Recalls, last 12 months', value: String(yr.length), note: `${yr.filter((r) => r.cls === 'Class I').length} Class I (most serious)` }, ...(rows[0] ? [{ label: `Latest, ${rows[0].date}`, value: rows[0].cls || '—', note: rows[0].what }] : [])] };
}
export async function qlfeeds(req: Request): Promise<Response> {
  const sym = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!SYMBOL_RE.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  const jobs: [string, () => Promise<LiveBlock>][] = [];
  if (STEAM_GAMES[sym]) jobs.push(['steam', () => steamBlock(STEAM_GAMES[sym])]);
  if (CFPB_CO[sym]) jobs.push(['cfpb', () => cfpbBlock(CFPB_CO[sym])]);
  if (NHTSA_MFR[sym]) jobs.push(['nhtsa', () => nhtsaBlock(NHTSA_MFR[sym])]);
  if (FDA_FIRM[sym]) jobs.push(['fda', () => fdaBlock(...FDA_FIRM[sym])]);
  const blocks = await Promise.all(jobs.map(async ([k, f]) => { try { return (await cached(`ql:feed:${k}:${sym}`, 12 * 3600, f)).val; } catch (e) { return { kind: k, source: '', series: [], events: [], latest: [], error: (e as Error).message.slice(0, 120) } as LiveBlock; } }));
  return json({ sym, blocks, covered: LIVE_TICKERS, asOf: Date.now() }, { sMaxAge: 3600 });
}
