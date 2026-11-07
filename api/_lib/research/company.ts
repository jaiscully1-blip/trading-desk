// GET /api/company?symbol=NVDA -> company page: profile, peers, latest annual report, and (with a free Gemini key)
// products / suppliers / customers / competitors read from that report. Each report is read once and cached ~30 days.
import { GEMINI_SCHEMA, cleanFacts, geminiPrompt, htmlToText, latestAnnual, parseSecTickers, tenKExcerpt, type CompanyFacts, type SecTicker } from '../../../shared/company.js';
import { finnhubPeers, finnhubProfile, geminiJson, secJson, secText, wikiSummary } from '../adapters.js';
import { SYMBOL_RE, cached, hasKey, json } from '../core.js';

// Reading a 10-K + one Gemini call can take ~20-40 s the first time (cached after that)

export async function GET(req: Request): Promise<Response> {
  const sym = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!SYMBOL_RE.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  const errors: Record<string, string> = {};
  const safe = async <T,>(k: string, f: () => Promise<T>): Promise<T | null> => { try { return await f(); } catch (e) { errors[k] = (e as Error).message; return null; } };

  const [profile, peers, tickers] = await Promise.all([
    hasKey('finnhub') ? safe('profile', async () => (await cached(`prof:${sym}`, 7 * 86400, () => finnhubProfile(sym))).val) : null,
    hasKey('finnhub') ? safe('peers', async () => (await cached(`peers:${sym}`, 7 * 86400, () => finnhubPeers(sym))).val) : null,
    hasKey('sec') ? safe('sec', async () => (await cached('sec:tickers', 86400, async () => parseSecTickers(await secJson('https://www.sec.gov/files/company_tickers.json')))).val) : null,
  ]);
  const name = profile?.name ?? tickers?.find((t) => t.ticker === sym)?.title ?? sym;
  const cik = tickers?.find((t) => t.ticker === sym)?.cik;
  const filing = cik ? await safe('filing', async () => (await cached(`sec:annual:${cik}`, 86400, async () => latestAnnual(await secJson(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, '0')}.json`), cik))).val) : null;

  let facts: CompanyFacts | null = null, model: string | null = null;
  if (filing && hasKey('gemini')) {
    const r = await safe('gemini', async () => (await cached(`facts:${filing.url}`, 30 * 86400, async () => {
      const text = htmlToText(await secText(filing.url));
      const out = await geminiJson(geminiPrompt(name, sym, tenKExcerpt(text)), GEMINI_SCHEMA);
      return { facts: cleanFacts(out.data, sym, tickers as SecTicker[]), model: out.model };
    })).val);
    if (r) { facts = r.facts; model = r.model; }
  }
  const wiki = !facts?.summary ? await safe('wikipedia', async () => (await cached(`wiki:${name}`, 7 * 86400, () => wikiSummary(name))).val) : null;
  // peers from Finnhub get names from the SEC list so the diagram can label them
  const peerLinks = (peers ?? []).map((p) => ({ sym: p, name: tickers?.find((t) => t.ticker === p)?.title ?? p }));
  return json(
    { sym, name, profile, peers: peerLinks, filing, facts, model, wiki, gemini: hasKey('gemini'), errors, asOf: Date.now() },
    { sMaxAge: facts ? 86400 : 600, swr: 7 * 86400 },
  );
}
