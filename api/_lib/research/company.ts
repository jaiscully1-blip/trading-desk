// GET /api/company?symbol=NVDA -> company page: profile, peers, latest annual report, and (with a free Gemini key)
// products / suppliers / customers / competitors read from that report. Each report is read once and cached ~30 days.
import { GEMINI_SCHEMA, cleanCoName, cleanFacts, geminiPrompt, htmlToText, latestAnnual, latestShares, parseSecTickers, secProfile, tenKExcerpt, type CompanyFacts, type SecTicker, filingQuotes } from '../../../shared/company.js';
import { COMPANIES } from '../../../shared/data/companies.js';
import { QUOTE_CHAIN, finnhubPeers, finnhubProfile, geminiJson, secJson, secText, wikiSummary } from '../adapters.js';
import { getCached } from '../core.js';
import { SYMBOL_RE, cached, hasKey, json } from '../core.js';

// Reading a 10-K + one Gemini call can take ~20-40 s the first time (cached after that)

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const sym = (url.searchParams.get('symbol') ?? '').toUpperCase();
  // quick=1: everything except a first-time AI read of the 10-K, so the page can draw in a second or two
  const quick = url.searchParams.get('quick') === '1';
  if (!SYMBOL_RE.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  const errors: Record<string, string> = {};
  const safe = async <T,>(k: string, f: () => Promise<T>): Promise<T | null> => { try { return await f(); } catch (e) { errors[k] = (e as Error).message; return null; } };

  const [profile, peers, tickers] = await Promise.all([
    hasKey('finnhub') ? safe('profile', async () => (await cached(`prof:${sym}`, 7 * 86400, () => finnhubProfile(sym))).val) : null,
    hasKey('finnhub') ? safe('peers', async () => (await cached(`peers:${sym}`, 7 * 86400, () => finnhubPeers(sym))).val) : null,
    hasKey('sec') ? safe('sec', async () => (await cached('sec:tickers', 86400, async () => parseSecTickers(await secJson('https://www.sec.gov/files/company_tickers.json')))).val) : null,
  ]);
  const row = COMPANIES.find((c) => c[0] === sym);
  const cik = tickers?.find((t) => t.ticker === sym)?.cik;
  const cik10 = cik ? String(cik).padStart(10, '0') : '';
  // one SEC submissions read gives the newest annual report plus exchange, industry (SIC), HQ, website
  const sub = cik ? await safe('sec', async () => (await cached(`sec:sub:${cik}`, 86400, async () => {
    const j = await secJson(`https://data.sec.gov/submissions/CIK${cik10}.json`);
    return { filing: latestAnnual(j, cik), sec: secProfile(j) };
  })).val) : null;
  const filing = sub?.filing ?? null;
  const name = profile?.name ?? row?.[1] ?? (sub?.sec.name ? cleanCoName(sub.sec.name) : null) ?? tickers?.find((t) => t.ticker === sym)?.title ?? sym;
  // market cap when Finnhub has none (or is rate-limited): cover-page shares x latest price
  let marketCap = profile?.marketCap ?? null, capNote: string | null = null;
  if (marketCap == null && cik) {
    const sh = await safe('shares', async () => (await cached(`sec:shares:${cik}`, 7 * 86400, async () => latestShares(await secJson(`https://data.sec.gov/api/xbrl/companyconcept/CIK${cik10}/dei/EntityCommonStockSharesOutstanding.json`)))).val);
    const px = sh ? await safe('price', async () => (await cached(`q1:${sym}`, 300, async () => { for (const a of QUOTE_CHAIN) { try { const q = (await a.fetch([sym]))[0]; if (q?.last) return q.last; } catch { /* next */ } } return null; })).val) : null;
    if (sh && px) { marketCap = sh.shares * px; capNote = `shares on the ${sh.asOf} cover page × last price`; }
  }

  let facts: CompanyFacts | null = null, model: string | null = null;
  const factsKey = filing ? `facts:${filing.url}` : '';
  const factsReady = !!(factsKey && getCached(factsKey));
  // the filing text is read once and kept (excerpt only), so a failed AI read does not cost another SEC download and the
  // filing's own sentences about customers and suppliers are available with no AI at all
  let quotes: { customers: string[]; suppliers: string[] } | null = null;
  if (filing && (!quick || factsReady || getCached(`excerpt:${filing.url}`))) {
    const excerpt = await safe('filing', async () => (await cached(`excerpt:${filing.url}`, 30 * 86400, async () => tenKExcerpt(htmlToText(await secText(filing.url))))).val);
    if (excerpt) {
      quotes = filingQuotes(excerpt);
      if (hasKey('gemini')) {
        const r = await safe('gemini', async () => (await cached(factsKey, 30 * 86400, async () => {
          const out = await geminiJson(geminiPrompt(name, sym, excerpt), GEMINI_SCHEMA);
          return { facts: cleanFacts(out.data, sym, tickers as SecTicker[]), model: out.model };
        })).val);
        if (r) { facts = r.facts; model = r.model; }
      }
    }
  }
  const wiki = !facts?.summary ? await safe('wikipedia', async () => (await cached(`wiki:${name}`, 7 * 86400, () => wikiSummary(name))).val) : null;
  // peers from Finnhub get names from the SEC list so the diagram can label them
  const nameOf = (p: string) => COMPANIES.find((c) => c[0] === p)?.[1] ?? cleanCoName(tickers?.find((t) => t.ticker === p)?.title ?? p);
  const peerLinks = (peers ?? []).filter((p) => p !== sym).map((p) => ({ sym: p, name: nameOf(p) }));
  // every field falls back: Finnhub profile -> S&P 500 list (GICS) -> SEC submissions
  const about = {
    sector: row?.[2] ?? null,
    industry: row?.[3] ?? profile?.industry ?? sub?.sec.sic ?? null,
    exchange: profile?.exchange ?? sub?.sec.exchange ?? null,
    hq: row?.[4] ?? sub?.sec.hq ?? profile?.country ?? null,
    marketCap, capNote,
    web: profile?.web ?? (sub?.sec.website ? (/^https?:/.test(sub.sec.website) ? sub.sec.website : `https://${sub.sec.website}`) : null),
    fiscalYearEnd: sub?.sec.fiscalYearEnd ?? null, incorporated: sub?.sec.incorporated ?? null, sic: sub?.sec.sic ?? null,
  };
  // a rate limit on one source isn't worth showing when another filled the gap
  if (errors.profile && /429/.test(errors.profile) && about.industry && about.exchange) delete errors.profile;
  const pending = !!(quick && filing && hasKey('gemini') && !facts);
  return json(
    { sym, name, profile, about, peers: peerLinks, filing, facts, model, quotes, wiki, gemini: hasKey('gemini'), pending, errors, asOf: Date.now() },
    // a failed AI read must not sit on the CDN: only a complete answer is cached for long
    { sMaxAge: facts ? 86400 : pending || errors.gemini || errors.filing ? 0 : 600, swr: facts ? 7 * 86400 : 0 },
  );
}
