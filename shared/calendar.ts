// Calendars: economic releases (FRED schedule), FOMC dates, Fed odds (Kalshi), earnings and IPOs (Alpha Vantage).
import type { Bar } from './types';

export interface EconDef { key: string; match: RegExp; label: string; impact: 1 | 2 | 3; time: string; note: string }

/** Market-moving releases on FRED's release calendar. Impact 3 = high. Times are the usual ET release time. */
export const ECON: EconDef[] = [
  { key: 'cpi', match: /^Consumer Price Index$/i, label: 'CPI', impact: 3, time: '08:30', note: 'Hot core CPI tends to lift yields and hit growth/high-multiple names; a soft print does the reverse.' },
  { key: 'nfp', match: /^Employment Situation$/i, label: 'Jobs report (NFP)', impact: 3, time: '08:30', note: 'Payrolls, unemployment and wages. Big surprises move rate expectations and index futures at 8:30.' },
  { key: 'pce', match: /^Personal Income and Outlays$/i, label: 'PCE inflation', impact: 3, time: '08:30', note: "The Fed's preferred inflation gauge; usually smaller moves than CPI because CPI front-runs it." },
  { key: 'gdp', match: /^Gross Domestic Product$/i, label: 'GDP', impact: 2, time: '08:30', note: 'Advance estimates move more than revisions.' },
  { key: 'ppi', match: /^Producer Price Index$/i, label: 'PPI', impact: 2, time: '08:30', note: 'Read as a preview of CPI/PCE components.' },
  { key: 'retail', match: /Retail (and Food Services )?Sales|Advance Monthly Sales/i, label: 'Retail sales', impact: 2, time: '08:30', note: 'Consumer strength; moves retailers and yields.' },
  { key: 'claims', match: /Unemployment Insurance Weekly Claims/i, label: 'Jobless claims', impact: 2, time: '08:30', note: 'Weekly; matters more when the labor market is the Fed’s focus.' },
  { key: 'jolts', match: /Job Openings and Labor Turnover/i, label: 'JOLTS', impact: 2, time: '10:00', note: 'Job openings; can move yields mid-morning.' },
  { key: 'umich', match: /University of Michigan.*(Consumer|Sentiment)|Surveys of Consumers/i, label: 'UMich sentiment', impact: 1, time: '10:00', note: 'Watch the inflation-expectations line more than the headline.' },
  { key: 'indpro', match: /^Industrial Production and Capacity Utilization$/i, label: 'Industrial production', impact: 1, time: '09:15', note: 'Usually a small mover.' },
  { key: 'housing', match: /^New Residential Construction$/i, label: 'Housing starts', impact: 1, time: '08:30', note: 'Moves homebuilders more than the index.' },
];

/** FOMC decision days (2nd day of each meeting; statement at 14:00 ET). 2026 confirmed; 2027 tentative per the Fed's published schedule. */
export const FOMC: { date: string; sep: boolean; tentative?: boolean }[] = [
  { date: '2026-01-28', sep: false }, { date: '2026-03-18', sep: true }, { date: '2026-04-29', sep: false }, { date: '2026-06-17', sep: true },
  { date: '2026-07-29', sep: false }, { date: '2026-09-16', sep: true }, { date: '2026-10-28', sep: false }, { date: '2026-12-09', sep: true },
  { date: '2027-01-27', sep: false, tentative: true }, { date: '2027-03-17', sep: true, tentative: true }, { date: '2027-04-28', sep: false, tentative: true },
  { date: '2027-06-09', sep: true, tentative: true }, { date: '2027-07-28', sep: false, tentative: true }, { date: '2027-09-15', sep: true, tentative: true },
  { date: '2027-10-27', sep: false, tentative: true }, { date: '2027-12-08', sep: true, tentative: true },
];

export interface Usual { n: number; avgAbsMove: number; baseline: number; upPct: number }

/** "What usually happens": SPY close-to-close move on past release days vs. all days in the same window. */
export function usualMove(spyDaily: Bar[], pastDates: string[]): Usual | null {
  if (spyDaily.length < 30) return null;
  const byDay = new Map<string, { r: number }>();
  const moves: number[] = [];
  for (let i = 1; i < spyDaily.length; i++) {
    const r = (spyDaily[i].close / spyDaily[i - 1].close - 1) * 100;
    moves.push(Math.abs(r));
    byDay.set(new Date(spyDaily[i].time * 1000).toISOString().slice(0, 10), { r });
  }
  const hits = pastDates.map((d) => byDay.get(d)).filter((x): x is { r: number } => !!x);
  if (hits.length < 2) return null;
  return {
    n: hits.length,
    avgAbsMove: hits.reduce((a, h) => a + Math.abs(h.r), 0) / hits.length,
    baseline: moves.reduce((a, b) => a + b, 0) / moves.length,
    upPct: (hits.filter((h) => h.r > 0).length / hits.length) * 100,
  };
}

