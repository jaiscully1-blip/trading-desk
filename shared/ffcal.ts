// Forex Factory's free weekly calendar file (nfs.faireconomy.media/ff_calendar_thisweek.json): releases for the major
// currencies with impact, forecast and previous (no actuals). Used for (1) non-US releases on the Calendars page and (2) the
// forecast / previous next to the desk's US releases (which come from FRED's schedule). Pure + tested. Facts, not advice.

export interface WorldEvent { ccy: string; title: string; at: number; date: string; time: string; impact: 0 | 1 | 2 | 3; forecast: string; previous: string }
const IMPACT: Record<string, 0 | 1 | 2 | 3> = { Low: 1, Medium: 2, High: 3, Holiday: 0 };
const et = (ms: number) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(ms).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
};

export function parseFf(j: unknown): WorldEvent[] {
  if (!Array.isArray(j)) return [];
  return j.flatMap((x: any) => {
    const at = Date.parse(x?.date); if (!Number.isFinite(at) || !x?.title || !x?.country) return [];
    const { date, time } = et(at);
    return [{ ccy: String(x.country), title: String(x.title), at, date, time, impact: IMPACT[x.impact] ?? 1, forecast: String(x.forecast ?? ''), previous: String(x.previous ?? '') }];
  }).sort((a, b) => a.at - b.at);
}

/** Which Forex Factory USD line carries the forecast for each of the desk's US releases (the headline number). */
const US: Record<string, RegExp> = {
  cpi: /^Core CPI m\/m$/i, nfp: /^Non-Farm Employment Change$/i, pce: /^Core PCE Price Index m\/m$/i, gdp: /GDP q\/q$/i, ppi: /^Core PPI m\/m$/i,
  retail: /^Retail Sales m\/m$/i, claims: /^Unemployment Claims$/i, jolts: /^JOLTS Job Openings$/i, umich: /UoM Consumer Sentiment$/i,
  indpro: /^Industrial Production m\/m$/i, housing: /^Housing Starts$/i,
};
/** Forecast and previous for a desk US release on a given ET date, when Forex Factory lists it that day. */
export function usForecast(key: string, date: string, ev: WorldEvent[]): { title: string; forecast: string; previous: string } | null {
  const re = US[key]; if (!re) return null;
  const e = ev.find((x) => x.ccy === 'USD' && x.date === date && re.test(x.title));
  return e && (e.forecast || e.previous) ? { title: e.title, forecast: e.forecast, previous: e.previous } : null;
}

/** Non-US releases worth a trader's look: medium and high impact, plus market holidays. */
export const worldList = (ev: WorldEvent[], fromMs: number) => ev.filter((e) => e.ccy !== 'USD' && e.at >= fromMs - 3600_000 && (e.impact >= 2 || e.impact === 0));
