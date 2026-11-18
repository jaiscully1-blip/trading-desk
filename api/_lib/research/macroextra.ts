// fn=macroextra -> earnings-season scoreboard (Finnhub earnings calendar, last 6 weeks), tariff tracker (Federal Register actions
// and companies whose latest 10-Q / 10-K talk most about tariffs, from EDGAR full-text search) and policy / macro odds
// (Polymarket) mapped to the sector baskets they move.
import { cached, getJson, hasKey, json, take } from '../core.js';
import { finnhubEarnings } from '../adapters.js';
import { parsePolymarketEvents } from '../../../shared/polymarket.js';
import { COMPANIES } from '../../../shared/data/companies.js';
import { basketsFor, scoreboard } from '../../../shared/macroextra.js';
import { parseDisplayName } from '../../../shared/plumbing.js';

const SEC_UA = () => ({ 'user-agent': process.env.SEC_USER_AGENT || 'trade-desk-research/0.1 (personal project)' });
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function macroextra(): Promise<Response> {
  const errors: Record<string, string> = {};
  const sectorOf = (s: string) => COMPANIES.find((c) => c[0] === s)?.[2] ?? null;
  let board = null, tariffs: any = null, odds: any[] = [];
  if (hasKey('finnhub')) {
    try {
      const to = ymd(new Date()), from = ymd(new Date(Date.now() - 42 * 86400_000));
      const { val } = await cached(`earnboard:${to}`, 6 * 3600, () => finnhubEarnings(from, to));
      board = { from, to, ...scoreboard(val as any, sectorOf) };
    } catch (e) { errors.board = (e as Error).message.slice(0, 120); }
  } else errors.board = 'Needs the Finnhub key.';
  try {
    const { val } = await cached('tariffs', 12 * 3600, async () => {
      if (!take('sec')) throw new Error('budget');
      const fr = await getJson('https://www.federalregister.gov/api/v1/documents.json?conditions%5Bterm%5D=tariff&order=newest&per_page=12', 'noaa', 15000);
      const from = ymd(new Date(Date.now() - 100 * 86400_000)), to = ymd(new Date());
      const r = await fetch(`https://efts.sec.gov/LATEST/search-index?q=%22tariffs%22&forms=10-Q,10-K&dateRange=custom&startdt=${from}&enddt=${to}`, { headers: SEC_UA(), signal: AbortSignal.timeout(20000) });
      const ef = r.ok ? await r.json() : null;
      const big = new Set(COMPANIES.map((c) => c[0]));
      const companies = (ef?.hits?.hits ?? []).map((h: any) => ({ ...parseDisplayName(String(h._source?.display_names?.[0] ?? '')), date: String(h._source?.file_date ?? ''), form: String(h._source?.form ?? ''), score: Number(h._score) || 0 }))
        .filter((x: any) => x.ticker).map((x: any) => ({ ...x, big: big.has(x.ticker) }))
        .filter((x: any, i: number, all: any[]) => all.findIndex((y: any) => y.ticker === x.ticker) === i).sort((a: any, b: any) => Number(b.big) - Number(a.big));
      return {
        actions: (fr?.results ?? []).map((d: any) => ({ title: String(d.title ?? ''), date: String(d.publication_date ?? ''), agency: (d.agencies ?? []).map((a: any) => a.name).join(', '), type: String(d.type ?? ''), url: String(d.html_url ?? '') })),
        companies: companies.slice(0, 40),
      };
    });
    tariffs = val;
  } catch (e) { errors.tariffs = (e as Error).message.slice(0, 120); }
  try {
    for (const tag of ['economy', 'fed-rates', 'politics', 'geopolitics']) {
      const { val } = await cached(`pm:${tag}`, 300, async () => parsePolymarketEvents(await getJson(`https://gamma-api.polymarket.com/events?closed=false&active=true&tag_slug=${tag}&order=volume24hr&ascending=false&limit=20`, 'polymarket', 10000)));
      for (const e of val) {
        const b = basketsFor(`${e.title} ${e.markets.map((m) => m.q).join(' ')}`);
        if (!b.length || odds.some((o) => o.url === e.url)) continue;
        const m = e.markets[0], yes = m.outcomes.find((o) => /yes/i.test(o.name)) ?? m.outcomes[0];
        odds.push({ title: e.title, url: e.url, ends: e.ends, vol24: e.vol24, top: m.q === e.title ? null : m.q, yes: yes?.p ?? null, outcome: yes?.name ?? '', baskets: b });
      }
    }
    odds = odds.sort((a, b) => b.vol24 - a.vol24).slice(0, 16);
  } catch (e) { errors.odds = (e as Error).message.slice(0, 120); }
  return json({ board, tariffs, odds, errors, asOf: Date.now(), source: 'Finnhub earnings calendar (actuals vs estimates); Federal Register API; SEC EDGAR full-text search; Polymarket public API' }, { sMaxAge: 1800 });
}
