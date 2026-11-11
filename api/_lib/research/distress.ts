// GET /api/research?fn=distress&symbols=XYZ,ABC -> the nightly distress read (published/distress.json from the GitHub Action,
// shape-checked), plus a live read for up to 6 of your tickers that are not in it, plus credit spreads from FRED.
// CALCULATED from public data: a screen for where to look, not a rating and not advice. Nothing here can trade.
import { parseDistressFile, priceStats, scoreCompany, type DistressRow, type GoingConcern } from '../../../shared/distress.js';
import { GC_PHRASES, eftsUrl, finFromCompanyFacts, fromSubmissions, insiderAgg, parseEfts, parseSpark, parseYahooRss, yahooSym } from '../../../shared/distressGather.js';
import { parseSecTickers } from '../../../shared/company.js';
import { parseForm4, type InsiderTx } from '../../../shared/insider.js';
import { fredHistory, getText, secJson, secText } from '../adapters.js';
import { SYMBOL_RE, cached, getJson, hasKey, json } from '../core.js';

const REPO = process.env.GITHUB_REPO || 'jaiscully1-blip/trading-desk';
const TOKEN = process.env.GITHUB_TOKEN;
const url = TOKEN ? `https://api.github.com/repos/${REPO}/contents/published/distress.json` : `https://raw.githubusercontent.com/${REPO}/main/published/distress.json`;
const init = TOKEN ? { headers: { authorization: `Bearer ${TOKEN}`, accept: 'application/vnd.github.raw+json', 'x-github-api-version': '2022-11-28' } } : undefined;

/** One ticker, live: SEC submissions + companyfacts + up to 4 Form 4s + going-concern search + Yahoo prices and headlines. */
async function liveRow(sym: string, cik: number, title: string, today: string): Promise<DistressRow> {
  const pad = String(cik).padStart(10, '0');
  const [subJ, facts, spark, rss] = await Promise.all([
    secJson(`https://data.sec.gov/submissions/CIK${pad}.json`),
    secJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${pad}.json`).catch(() => null),
    getJson(`https://query1.finance.yahoo.com/v8/finance/spark?symbols=${yahooSym(sym)}&range=1y&interval=1d`, 'yahoo', 8000, { headers: { 'user-agent': 'Mozilla/5.0 (trading-desk; personal use)' } }).catch(() => null),
    getText(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${yahooSym(sym)}&region=US&lang=en-US`).catch(() => null),
  ]);
  const s = fromSubmissions(subJ, cik, today);
  const txs: InsiderTx[] = [];
  await Promise.all(s.form4.slice(0, 4).map((f) => secText(f.url).then((x) => txs.push(...parseForm4(x, f.filed, f.index))).catch(() => {})));
  const gc = new Map<number, GoingConcern>();
  let gcOk = true;
  const from = new Date(Date.now() - 200 * 86400_000).toISOString().slice(0, 10);
  await Promise.all(GC_PHRASES.map((p) => secJson(eftsUrl(p, [cik], from, today)).then((j) => parseEfts(j, gc)).catch(() => { gcOk = false; })));
  const closes = spark ? parseSpark(spark, [sym]).get(sym) : undefined;
  return scoreCompany({
    sym, name: String(subJ?.name ?? title), sector: '', industry: String(subJ?.sicDescription ?? ''), hq: s.city ? `${s.city[0]}${s.city.slice(1).toLowerCase()}, ${s.state}` : '',
    state: s.state, lat: null, lon: null, fin: facts ? finFromCompanyFacts(facts) : null, events: s.events, late: s.late, goingConcern: gcOk ? gc.get(cik) ?? null : undefined,
    insiders: insiderAgg(txs, today), price: closes ? priceStats(closes) : null, shortVol: null, news: rss ? parseYahooRss(rss) : null,
  }, today);
}

async function credit() {
  if (!hasKey('fred')) return null;
  const one = async (id: string) => {
    const h = await fredHistory(id, 80);
    if (!h.length) return null;
    const last = h[h.length - 1], ago = h[Math.max(0, h.length - 64)];
    return { id, last: last.value, date: last.date, chg3m: last.value - ago.value };
  };
  const [hy, ccc] = await Promise.all([one('BAMLH0A0HYM2'), one('BAMLH0A3HYC')]);
  return { hy, ccc, source: 'FRED: ICE BofA US High Yield and CCC & lower option-adjusted spreads (percentage points)' };
}

export async function GET(req: Request): Promise<Response> {
  const want = (new URL(req.url).searchParams.get('symbols') ?? '').toUpperCase().split(',').map((s) => s.trim()).filter((s) => SYMBOL_RE.test(s)).slice(0, 40);
  const errors: Record<string, string> = {};
  let file = null;
  try {
    // local dev (npm run dev) reads the file the script just wrote; Vercel reads the one the Action committed
    const local = process.env.VERCEL ? null : await import('node:fs').then((fs) => JSON.parse(fs.readFileSync('published/distress.json', 'utf8'))).catch(() => null);
    const { val } = local ? { val: local } : await cached('distress:file', 900, () => getJson(url, 'github', 12000, init));
    const p = parseDistressFile(val);
    if (p.ok) file = p.file; else errors.file = `distress.json is malformed: ${p.error}`;
  } catch (e) {
    const m = (e as Error).message;
    errors.file = /404/.test(m) ? 'not-run-yet' : /HTTP 40[13]/.test(m) ? 'Repo is private: add GITHUB_TOKEN in Vercel (Contents read-only).' : m.slice(0, 160);
  }

  // your tickers that the nightly file does not cover
  const have = new Set(file?.rows.map((r) => r.sym) ?? []);
  const missing = want.filter((s) => !have.has(s)).slice(0, 6);
  const extras: DistressRow[] = [];
  if (missing.length && hasKey('sec')) {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const tickers = (await cached('sec:tickers', 86400, async () => parseSecTickers(await secJson('https://www.sec.gov/files/company_tickers.json')))).val;
      await Promise.all(missing.map(async (sym) => {
        const t = tickers.find((x) => x.ticker.replace(/-/g, '.') === sym);
        if (!t) return; // ETFs and foreign listings have no SEC filings to read
        try { extras.push((await cached(`distress:${sym}:${today}`, 6 * 3600, () => liveRow(sym, t.cik, t.title, today))).val); }
        catch (e) { errors[sym] = (e as Error).message.slice(0, 120); }
      }));
    } catch (e) { errors.extras = (e as Error).message.slice(0, 160); }
  } else if (missing.length) errors.extras = 'needs SEC_USER_AGENT for tickers outside the S&P 500';

  let cr = null;
  try { cr = (await cached('distress:credit', 6 * 3600, credit)).val; } catch (e) { errors.credit = (e as Error).message.slice(0, 120); }
  return json({ file, extras, credit: cr, errors, asOf: Date.now() }, { sMaxAge: file ? 900 : 60 });
}
