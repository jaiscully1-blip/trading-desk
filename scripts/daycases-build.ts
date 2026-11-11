// Daily bull / bear / stagnant cases for SPY, QQQ and IWM, plus the special-days calendar with each day type's measured effect.
// Writes published/daycases.json (the desk and the Discord bots read it) and published/daycases-log.json (every morning's cases
// and, once the day is over, which case played out: the running record of how well the base rates do).
// Run by .github/workflows/daycases.yml before the open (with the premarket gap) and after the close (grades the day, previews
// the next session), or by hand:  npx --yes tsx@4.19.2 scripts/daycases-build.ts
// Optional env: FRED_API_KEY (CPI and jobs-report dates; without it jobs days use the first Friday and CPI is left out).
// Free sources only (Yahoo prices are unofficial). CALCULATED history, not a forecast, not advice; nothing here can trade.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { FOMC } from '../shared/calendar.js';
import { NYSE_HOLIDAYS } from '../shared/marketCalendar.js';
import { KINDS, calendarEvents, dayRows, firstFridays, fomcFromFedHtml, kindOf, measureEvents, tradingCalendarEvents, type EventDay, type EventStat } from '../shared/eventDays.js';
import { caseOf, dayCases, type Bar, type Premarket, type SymCases } from '../shared/dayCases.js';

const SYMS = ['SPY', 'QQQ', 'IWM'];
const errors: Record<string, string> = {};
const ua = { 'user-agent': 'Mozilla/5.0 (trading-desk; personal research)' };
const get = async (url: string, as: 'json' | 'text' = 'json') => { const r = await fetch(url, { headers: ua, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return as === 'json' ? r.json() : r.text(); };
const etNow = () => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value])); return { day: `${p.year}-${p.month}-${p.day}`, min: (Number(p.hour) % 24) * 60 + Number(p.minute) }; };
const addDays = (s: string, n: number) => new Date(Date.parse(`${s}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const isWeekday = (s: string) => ![0, 6].includes(new Date(`${s}T12:00:00Z`).getUTCDay());
const readJson = (p: string) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

// ---------- daily history (Yahoo, unofficial) ----------
async function daily(sym: string): Promise<Bar[]> {
  const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?period1=0&period2=9999999999&interval=1d`);
  const r = j.chart.result[0], q = r.indicators.quote[0], adj: number[] | undefined = r.indicators.adjclose?.[0]?.adjclose;
  // dividend-adjusted: SPY, QQQ and IWM go ex-dividend on quarterly expiry Fridays, which raw closes would show as a drop
  return r.timestamp.map((t: number, i: number) => { const f = adj && Number.isFinite(adj[i]) && q.close[i] > 0 ? adj[i] / q.close[i] : 1; return { date: new Date((t + r.meta.gmtoffset) * 1000).toISOString().slice(0, 10), open: q.open[i] * f, high: q.high[i] * f, low: q.low[i] * f, close: q.close[i] * f }; })
    .filter((b: Bar) => [b.open, b.high, b.low, b.close].every((v) => Number.isFinite(v) && v > 0));
}
/** Premarket last / high / low for today from 5-minute bars with extended hours. */
async function premarket(sym: string, day: string): Promise<Premarket | null> {
  const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1d&interval=5m&includePrePost=true`);
  const r = j.chart.result[0], q = r.indicators.quote[0];
  const open = Date.parse(`${day}T09:30:00${r.meta.gmtoffset === -14400 ? '-04:00' : '-05:00'}`);
  const pts = (r.timestamp ?? []).map((t: number, i: number) => ({ t: t * 1000, c: q.close[i], h: q.high[i], l: q.low[i] })).filter((p: any) => p.t < open && new Date(p.t + r.meta.gmtoffset * 1000).toISOString().slice(0, 10) === day && Number.isFinite(p.c));
  if (!pts.length) return null;
  return { last: pts[pts.length - 1].c, high: Math.max(...pts.map((p: any) => p.h).filter(Number.isFinite)), low: Math.min(...pts.map((p: any) => p.l).filter(Number.isFinite)), at: pts[pts.length - 1].t };
}

const now = etNow();
const hist: Record<string, Bar[]> = {};
for (const s of SYMS) { try { hist[s] = await daily(s); } catch (e) { errors[s] = String((e as Error).message); } }
if (!hist.SPY?.length) { console.error('no SPY history'); process.exit(1); }
const spyDays = hist.SPY.map((b) => b.date);
const lastBarDay = spyDays[spyDays.length - 1];

// the session being planned: today before the close on a trading day, otherwise the next trading day
const tradingDay = (d: string) => isWeekday(d) && !NYSE_HOLIDAYS[d];
let target = now.day;
const sessionDone = lastBarDay === now.day && now.min >= 16 * 60;
if (!tradingDay(target) || sessionDone) { do target = addDays(target, 1); while (!tradingDay(target)); }
// history = completed sessions only (drop today's forming bar)
for (const s of SYMS) if (hist[s]) hist[s] = hist[s].filter((b) => b.date < target && !(b.date === now.day && now.min < 16 * 60));

// ---------- events ----------
const cachePath = 'published/fomc-dates.json';
let fomc: string[] = readJson(cachePath)?.dates ?? [];
if (fomc.length < 100) { // first run: read the Fed's historical pages once
  for (let y = 1994; y <= 2020; y++) { try { fomc.push(...fomcFromFedHtml(await get(`https://www.federalreserve.gov/monetarypolicy/fomchistorical${y}.htm`, 'text')).filter((d) => d.startsWith(String(y)))); } catch { /* skip a year */ } }
}
try { fomc.push(...fomcFromFedHtml(await get('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', 'text'))); } catch (e) { errors.fomc = String((e as Error).message); }
fomc.push(...FOMC.map((f) => f.date));
fomc = [...new Set(fomc)].sort();
mkdirSync('published', { recursive: true });
writeFileSync(cachePath, JSON.stringify({ source: 'federalreserve.gov FOMC calendars and historical pages', dates: fomc }));

