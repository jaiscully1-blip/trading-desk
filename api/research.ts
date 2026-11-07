// GET /api/research?fn=names|earnings|company-news|company|feed&...  One function for the research endpoints, because Vercel's
// Hobby plan allows at most 12 serverless functions per deployment.
import { GET as names } from './_lib/research/names.js';
import { GET as earnings } from './_lib/research/earnings.js';
import { GET as companyNews } from './_lib/research/company-news.js';
import { GET as company } from './_lib/research/company.js';
import { GET as feed } from './_lib/research/feed.js';
import { cached, json } from './_lib/core.js';
import { finnhubCryptoNews, frameCheck } from './_lib/adapters.js';
import { keywordSentiment } from '../shared/news.js';

async function cryptoNews(): Promise<Response> {
  try {
    const { val } = await cached('fh:crypto', 600, finnhubCryptoNews);
    return json({ items: val.slice(0, 60).map((n) => ({ id: n.id, t: n.t, title: n.headline, src: n.source, url: n.url, sentiment: keywordSentiment(n.headline) })), asOf: Date.now() }, { sMaxAge: 300 });
  } catch (e) { return json({ items: [], error: (e as Error).message }, { status: 502 }); }
}
async function frame(req: Request): Promise<Response> {
  const url = new URL(req.url).searchParams.get('url') ?? '';
  if (!/^https?:\/\/[^\s]+$/i.test(url)) return json({ error: 'url required' }, { status: 400 });
  try { return json((await cached(`frame:${url}`, 3600, () => frameCheck(url))).val, { sMaxAge: 3600 }); }
  catch (e) { return json({ embeddable: false, reason: (e as Error).message, finalUrl: url }); }
}

// Reading a 10-K + one Gemini call can take ~20-40 s the first time (cached after that)
export const maxDuration = 60;

const ROUTES: Record<string, (req: Request) => Promise<Response>> = { names, earnings, 'company-news': companyNews, company, feed, 'crypto-news': () => cryptoNews(), frame };
export async function GET(req: Request): Promise<Response> {
  const fn = new URL(req.url).searchParams.get('fn') ?? '';
  const h = ROUTES[fn];
  return h ? h(req) : json({ error: `unknown fn; use one of ${Object.keys(ROUTES).join(', ')}` }, { status: 404 });
}
