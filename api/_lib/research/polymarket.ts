// GET /api/research?fn=polymarket&tag=economy -> the most-traded open Polymarket questions on that topic (public, no key).
import { parsePolymarketEvents } from '../../../shared/polymarket.js';
import { cached, getJson, json } from '../core.js';

const TAGS = new Set(['economy', 'fed-rates', 'geopolitics', 'business', 'crypto', 'politics', 'tech']);

export async function GET(req: Request): Promise<Response> {
  const tag = new URL(req.url).searchParams.get('tag') ?? 'economy';
  if (!TAGS.has(tag)) return json({ error: `tag must be one of ${[...TAGS].join(', ')}` }, { status: 400 });
  try {
    const { val, stale } = await cached(`pm:${tag}`, 300, async () => parsePolymarketEvents(await getJson(`https://gamma-api.polymarket.com/events?closed=false&active=true&tag_slug=${tag}&order=volume24hr&ascending=false&limit=20`, 'polymarket', 10000)));
    return json({ tag, events: val, stale, asOf: Date.now(), source: 'Polymarket (public Gamma API)' }, { sMaxAge: 300 });
  } catch (e) { return json({ tag, events: [], error: (e as Error).message }, { status: 502 }); }
}
