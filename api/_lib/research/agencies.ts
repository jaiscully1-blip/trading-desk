// GET /api/research?fn=agencies            -> central bank and regulator publications (last 45 days), merged, newest first
// GET /api/research?fn=agencysum&url=...   -> AI summary of one publication; every point quotes it (checked). Reads only the
//                                             agencies' own sites (checked at every redirect). Cached 30 days per URL.
// Free public feeds, no key. Summaries are labeled AI and can be wrong. Not advice.
import { AGENCY_FEEDS, NOT_AVAILABLE, SUM_SCHEMA, allowedUrl, checkPoints, mergePubs, sumPrompt, type Pub } from '../../../shared/agencies.js';
import { htmlToText } from '../../../shared/company.js';
import { parseFeed } from '../../../shared/news.js';
import { geminiJson, getText, hasAi } from '../adapters.js';
import { cached, json, take } from '../core.js';

export async function agencies(): Promise<Response> {
  const status: Record<string, { ok: boolean; n: number; err?: string }> = {};
  const lists = await Promise.all(AGENCY_FEEDS.map(async (f) => {
    try {
      const items = (await cached(`pubs:${f.id}`, 1800, async () => {
        if (!take('pubs')) throw new Error('rate limited');
        return parseFeed(await getText(f.url, 12000), f.agency);
      })).val;
      status[f.id] = { ok: true, n: items.length };
      return items.map((i): Pub => ({ title: i.title, url: i.url, t: i.t, agencies: [f.agency], type: f.type, feed: f.id }));
    } catch (e) { status[f.id] = { ok: false, n: 0, err: String((e as Error).message).slice(0, 80) }; return [] as Pub[]; }
  }));
  const items = mergePubs(lists, Date.now() - 45 * 86400000);
  return json({ items, status, feeds: AGENCY_FEEDS.map((f) => ({ id: f.id, agency: f.agency, type: f.type })), notAvailable: NOT_AVAILABLE, asOf: Date.now(),
    source: 'Public RSS feeds of the BIS, ECB, Bank of England, Federal Reserve, New York Fed, FSB, OCC, CFPB, ESMA, EBA, Bank of Japan and Bank of Canada' }, { sMaxAge: 900 });
}

/** Fetch a page only from the allowed hosts, checking every redirect hop; at most 3 MB of text. */
async function safeFetch(url: string): Promise<string> {
  let u = url;
  for (let hop = 0; hop < 4; hop++) {
    if (!allowedUrl(u)) throw new Error('That address is not on an agency site the desk reads.');
    const r = await fetch(u, { redirect: 'manual', headers: { 'user-agent': 'trading-desk/1.0 (personal research)' }, signal: AbortSignal.timeout(15000) });
    if (r.status >= 300 && r.status < 400) { const loc = r.headers.get('location'); if (!loc) throw new Error('Redirect without a target.'); u = new URL(loc, u).toString(); continue; }
    if (!r.ok) throw new Error(`The agency site answered HTTP ${r.status}.`);
    const ct = r.headers.get('content-type') ?? '';
    if (/pdf/i.test(ct)) throw new Error('This publication is a PDF; open it to read it (summaries work on web pages).');
    return (await r.text()).slice(0, 3_000_000);
  }
  throw new Error('Too many redirects.');
}

export async function agencysum(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const url = u.searchParams.get('url') ?? '', title = (u.searchParams.get('title') ?? '').slice(0, 300), agency = (u.searchParams.get('agency') ?? 'agency').slice(0, 60);
  if (!allowedUrl(url)) return json({ error: 'That address is not on an agency site the desk reads.' }, { status: 400 });
  if (!hasAi()) return json({ error: 'Needs a free AI key in Vercel (GEMINI_API_KEY or GROQ_API_KEY).' });
  try {
    const out = (await cached(`pubsum:${url}`, 30 * 86400, async () => {
      if (!take('pubs')) throw new Error('Too many requests just now; try again in a minute.');
      const text = htmlToText(await safeFetch(url)).replace(/\s+/g, ' ');
      const body = text.slice(0, 14_000);
      if (body.length < 200) return { points: [], dropped: 0, model: null, short: true };
      const r = await geminiJson(sumPrompt(agency, title, body), SUM_SCHEMA);
      return { ...checkPoints(r.data, text), model: r.model, short: false };
    })).val;
    return json({ url, ...out }, { sMaxAge: out.points.length ? 86400 : 0 });
  } catch (e) { return json({ url, error: String((e as Error).message).slice(0, 200) }); }
}