/* ---------------- Kalshi Fed decision odds ---------------- */
export interface Odds { event: string; meeting: string; closes: number; outcomes: { label: string; prob: number }[] }

const outcomeLabel = (m: any): string => {
  const sub = m.yes_sub_title || m.subtitle;
  if (sub) return String(sub);
  const x = /-(H|C)(\d+)$/.exec(String(m.ticker ?? ''));
  if (!x) return String(m.title ?? m.ticker);
  const bp = +x[2];
  return bp === 0 ? 'Hold' : `${x[1] === 'H' ? 'Hike' : 'Cut'} ${bp}bp`;
};
const px = (v: unknown) => { const n = parseFloat(String(v)); return Number.isFinite(n) ? (n > 1 ? n / 100 : n) : NaN; };

/** Nearest open KXFEDDECISION event; probability = last trade, else bid/ask midpoint. */
export function parseKalshiFed(j: any): Odds | null {
  const markets: any[] = Array.isArray(j?.markets) ? j.markets : [];
  const byEvent = new Map<string, any[]>();
  for (const m of markets) if (m?.event_ticker) byEvent.set(m.event_ticker, [...(byEvent.get(m.event_ticker) ?? []), m]);
  const events = [...byEvent.entries()].map(([event, ms]) => ({ event, ms, closes: Math.min(...ms.map((m) => Date.parse(m.close_time) || Infinity)) })).filter((e) => Number.isFinite(e.closes)).sort((a, b) => a.closes - b.closes);
  const e = events[0];
  if (!e) return null;
  const outcomes = e.ms
    .map((m) => {
      const last = px(m.last_price_dollars ?? m.last_price);
      const mid = (px(m.yes_bid_dollars ?? m.yes_bid) + px(m.yes_ask_dollars ?? m.yes_ask)) / 2;
      return { label: outcomeLabel(m), prob: Number.isFinite(last) && last > 0 ? last : mid };
    })
    .filter((o) => Number.isFinite(o.prob))
    .sort((a, b) => b.prob - a.prob);
  return { event: e.event, meeting: String(e.ms[0].title ?? e.event), closes: e.closes, outcomes };
}

/* ---------------- Alpha Vantage CSV calendars ---------------- */
export interface Earning { sym: string; name: string; date: string; when: string; estimate: number | null }
export interface Ipo { sym: string; name: string; date: string; low: number | null; high: number | null; exchange: string }

function csvRows(text: string): string[][] {
  return text.trim().split(/\r?\n/).map((l) => l.split(','));
}
/** AV returns a JSON note instead of CSV when rate-limited; that comes through as a 1-column "Information" blob. */
export function avCsvError(text: string): string | null {
  const t = text.trim();
  if (t.startsWith('{')) { try { const j = JSON.parse(t); return String(j.Information ?? j.Note ?? j['Error Message'] ?? 'unexpected response'); } catch { return 'unexpected response'; } }
  return null;
}
export function parseEarningsCsv(text: string): Earning[] {
  const rows = csvRows(text);
  const h = rows[0]?.map((x) => x.trim()) ?? [];
  const i = (k: string) => h.indexOf(k);
  if (i('symbol') < 0 || i('reportDate') < 0) throw new Error('unexpected earnings CSV');
  return rows.slice(1).filter((r) => r.length >= h.length).map((r) => ({
    sym: r[i('symbol')], name: r[i('name')], date: r[i('reportDate')], when: i('timeOfTheDay') >= 0 ? r[i('timeOfTheDay')] : '',
    estimate: r[i('estimate')] ? parseFloat(r[i('estimate')]) : null,
  }));
}
export function parseIpoCsv(text: string): Ipo[] {
  const rows = csvRows(text);
  const h = rows[0]?.map((x) => x.trim()) ?? [];
  const i = (k: string) => h.indexOf(k);
  if (i('symbol') < 0 || i('ipoDate') < 0) throw new Error('unexpected IPO CSV');
  const n = (s: string) => { const v = parseFloat(s); return Number.isFinite(v) && v > 0 ? v : null; };
  return rows.slice(1).filter((r) => r.length >= h.length && r[i('symbol')]).map((r) => ({
    sym: r[i('symbol')], name: r[i('name')], date: r[i('ipoDate')], low: n(r[i('priceRangeLow')]), high: n(r[i('priceRangeHigh')]), exchange: r[i('exchange')],
  }));
}
