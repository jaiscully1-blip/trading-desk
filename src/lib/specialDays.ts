// Special days for the month calendar: Jewish, Christian, Islamic and Lunar holidays, US federal days the market is
// open, and market days (option expiry, quad witching, month and quarter turns, Jackson Hole, Russell rebalance, tax
// day, clock changes, moons...), each with its measured history from published/daycases.json (S&P 500 back to 1928
// and SPY back to 1993). History, not a forecast.
import { calendarEvents, kindOf, tradingCalendarEvents, type EventStat } from '../../shared/eventDays';
import { NYSE_HOLIDAYS } from '../../shared/marketCalendar';

export interface SpecialDay { date: string; kind: string; label: string; cat: string; approx?: boolean; note?: string }
/** Kinds shown as their own pills (FOMC, CPI and jobs already come from the Fed and economic calendars). */
const SKIP = new Set(['fomc', 'pre-fomc', 'cpi', 'jobs', 'month-start', 'post-holiday', 'pre-holiday', 'santa']);

const addDays = (s: string, n: number) => new Date(Date.parse(`${s}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const weekday = (s: string) => { const d = new Date(`${s}T12:00:00Z`).getUTCDay(); return d !== 0 && d !== 6; };

export function specialDays(from: string, to: string): SpecialDay[] {
  // trading days from a little before to a little after the window (weekdays that aren't NYSE holidays)
  const days: string[] = [];
  for (let d = addDays(from, -10); d <= addDays(to, 10); d = addDays(d, 1)) if (weekday(d) && !NYSE_HOLIDAYS[d]) days.push(d);
  const ev = [...tradingCalendarEvents(days)];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) ev.push(...calendarEvents(y));
  const seen = new Set<string>(), out: SpecialDay[] = [];
  for (const e of ev) {
    if (e.date < from || e.date > to || SKIP.has(e.kind)) continue;
    const k = kindOf(e.kind); if (!k) continue;
    const key = `${e.date}|${e.kind}`; if (seen.has(key)) continue; seen.add(key);
    out.push({ date: e.date, kind: e.kind, label: k.label, cat: k.cat, approx: k.approx, note: k.note });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Plain-English history lines for a day type from the measured stats. */
export function historyLines(kind: string, stats: Record<string, EventStat[]> | null | undefined): { lines: string[]; measured: boolean } {
  const lines: string[] = []; let measured = false;
  for (const [sym, name] of [['^GSPC', 'S&P 500 index'], ['SPY', 'SPY'], ['QQQ', 'Nasdaq 100 (QQQ)']] as const) {
    const s = stats?.[sym]?.find((x) => x.kind === kind);
    if (!s || !s.n) continue;
    measured ||= s.measured;
    const yrs = s.years ? `${s.years[0]}–${s.years[1]}` : '';
    lines.push(`${name}, ${s.n} days ${yrs}: closed up ${(s.upPct * 100).toFixed(0)}% of the time (vs ${(s.baseUpPct * 100).toFixed(0)}% on all days), average ${s.meanRet >= 0 ? '+' : ''}${(s.meanRet * 100).toFixed(2)}%, moved ${s.relMove.toFixed(2)}× a usual day.${s.measured ? ' Measured effect.' : ''}`);
  }
  const v = stats?.['^GSPC']?.find((x) => x.kind === kind) ?? stats?.SPY?.find((x) => x.kind === kind);
  if (v) lines.push(v.measured ? `Verdict: ${v.verdict}.` : `Verdict: ${v.verdict} (about 60 day types are tested, so a bar of t ≥ 2.5 and the same direction in older and newer years is used).`);
  return { lines, measured };
}
