// Your trading on event days: your realized P&L per day from the journal, grouped by what kind of day it was (Fed,
// option expiry, month turn, around a market holiday, religious holiday, everything else). Pure (tested).
import { calendarEvents, kindOf, tradingCalendarEvents } from '../../shared/eventDays';
import { FOMC_PAST } from '../../shared/fomcHistory';
import { NYSE_HOLIDAYS } from '../../shared/marketCalendar';

export interface DayGroup { key: string; label: string; days: number; total: number; avg: number; green: number }
const addDays = (s: string, n: number) => new Date(Date.parse(`${s}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** dayPnl: ET date -> realized P&L that day. */
export function eventDayPnl(dayPnl: Map<string, number>): DayGroup[] {
  const ds = [...dayPnl.keys()].sort(); if (!ds.length) return [];
  const tdays: string[] = [];
  for (let d = addDays(ds[0], -10); d <= addDays(ds[ds.length - 1], 10); d = addDays(d, 1)) { const w = new Date(`${d}T12:00:00Z`).getUTCDay(); if (w && w !== 6 && !NYSE_HOLIDAYS[d]) tdays.push(d); }
  const tag = new Map<string, Set<string>>(), put = (d: string, g: string) => { if (!tag.has(d)) tag.set(d, new Set()); tag.get(d)!.add(g); };
  for (const d of FOMC_PAST) put(d, 'fed');
  for (const e of tradingCalendarEvents(tdays)) put(e.date, e.kind === 'opex' || e.kind === 'quad' ? 'expiry' : e.kind === 'month-end' || e.kind === 'month-start' ? 'month' : e.kind === 'pre-holiday' || e.kind === 'post-holiday' ? 'holiday' : 'other-tag');
  for (let y = Number(ds[0].slice(0, 4)); y <= Number(ds[ds.length - 1].slice(0, 4)); y++) for (const e of calendarEvents(y)) if (kindOf(e.kind)?.cat === 'religious') put(e.date, 'religious');
  const groups: [string, string][] = [['fed', 'Fed decision days'], ['expiry', 'Option expiry days'], ['month', 'First / last day of the month'], ['holiday', 'Day before / after a market holiday'], ['religious', 'Religious holidays (market open)'], ['plain', 'All other days']];
  return groups.map(([key, label]) => {
    const xs = ds.filter((d) => (key === 'plain' ? ![...(tag.get(d) ?? [])].some((g) => g !== 'other-tag') : tag.get(d)?.has(key))).map((d) => dayPnl.get(d)!);
    const total = xs.reduce((a, b) => a + b, 0);
    return { key, label, days: xs.length, total, avg: xs.length ? total / xs.length : 0, green: xs.length ? xs.filter((x) => x > 0).length / xs.length : 0 };
  });
}
