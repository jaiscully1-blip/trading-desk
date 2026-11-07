// GET /api/news?symbols=NVDA,AMD   -> merged 24/7 headlines: Finnhub market + company news, plus RSS (CNBC, MarketWatch, Yahoo, Fed, BLS)
import { isMacro, keywordSentiment, mergeNews, tagSymbols, type NewsItem } from '../shared/news.js';
import { FEEDS, finnhubMarketNews, finnhubNews, finnhubProfile, rssFeed } from './_lib/adapters.js';
import { SYMBOL_RE, cached, getCached, hasKey, json, ttl } from './_lib/core.js';

const MAX_COMPANY = 15; // company-news calls per request (Finnhub free: 60/min, shared with quotes)

export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const symbols = [...new Set((u.searchParams.get('symbols') ?? '').toUpperCase().split(',').map((s) => s.trim()).filter((s) => SYMBOL_RE.test(s)))].slice(0, 60);
  // company names let "Nvidia ..." headlines tag NVDA; profiles are cached a week, so this is ~1 call per ticker per week
  const names: Record<string, string> = {};
  if (hasKey('finnhub')) {
    await Promise.all(symbols.slice(0, 25).map(async (s) => {
      try { const p = (await cached(`prof:${s}`, 7 * 86400, () => finnhubProfile(s))).val; if (p.name) names[s] = p.name; } catch { /* optional */ }
    }));
  }
  for (const s of symbols) { const p = getCached<{ name: string | null }>(`prof:${s}`); if (!names[s] && p?.val.name) names[s] = p.val.name; }
  const sources: { name: string; ok: boolean; count: number; error?: string }[] = [];
  const all: NewsItem[] = [];
  const add = (raw: { title: string; url: string; t: number; src: string; explicit?: string[]; summary?: string }) => {
    all.push({
      id: `${raw.src}:${raw.t}:${raw.title.slice(0, 40)}`,
      t: raw.t, title: raw.title, src: raw.src, url: raw.url,
      syms: tagSymbols(raw.title, symbols, names, raw.explicit ?? []),
      macro: isMacro(raw.title, raw.src),
      sentiment: keywordSentiment(raw.title),
      summary: raw.summary,
    });
  };
  const run = async (name: string, f: () => Promise<{ title: string; url: string; t: number; src: string; explicit?: string[]; summary?: string }[]>) => {
    try { const xs = await f(); xs.forEach(add); sources.push({ name, ok: true, count: xs.length }); }
    catch (e) { sources.push({ name, ok: false, count: 0, error: (e as Error).message.slice(0, 120) }); }
  };

  const life = ttl(180, 900);
  const jobs: Promise<void>[] = FEEDS.map((f) => run(f.name, async () => (await cached(`rss:${f.name}`, ttl(300, 1800), () => rssFeed(f.name, f.url))).val));
  if (hasKey('finnhub')) {
    jobs.push(run('Finnhub market', async () => (await cached('fh:general', life, finnhubMarketNews)).val.map((n) => ({ title: n.headline, url: n.url, t: n.t, src: n.source || 'Finnhub', summary: n.summary }))));
    jobs.push(run('Finnhub company', async () => {
      const out: { title: string; url: string; t: number; src: string; explicit: string[]; summary?: string }[] = [];
      await Promise.all(symbols.slice(0, MAX_COMPANY).map(async (s) => {
        try { for (const n of (await cached(`news:${s}`, ttl(1800, 3 * 3600), () => finnhubNews(s))).val) out.push({ title: n.headline, url: n.url, t: n.t, src: n.source || 'Finnhub', explicit: [s], summary: n.summary }); } catch { /* skip symbol */ }
      }));
      return out;
    }));
  }
  await Promise.all(jobs);
  const items = mergeNews(all.filter((x) => Date.now() - x.t < 3 * 86400_000 && x.t <= Date.now() + 3600_000));
  return json({ items, sources: sources.sort((a, b) => a.name.localeCompare(b.name)), asOf: Date.now() }, { sMaxAge: items.length ? life : 0 });
}