// the planned session and the ones after it (for the "coming up" list): weekdays that are not NYSE holidays
const future: string[] = [];
for (let d = target; future.length < 15; d = addDays(d, 1)) if (tradingDay(d)) future.push(d);
const allDays = [...spyDays.filter((d) => d < target), ...future];
const events: EventDay[] = [...tradingCalendarEvents(allDays)];
for (let y = Number(spyDays[0].slice(0, 4)); y <= Number(target.slice(0, 4)) + 1; y++) events.push(...calendarEvents(y));
const idx = new Map(allDays.map((d, i) => [d, i]));
for (const d of fomc) { events.push({ date: d, kind: 'fomc' }); const i = idx.get(d); if (i) events.push({ date: allDays[i - 1], kind: 'pre-fomc' }); }
let jobsApprox = false;
if (process.env.FRED_API_KEY) {
  for (const [id, kind] of [[10, 'cpi'], [50, 'jobs']] as const) {
    try {
      const j = await get(`https://api.stlouisfed.org/fred/release/dates?release_id=${id}&api_key=${process.env.FRED_API_KEY}&file_type=json&include_release_dates_with_no_data=true&limit=10000&sort_order=asc`);
      for (const r of j.release_dates ?? []) events.push({ date: String(r.date), kind });
    } catch (e) { errors[`fred-${kind}`] = String((e as Error).message).replace(process.env.FRED_API_KEY, '***'); }
  }
} else {
  jobsApprox = true;
  for (let y = Number(spyDays[0].slice(0, 4)); y <= Number(target.slice(0, 4)) + 1; y++) for (const d of firstFridays(y)) events.push({ date: d, kind: 'jobs' });
  errors.cpi = 'no FRED_API_KEY: CPI days are left out, jobs days use the first Friday (approximate)';
}

// ---------- measure every day type, per index ----------
const stats: Record<string, EventStat[]> = {};
for (const s of SYMS) if (hist[s]) stats[s] = measureEvents(dayRows(hist[s]), events, s);

// ---------- cases ----------
const preOpen = target === now.day && now.min < 9 * 60 + 30 && now.min >= 4 * 60;
const indexes: SymCases[] = [];
for (const s of SYMS) {
  if (!hist[s]) continue;
  let pm: Premarket | null = null;
  if (preOpen) { try { pm = await premarket(s, target); } catch (e) { errors[`${s}-premarket`] = String((e as Error).message); } }
  const c = dayCases(s, hist[s], target, pm, events, stats[s]);
  if (c) indexes.push(c);
}

