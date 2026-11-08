// GET /api/research?fn=econ-odds -> Kalshi odds on the Fed, recession, CPI, jobs, unemployment, GDP and the S&P 500,
// each with ~90 days of daily history for its headline outcome. Public data, no key.
import { ECON_TOPICS, parseCandles, parseKalshiEvents, pickSeries, type EconCard } from '../../../shared/econodds.js';
import { cached, getJson, json, take } from '../core.js';

const BASE = 'https://external-api.kalshi.com/trade-api/v2';
const k = async (path: string) => {
  if (!take('kalshi')) throw new Error('Kalshi rate limit (local)');
  return getJson(`${BASE}${path}`, 'kalshi', 10000);
};

async function seriesList() {
  const lists = await Promise.all(['Economics', 'Financials'].map((c) => k(`/series?category=${c}&include_volume=true`).then((j) => (j?.series ?? []) as any[]).catch(() => [])));
  return lists.flat().map((s) => ({ ticker: String(s.ticker), title: String(s.title ?? ''), volume: Number(s.volume ?? 0) }));
}

async function card(topic: (typeof ECON_TOPICS)[number], listed: { ticker: string; title: string; volume?: number }[]): Promise<EconCard | null> {
  const series = pickSeries(topic, listed);
  if (!series) return null;
  const events = parseKalshiEvents(await k(`/events?series_ticker=${series}&status=open&with_nested_markets=true&limit=20`)).slice(0, topic.events);
  if (!events.length) return null;
  const e = events[0];
  const binary = e.outcomes.length === 1;
  // history for the binary market, else for the most likely outcome of the nearest event
  const head = binary ? e.outcomes[0] : [...e.outcomes].sort((a, b) => b.p - a.p)[0];
  const now = Math.floor(Date.now() / 1000);
  const history = await k(`/series/${series}/markets/${head.ticker}/candlesticks?start_ts=${now - 90 * 86400}&end_ts=${now}&period_interval=1440`).then(parseCandles).catch(() => null);
  return { id: topic.id, title: topic.title, why: topic.why, series, events, binary, history: history?.length ? history : null, histLabel: binary ? 'Yes' : head.label, url: `https://kalshi.com/markets/${series.toLowerCase()}` };
}

export async function GET(): Promise<Response> {
  try {
    const { val, stale } = await cached('econ-odds', 900, async () => {
      const listed = (await cached('kalshi:series', 86400, seriesList).catch(() => ({ val: [] as Awaited<ReturnType<typeof seriesList>> }))).val;
      const errors: Record<string, string> = {};
      const cards = (await Promise.all(ECON_TOPICS.map((t) => card(t, listed).catch((e) => { errors[t.id] = (e as Error).message; return null; })))).filter((c): c is EconCard => !!c);
      if (!cards.length) throw new Error(Object.values(errors)[0] ?? 'Kalshi returned no open economics markets');
      return { cards, errors };
    });
    return json({ ...val, stale, asOf: Date.now(), source: 'Kalshi (CFTC-regulated exchange), public market data' }, { sMaxAge: 600 });
  } catch (e) { return json({ cards: [], error: (e as Error).message }, { status: 502 }); }
}
