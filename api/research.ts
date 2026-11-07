// GET /api/research?fn=names|earnings|company-news|company|feed&...  One function for the research endpoints, because Vercel's
// Hobby plan allows at most 12 serverless functions per deployment.
import { GET as names } from './_lib/research/names.js';
import { GET as earnings } from './_lib/research/earnings.js';
import { GET as companyNews } from './_lib/research/company-news.js';
import { GET as company } from './_lib/research/company.js';
import { GET as feed } from './_lib/research/feed.js';
import { GET as webull } from './_lib/research/webull.js';
import { GET as discord } from './_lib/research/discord.js';
import { GET as info } from './_lib/research/info.js';
import { GET as congress } from './_lib/research/congress.js';
import { cached, json } from './_lib/core.js';
import { finnhubCryptoNews, finnhubMetrics, finnhubRecs, frameCheck, xOembed } from './_lib/adapters.js';
import { SYMBOL_RE } from './_lib/core.js';

async function fundamentals(req: Request): Promise<Response> {
  const sym = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!SYMBOL_RE.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  const errors: Record<string, string> = {};
  const [metric, recs] = await Promise.all([
    cached(`metric:${sym}`, 12 * 3600, () => finnhubMetrics(sym)).then((r) => r.val).catch((e) => { errors.metrics = e.message; return null; }),
    cached(`recs:${sym}`, 12 * 3600, () => finnhubRecs(sym)).then((r) => r.val).catch((e) => { errors.recs = e.message; return []; }),
  ]);
  return json({ sym, metric, recs, errors, source: 'Finnhub basic financials + recommendation trends', asOf: Date.now() }, { sMaxAge: metric ? 6 * 3600 : 60 });
}
async function xEmbed(req: Request): Promise<Response> {
  const url = new URL(req.url).searchParams.get('url') ?? '';
  if (!/^https:\/\/(x|twitter)\.com\/[\w/]+/i.test(url)) return json({ error: 'paste an x.com post or profile link' }, { status: 400 });
  try {
    const v = (await cached(`x:${url}`, 3600, () => xOembed(url))).val;
    // only X's own markup (a blockquote or timeline anchor); scripts are loaded separately from platform.twitter.com
    if (!/^\s*<(blockquote|a) class="twitter-/.test(v.html) || /<script/i.test(v.html)) return json({ error: 'unexpected embed markup from X' }, { status: 502 });
    // any site-relative link (cashtags, hashtags) must point at X, not at the desk
    return json({ ...v, html: v.html.replace(/href="\//g, 'href="https://x.com/') }, { sMaxAge: 3600 });
  }
  catch (e) { return json({ error: (e as Error).message }, { status: 502 }); }
}
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

const ROUTES: Record<string, (req: Request) => Promise<Response>> = { names, earnings, 'company-news': companyNews, company, feed, 'crypto-news': () => cryptoNews(), frame, fundamentals, x: xEmbed, webull, discord, info, congress };
export async function GET(req: Request): Promise<Response> {
  const fn = new URL(req.url).searchParams.get('fn') ?? '';
  const h = ROUTES[fn];
  return h ? h(req) : json({ error: `unknown fn; use one of ${Object.keys(ROUTES).join(', ')}` }, { status: 404 });
}
