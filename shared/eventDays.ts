// Special days that could move markets, computed (no paid source, no library):
//  - religious: Jewish (Hebrew calendar), Islamic (Umm al-Qura), Chinese New Year (Chinese calendar) via the built-in Intl
//    calendars; Western and Orthodox Easter by computus; Diwali from the new moon (approximate, labelled).
//  - US federal days the stock market stays open (Veterans Day, Columbus Day).
//  - market days: FOMC decisions (Federal Reserve's own pages), CPI and jobs reports (FRED release dates), option expiry,
//    quad witching, month / quarter ends, the days around market holidays (read from the price history itself), election day.
// Then measureEvents() checks each kind against real index history and keeps only the ones with a measurable effect.

export type EventCat = 'market' | 'religious' | 'federal';
export interface EventKind { id: string; label: string; cat: EventCat; note?: string; approx?: boolean }
export interface EventDay { date: string; kind: string }

export const KINDS: EventKind[] = [
  { id: 'fomc', label: 'Fed decision day (FOMC)', cat: 'market' },
  { id: 'pre-fomc', label: 'Day before a Fed decision', cat: 'market' },
  { id: 'cpi', label: 'CPI inflation report', cat: 'market' },
  { id: 'jobs', label: 'Jobs report (payrolls)', cat: 'market' },
  { id: 'opex', label: 'Monthly option expiry', cat: 'market' },
  { id: 'quad', label: 'Quad witching (quarterly expiry)', cat: 'market' },
  { id: 'month-end', label: 'Last trading day of the month', cat: 'market' },
  { id: 'month-start', label: 'First trading day of the month', cat: 'market' },
  { id: 'quarter-end', label: 'Last trading day of the quarter', cat: 'market' },
  { id: 'pre-holiday', label: 'Day before a market holiday', cat: 'market' },
  { id: 'post-holiday', label: 'Day after a market holiday', cat: 'market' },
  { id: 'black-friday', label: 'Day after Thanksgiving (early close)', cat: 'market' },
  { id: 'santa', label: 'Santa Claus rally window (last 5 + first 2 days)', cat: 'market' },
  { id: 'election', label: 'US election day', cat: 'market' },
  { id: 'veterans', label: 'Veterans Day (bond market closed)', cat: 'federal' },
  { id: 'columbus', label: 'Columbus / Indigenous Peoples Day (bond market closed)', cat: 'federal' },
  { id: 'rosh-hashanah', label: 'Rosh Hashanah', cat: 'religious' },
  { id: 'yom-kippur', label: 'Yom Kippur', cat: 'religious' },
  { id: 'passover', label: 'Passover (first day)', cat: 'religious' },
  { id: 'hanukkah', label: 'Hanukkah (first day)', cat: 'religious' },
  { id: 'good-friday-eve', label: 'Day before Good Friday', cat: 'religious' },
  { id: 'easter-monday', label: 'Easter Monday (Europe closed)', cat: 'religious' },
  { id: 'orthodox-easter', label: 'Orthodox Easter Monday', cat: 'religious' },
  { id: 'christmas-eve', label: 'Christmas Eve', cat: 'religious' },
  { id: 'ramadan', label: 'Ramadan begins', cat: 'religious' },
  { id: 'eid-fitr', label: 'Eid al-Fitr', cat: 'religious' },
  { id: 'eid-adha', label: 'Eid al-Adha', cat: 'religious' },
  { id: 'lunar-new-year', label: 'Lunar (Chinese) New Year', cat: 'religious', note: 'Asian markets close for several days' },
  { id: 'diwali', label: 'Diwali', cat: 'religious', approx: true, note: 'date from the new moon; may be a day off' },
];
export const kindOf = (id: string) => KINDS.find((k) => k.id === id);

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const addDays = (s: string, n: number) => new Date(Date.parse(`${s}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const dow = (s: string) => new Date(`${s}T12:00:00Z`).getUTCDay();

/** Western (Gregorian) Easter Sunday, anonymous Gregorian algorithm. */
export function easter(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(y, month, day);
}
/** Orthodox Easter Sunday (Julian computus, shown on the Gregorian calendar: +13 days for 1900-2099). */
export function orthodoxEaster(y: number): string {
  const a = y % 4, b = y % 7, c = y % 19, d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31), day = ((d + e + 114) % 31) + 1;
  return addDays(ymd(y, month, day), 13);
}
/** n-th weekday (0 = Sunday) of a month; n = -1 for the last one. */
export function nthWeekday(y: number, m: number, wd: number, n: number): string {
  if (n > 0) { const first = dow(ymd(y, m, 1)); return ymd(y, m, 1 + ((wd - first + 7) % 7) + (n - 1) * 7); }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(), last = dow(ymd(y, m, lastDay));
  return ymd(y, m, lastDay - ((last - wd + 7) % 7));
}

/** Every day of a year in another calendar system: month name / number and day, from the built-in Intl calendars. */
function scanCalendar(y: number, cal: 'hebrew' | 'islamic-umalqura' | 'chinese', want: (month: string, day: number) => string | null): EventDay[] {
  const fmt = new Intl.DateTimeFormat(`en-u-ca-${cal}`, { timeZone: 'UTC', month: cal === 'hebrew' ? 'long' : 'numeric', day: 'numeric' });
  const out: EventDay[] = [];
  for (let t = Date.UTC(y, 0, 1); t < Date.UTC(y + 1, 0, 1); t += 86400_000) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t + 12 * 3600_000)).map((x) => [x.type, x.value]));
    const k = want(String(p.month), Number(p.day));
    if (k) out.push({ date: new Date(t).toISOString().slice(0, 10), kind: k });
  }
  return out;
}

/** Diwali (Lakshmi Puja): the new moon between mid-October and mid-November, India time. Approximate (can be a day off). */
export function diwali(y: number): string {
  const synodic = 29.530588853, ref = Date.UTC(2000, 0, 6, 18, 14); // a known new moon
  const lo = Date.UTC(y, 9, 14), hi = Date.UTC(y, 10, 15);
  let k = Math.ceil((lo - ref) / 86400_000 / synodic);
  for (; ; k++) {
    const t = ref + k * synodic * 86400_000;
    if (t > hi) break;
    if (t >= lo) { const ist = new Date(t + 5.5 * 3600_000); const d = ist.toISOString().slice(0, 10); return ist.getUTCHours() < 18 ? addDays(d, -1) : d; } // India time; a new moon before ~6 pm means the evening before
  }
  return ymd(y, 11, 1);
}

/** Religious and federal days for a year (calendar days; whether markets trade is decided later from the price history). */
export function calendarEvents(y: number): EventDay[] {
  const out: EventDay[] = [];
  out.push(...scanCalendar(y, 'hebrew', (m, d) => (m === 'Tishri' && d === 1 ? 'rosh-hashanah' : m === 'Tishri' && d === 10 ? 'yom-kippur' : m === 'Nisan' && d === 15 ? 'passover' : m === 'Kislev' && d === 25 ? 'hanukkah' : null)));
  out.push(...scanCalendar(y, 'islamic-umalqura', (m, d) => (m === '9' && d === 1 ? 'ramadan' : m === '10' && d === 1 ? 'eid-fitr' : m === '12' && d === 10 ? 'eid-adha' : null)));
  out.push(...scanCalendar(y, 'chinese', (m, d) => (m === '1' && d === 1 ? 'lunar-new-year' : null)));
  const e = easter(y);
  out.push({ date: addDays(e, -3), kind: 'good-friday-eve' }, { date: addDays(e, 1), kind: 'easter-monday' }, { date: addDays(orthodoxEaster(y), 1), kind: 'orthodox-easter' });
  out.push({ date: ymd(y, 12, 24), kind: 'christmas-eve' }, { date: diwali(y), kind: 'diwali' });
  // Veterans Day: Nov 11, or the Friday / Monday it is observed on when it falls on a weekend
  const v = ymd(y, 11, 11), vd = dow(v);
  out.push({ date: vd === 6 ? addDays(v, -1) : vd === 0 ? addDays(v, 1) : v, kind: 'veterans' });
  out.push({ date: nthWeekday(y, 10, 1, 2), kind: 'columbus' });
  if (y % 2 === 0) out.push({ date: addDays(nthWeekday(y, 11, 1, 1), 1), kind: 'election' });
  return out;
}

/** Market days that follow from the trading calendar itself: expiries, month / quarter turns, days around holidays. */
export function tradingCalendarEvents(tradingDays: string[]): EventDay[] {
  const set = new Set(tradingDays), out: EventDay[] = [];
  for (let i = 0; i < tradingDays.length; i++) {
    const d = tradingDays[i], prev = tradingDays[i - 1], next = tradingDays[i + 1];
    const [y, m, day] = d.split('-').map(Number);
    // option expiry: the 3rd Friday, or the Thursday before when that Friday is a holiday
    const third = nthWeekday(y, m, 5, 3);
    const opex = set.has(third) ? third : addDays(third, -1);
    if (d === opex) out.push({ date: d, kind: [3, 6, 9, 12].includes(m) ? 'quad' : 'opex' });
    if (next && next.slice(0, 7) !== d.slice(0, 7)) { out.push({ date: d, kind: 'month-end' }); if ([3, 6, 9, 12].includes(m)) out.push({ date: d, kind: 'quarter-end' }); }
    if (prev && prev.slice(0, 7) !== d.slice(0, 7)) out.push({ date: d, kind: 'month-start' });
    // a weekday with no trading between two trading days = a market holiday
    const gap = (a: string, b: string) => { for (let x = addDays(a, 1); x < b; x = addDays(x, 1)) if (dow(x) !== 0 && dow(x) !== 6) return true; return false; };
    if (next && gap(d, next)) out.push({ date: d, kind: 'pre-holiday' });
    if (prev && gap(prev, d)) out.push({ date: d, kind: 'post-holiday' });
    if (d === addDays(nthWeekday(y, 11, 4, 4), 1)) out.push({ date: d, kind: 'black-friday' });
    if ((m === 12 && tradingDays.slice(i + 1, i + 6).some((x) => x.startsWith(`${y + 1}-`))) || (m === 1 && day <= 7 && tradingDays.slice(Math.max(0, i - 2), i).some((x) => x.startsWith(`${y - 1}-`)))) out.push({ date: d, kind: 'santa' });
    void day;
  }
  return out;
}

/** FOMC statement dates from the Federal Reserve's pages: press releases are monetaryYYYYMMDDa.htm (2006 on) or
 *  boarddocs/press/monetary/YYYY/YYYYMMDD (before). */
export const fomcFromFedHtml = (html: string): string[] => [...new Set([
  ...[...html.matchAll(/monetary(\d{4})(\d{2})(\d{2})a\d?\.htm/g)].map((m) => `${m[1]}-${m[2]}-${m[3]}`),
  ...[...html.matchAll(/boarddocs\/press\/monetary\/\d{4}\/(\d{4})(\d{2})(\d{2})/g)].map((m) => `${m[1]}-${m[2]}-${m[3]}`),
])].sort();

/** Jobs report fallback when FRED's release dates aren't available: the first Friday of the month (BLS's usual day; a few
 *  months it moves, so these dates are labelled approximate). */
export function firstFridays(y: number): string[] { return Array.from({ length: 12 }, (_, i) => nthWeekday(y, i + 1, 5, 1)); }

/* ---------------- measuring each kind against real history ---------------- */
export interface DayRow { date: string; ret: number; rel: number }
export interface EventStat {
  kind: string; label: string; cat: EventCat; n: number; meanRet: number; upPct: number; relMove: number;
  baseMeanRet: number; baseUpPct: number; tRet: number; tMove: number; measured: boolean; verdict: string; sym: string; years: [number, number] | null; approx?: boolean; note?: string;
}

/** Daily closes -> per-day return and "relative move" (|return| / average |return| of the prior 20 days, so 1.0 = a usual day). */
export function dayRows(bars: { date: string; close: number }[]): DayRow[] {
  const out: DayRow[] = [];
  for (let i = 21; i < bars.length; i++) {
    const r = bars[i].close / bars[i - 1].close - 1;
    let s = 0;
    for (let k = i - 20; k < i; k++) s += Math.abs(bars[k].close / bars[k - 1].close - 1);
    const base = s / 20;
    if (Number.isFinite(r) && base > 0) out.push({ date: bars[i].date, ret: r, rel: Math.abs(r) / base });
  }
  return out;
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1)); };

/** For each event kind: how the index did on those days vs all days. "measured" = a real difference: |t| >= 2.5 on the return or on
 *  the size of the move (about 30 kinds are tested, so a looser bar would flag some by chance), at least 12 days of history, and the
 *  same direction in the older and the newer half of those days. Everything else is kept but marked not measurable. */
export function measureEvents(rows: DayRow[], events: EventDay[], sym: string): EventStat[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const allRet = rows.map((r) => r.ret), allRel = rows.map((r) => r.rel);
  const bm = mean(allRet), bsd = sd(allRet), bup = allRet.filter((r) => r > 0).length / allRet.length;
  const relSd = sd(allRel);
  return KINDS.map((k) => {
    const hits = [...new Set(events.filter((e) => e.kind === k.id).map((e) => e.date))].map((d) => byDate.get(d)).filter((r): r is DayRow => !!r);
    const n = hits.length;
    const ret = hits.map((h) => h.ret), rel = hits.map((h) => h.rel);
    const mr = mean(ret), up = n ? ret.filter((r) => r > 0).length / n : 0, mrel = mean(rel);
    const tRet = n ? (mr - bm) / (bsd / Math.sqrt(n)) : 0, tMove = n ? (mrel - 1) / (relSd / Math.sqrt(n)) : 0;
    const half = Math.floor(n / 2), older = hits.slice(0, half), newer = hits.slice(half);
    const sameRet = n >= 12 && Math.sign(mean(older.map((h) => h.ret)) - bm) === Math.sign(mean(newer.map((h) => h.ret)) - bm);
    const sameMove = n >= 12 && Math.sign(mean(older.map((h) => h.rel)) - 1) === Math.sign(mean(newer.map((h) => h.rel)) - 1);
    const retOk = n >= 12 && Math.abs(tRet) >= 2.5 && sameRet, moveOk = n >= 12 && Math.abs(tMove) >= 2.5 && sameMove;
    const measured = retOk || moveOk;
    const parts: string[] = [];
    if (retOk) parts.push(mr > bm ? `tends to close up (${(up * 100).toFixed(0)}% of the time vs ${(bup * 100).toFixed(0)}% normally)` : `tends to close down (up only ${(up * 100).toFixed(0)}% of the time vs ${(bup * 100).toFixed(0)}% normally)`);
    if (moveOk) parts.push(mrel > 1 ? `moves ${mrel.toFixed(1)}x a usual day` : `quieter than usual (${mrel.toFixed(1)}x a usual day)`);
    const years = hits.length ? [Number(hits[0].date.slice(0, 4)), Number(hits[hits.length - 1].date.slice(0, 4))] as [number, number] : null;
    return {
      kind: k.id, label: k.label, cat: k.cat, n, meanRet: mr, upPct: up, relMove: mrel, baseMeanRet: bm, baseUpPct: bup, tRet, tMove, measured, sym, years,
      verdict: measured ? `${sym} ${parts.join('; ')}` : n < 12 ? 'too few days in the history to measure' : 'no measurable difference from a normal day',
      ...(k.approx ? { approx: true } : {}), ...(k.note ? { note: k.note } : {}),
    };
  });
}
