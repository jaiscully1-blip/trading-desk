// GET /api/calendar?symbols=NVDA,AMD -> economic releases (FRED) with "what usually happens" and the forecast / previous
// (Forex Factory), non-US releases this week (Forex Factory), FOMC + Kalshi odds, earnings, IPOs
import { ECON, FOMC, usualMove, type Earning, type Ipo, type Odds, type Usual } from '../shared/calendar.js';
import { alphaEarnings, alphaIpos, fredReleaseDates, fredReleases, kalshiFedOdds } from './_lib/adapters.js';
import { SYMBOL_RE, cached, getJson, hasKey, json, markFresh, take } from './_lib/core.js';
import { parseFf, usForecast, worldList, type WorldEvent } from '../shared/ffcal.js';
import { loadSeries } from './_lib/series.js';

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface EconEvent { key: string; label: string; date: string; time: string; impact: 1 | 2 | 3; note: string; usual: Usual | null; fc?: { title: string; forecast: string; previous: string } | null }

async function ffWeek(): Promise<WorldEvent[]> {
  if (!take('forexfactory')) throw new Error('rate limited');
  return parseFf(await getJson('https://nfs.faireconomy.media/ff_calendar_thisweek.json', 'forexfactory', 8000, { headers: { 'user-agent': 'Mozilla/5.0 (trade-desk-research; personal project)' } }));
}

async function econ(): Promise<EconEvent[]> {
  const releases = (await cached('fred:releases', 7 * 86400, fredReleases)).val;
  const today = ymd(Date.now());
  const start = ymd(Date.now() - 400 * 86400_000), end = ymd(Date.now() + 60 * 86400_000);
  const spy = await loadSeries('SPY', 'D', { fallback: true });
  const bars = spy.ok ? spy.val.bars : [];
  const out: EconEvent[] = [];
  await Promise.all(ECON.map(async (d) => {
    const rel = releases.find((r) => d.match.test(r.name));
    if (!rel) return;
    const dates = (await cached(`fred:rd:${rel.id}`, 12 * 3600, () => fredReleaseDates(rel.id, start, end))).val;
    const usual = usualMove(bars, dates.filter((x) => x < today));
    for (const date of dates.filter((x) => x >= today)) out.push({ key: d.key, label: d.label, date, time: d.time, impact: d.impact, note: d.note, usual });
  }));
  return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

export async function GET(req: Request): Promise<Response> {
  markFresh(req);
  const u = new URL(req.url);
  const symbols = new Set((u.searchParams.get('symbols') ?? '').toUpperCase().split(',').filter((s) => SYMBOL_RE.test(s)));
  const errors: Record<string, string> = {};
  const safe = async <T>(name: string, f: () => Promise<T>): Promise<T | null> => { try { return await f(); } catch (e) { errors[name] = (e as Error).message.slice(0, 160); return null; } };

  const [econEvents, odds, earnings, ipos, ff] = await Promise.all([
    hasKey('fred') ? safe('econ', () => cached('cal:econ', 6 * 3600, econ).then((r) => r.val)) : Promise.resolve(null),
    safe('odds', () => cached<Odds | null>('cal:odds', 600, kalshiFedOdds).then((r) => r.val)),
    hasKey('alphavantage') ? safe('earnings', () => cached<Earning[]>('cal:earn', 12 * 3600, alphaEarnings).then((r) => r.val)) : Promise.resolve(null),
    hasKey('alphavantage') ? safe('ipos', () => cached<Ipo[]>('cal:ipo', 12 * 3600, alphaIpos).then((r) => r.val)) : Promise.resolve(null),
    safe('world', () => cached('cal:ff', 3600, ffWeek).then((r) => r.val)),
  ]);

  const today = ymd(Date.now()), weekOut = ymd(Date.now() + 7 * 86400_000);
  return json({
    asOf: Date.now(),
    econ: econEvents && ff ? econEvents.map((e) => ({ ...e, fc: usForecast(e.key, e.date, ff) })) : econEvents,
    world: ff ? worldList(ff, Date.now()) : null,
    fomc: FOMC,
    odds,
    earnings: earnings
      ? {
        mine: earnings.filter((e) => symbols.has(e.sym)).sort((a, b) => a.date.localeCompare(b.date)),
        week: earnings.filter((e) => e.date >= today && e.date <= weekOut).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 400),
      }
      : null,
    ipos,
    errors,
  }, { sMaxAge: 1800 });
}
