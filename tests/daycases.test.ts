import { describe, expect, it } from 'vitest';
import { calendarEvents, diwali, easter, fomcFromFedHtml, measureEvents, nthWeekday, orthodoxEaster, tradingCalendarEvents, type DayRow } from '../shared/eventDays';
import { blend, caseOf, classifyDays, dayCases, gapBucket, type Bar } from '../shared/dayCases';

describe('holiday maths', () => {
  it('Easter, Orthodox Easter and nth weekdays', () => {
    expect(easter(2024)).toBe('2024-03-31'); expect(easter(2025)).toBe('2025-04-20'); expect(easter(2026)).toBe('2026-04-05');
    expect(orthodoxEaster(2024)).toBe('2024-05-05'); expect(orthodoxEaster(2025)).toBe('2025-04-20'); expect(orthodoxEaster(2026)).toBe('2026-04-12');
    expect(nthWeekday(2026, 11, 4, 4)).toBe('2026-11-26'); // Thanksgiving
    expect(nthWeekday(2026, 10, 1, 2)).toBe('2026-10-12'); // Columbus Day
    expect(nthWeekday(2026, 5, 1, -1)).toBe('2026-05-25'); // Memorial Day
  });
  it('Jewish, Islamic and Chinese dates from the built-in calendars', () => {
    const e = calendarEvents(2025);
    const on = (k: string) => e.filter((x) => x.kind === k).map((x) => x.date);
    expect(on('rosh-hashanah')).toEqual(['2025-09-23']);
    expect(on('yom-kippur')).toEqual(['2025-10-02']);
    expect(on('passover')).toEqual(['2025-04-13']);
    expect(on('ramadan')).toEqual(['2025-03-01']);
    expect(on('eid-fitr')).toEqual(['2025-03-30']);
    expect(on('lunar-new-year')).toEqual(['2025-01-29']);
    expect(on('veterans')).toEqual(['2025-11-11']);
    expect(calendarEvents(2028).find((x) => x.kind === 'election')?.date).toBe('2028-11-07');
    expect(['2025-10-20', '2025-10-21']).toContain(diwali(2025)); // approximate by design
  });
  it('market days from the trading calendar', () => {
    const days = ['2026-11-19', '2026-11-20', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-27', '2026-11-30', '2026-12-01'];
    const ev = tradingCalendarEvents(days);
    const kinds = (d: string) => ev.filter((x) => x.date === d).map((x) => x.kind).sort();
    expect(kinds('2026-11-20')).toEqual(['opex']);
    expect(kinds('2026-11-25')).toEqual(['pre-holiday']);
    expect(kinds('2026-11-27')).toEqual(['black-friday', 'post-holiday']);
    expect(kinds('2026-11-30')).toEqual(['month-end']);
    expect(kinds('2026-12-01')).toEqual(['month-start']);
  });
  it('reads FOMC dates from both kinds of Fed links', () => {
    expect(fomcFromFedHtml('<a href="/newsevents/pressreleases/monetary20240131a.htm"> <a href="/boarddocs/press/monetary/2005/20050322/">')).toEqual(['2005-03-22', '2024-01-31']);
  });
});

describe('measuring a day type', () => {
  const rows: DayRow[] = Array.from({ length: 2000 }, (_, i) => ({ date: new Date(Date.UTC(2010, 0, 1) + i * 86400_000).toISOString().slice(0, 10), ret: (i % 7 === 0 ? 0.004 : 0) + (i % 2 ? 0.003 : -0.003), rel: i % 7 === 0 ? 2 : 1 }));
  it('flags a big, stable difference and ignores a tiny sample', () => {
    const ev = rows.filter((_, i) => i % 7 === 0).map((r) => ({ date: r.date, kind: 'fomc' }));
    const s = measureEvents(rows, [...ev, { date: rows[1].date, kind: 'diwali' }], 'SPY');
    expect(s.find((x) => x.kind === 'fomc')!.measured).toBe(true);
    expect(s.find((x) => x.kind === 'fomc')!.verdict).toContain('moves 2.0x');
    expect(s.find((x) => x.kind === 'diwali')!.verdict).toBe('too few days in the history to measure');
  });
});

describe('day cases', () => {
  const bars: Bar[] = [];
  let p = 100;
  for (let i = 0; i < 600; i++) { const r = Math.sin(i * 1.7) * 0.01; const o = p; p = p * (1 + r); bars.push({ date: new Date(Date.UTC(2023, 0, 2) + i * 86400_000).toISOString().slice(0, 10), open: o, high: Math.max(o, p) * 1.002, low: Math.min(o, p) * 0.998, close: p }); }
  it('classifies days against their own normal move', () => {
    expect(caseOf(0.01, 0.01)).toBe('bull'); expect(caseOf(-0.003, 0.01)).toBe('bear'); expect(caseOf(0.002, 0.01)).toBe('stag');
    expect(gapBucket(-1.5)).toBe('big gap down'); expect(gapBucket(0.1)).toBe('flat open'); expect(gapBucket(null)).toBeNull();
    const d = classifyDays(bars);
    expect(d.length).toBeGreaterThan(500);
  });
  it('blends toward the all-days rate when samples are small, and sums to 1', () => {
    const base = { bull: 0.4, stag: 0.3, bear: 0.3, n: 1000 };
    const b1 = blend(base, [{ id: 'x', label: 'x', dist: { bull: 1, stag: 0, bear: 0, n: 5 } }]);
    expect(b1.bull).toBeLessThan(0.5);
    expect(b1.bull + b1.stag + b1.bear).toBeCloseTo(1, 6);
  });
  it('builds three cases with levels and no trade instructions', () => {
    const c = dayCases('SPY', bars, '2024-08-26', { last: p * 0.99, high: p, low: p * 0.985, at: 0 }, [], [], 5)!;
    expect(c.cases.map((k) => k.id)).toEqual(['bull', 'stag', 'bear']);
    expect(c.cases.reduce((a, k) => a + k.p, 0)).toBeCloseTo(1, 6);
    expect(c.gapPct).toBeCloseTo(-1, 5);
    expect(c.factors.some((f) => f.id === 'gap')).toBe(true);
    expect(JSON.stringify(c)).not.toMatch(/\b(call|put|entry|stop loss|target)\b/i);
  });
});