// ---------- the record: log this session's cases, grade the ones whose day is over ----------
type LogRow = { date: string; sym: string; bull: number; stag: number; bear: number; outcome?: 'bull' | 'stag' | 'bear'; ret?: number };
const log: LogRow[] = readJson('published/daycases-log.json')?.rows ?? [];
for (const c of indexes) {
  const row = log.find((r) => r.date === c.date && r.sym === c.sym);
  const v = { bull: +c.blend.bull.toFixed(3), stag: +c.blend.stag.toFixed(3), bear: +c.blend.bear.toFixed(3) };
  if (!row) log.push({ date: c.date, sym: c.sym, ...v });
  else if (!row.outcome) Object.assign(row, v); // the premarket run refines the evening preview
}
for (const r of log) {
  if (r.outcome || !hist[r.sym]) continue;
  const h = hist[r.sym], i = h.findIndex((b) => b.date === r.date);
  if (i < 21) continue;
  const rets = h.slice(i - 20, i).map((b, k) => b.close / h[i - 21 + k].close - 1);
  const m = rets.reduce((a, b) => a + b, 0) / 20, sigma = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / 19);
  r.ret = +(h[i].close / h[i - 1].close - 1).toFixed(5);
  r.outcome = caseOf(r.ret, sigma);
}
const graded = log.filter((r) => r.outcome);
const record = {
  n: graded.length,
  topCaseHit: graded.length ? graded.filter((r) => { const top = (['bull', 'stag', 'bear'] as const).reduce((a, b) => (r[b] > r[a] ? b : a)); return top === r.outcome; }).length / graded.length : null,
  // Brier score (lower is better; always guessing the all-days rates scores about 0.6)
  brier: graded.length ? graded.reduce((a, r) => a + (['bull', 'stag', 'bear'] as const).reduce((s, k) => s + (r[k] - (r.outcome === k ? 1 : 0)) ** 2, 0), 0) / graded.length : null,
};
writeFileSync('published/daycases-log.json', JSON.stringify({ rows: log.slice(-1500) }));

// ---------- coming up: the next 10 trading days and their special days ----------
const upcoming = future.filter((d) => d >= target).slice(0, 10).map((d) => ({
  date: d,
  days: [...new Set(events.filter((e) => e.date === d).map((e) => e.kind))].map((k) => {
    const st = stats.SPY?.find((x) => x.kind === k);
    return { kind: k, label: kindOf(k)?.label ?? k, cat: kindOf(k)?.cat ?? 'market', measured: !!st?.measured, verdict: st?.verdict ?? '', n: st?.n ?? 0, ...(kindOf(k)?.approx || (k === 'jobs' && jobsApprox) ? { approx: true } : {}) };
  }),
}));
// calendar days that fall on a weekend or holiday still matter for the calendar list (e.g. Yom Kippur on a Saturday)
const nonTrading = events.filter((e) => e.date >= target && e.date <= (future[9] ?? target) && !idx.has(e.date) && kindOf(e.kind)?.cat !== 'market').map((e) => ({ date: e.date, kind: e.kind, label: kindOf(e.kind)?.label ?? e.kind }));

const file = {
  version: 1, asOf: Date.now(), date: target, premarket: preOpen && indexes.some((c) => c.gapPct != null), indexes, upcoming, offDays: nonTrading, stats, record, kinds: KINDS,
  sources: {
    prices: 'Yahoo Finance daily and 5-minute bars (unofficial, delayed)',
    fomc: `Federal Reserve FOMC calendars (${fomc[0]?.slice(0, 4)} on)`,
    releases: process.env.FRED_API_KEY ? 'FRED release dates: CPI (release 10), Employment Situation (release 50)' : 'jobs report = first Friday (approximate); CPI not included without a FRED key',
    calendars: 'Hebrew, Islamic (Umm al-Qura) and Chinese calendars from the built-in Intl calendars; Easter by computus; Diwali from the new moon (approximate)',
  },
  method: 'Bull = closed up more than 0.25 x the normal daily move (stdev of the prior 20 days), bear = down more than that, stagnant = in between. Rates come from the last 15 years; each factor is shown with its own sample; the blend shrinks small samples toward the all-days rate. A day type counts as measured only with |t| >= 2.5, 12+ days of history and the same direction in both halves.',
  errors,
};
writeFileSync('published/daycases.json', JSON.stringify(file));
console.log(`daycases ${target}${file.premarket ? ' (with premarket)' : ''}: ${indexes.map((c) => `${c.sym} bull ${(c.blend.bull * 100).toFixed(0)} / flat ${(c.blend.stag * 100).toFixed(0)} / bear ${(c.blend.bear * 100).toFixed(0)}`).join(' · ')} · measured day types: ${stats.SPY.filter((x) => x.measured).map((x) => x.kind).join(', ')} · graded ${record.n}`);
