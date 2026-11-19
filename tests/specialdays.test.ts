import { describe, expect, it } from 'vitest';
import { calendarEvents, moonDays } from '../shared/eventDays';
import { historyLines, specialDays } from '../src/lib/specialDays';

describe('special days', () => {
  it('finds the 2026 Jewish holidays on the right dates', () => {
    const by = new Map<string, string[]>(); for (const e of calendarEvents(2026)) by.set(e.kind, [...(by.get(e.kind) ?? []), e.date]);
    expect(by.get('rosh-hashanah')).toEqual(['2026-09-12']); expect(by.get('yom-kippur')).toEqual(['2026-09-21']);
    expect(by.get('passover')).toEqual(['2026-04-02']); expect(by.get('purim')).toEqual(['2026-03-03']);
    expect(by.get('shavuot')).toEqual(['2026-05-22']); expect(by.get('hanukkah-end')).toEqual(['2026-12-12']);
    expect(by.get('super-bowl-monday')).toEqual(['2026-02-09']);
  });
  it('has about twelve or thirteen full moons a year', () => { const n = moonDays(2026).filter((x) => x.kind === 'full-moon').length; expect(n).toBeGreaterThanOrEqual(12); expect(n).toBeLessThanOrEqual(13); });
  it('lists special days in a window, with quad witching and holidays', () => {
    const xs = specialDays('2026-12-01', '2026-12-31');
    expect(xs.some((x) => x.kind === 'quad' && x.date === '2026-12-18')).toBe(true);
    expect(xs.some((x) => x.kind === 'hanukkah')).toBe(true); expect(xs.some((x) => x.kind === 'fomc')).toBe(false);
  });
  it('writes history lines from stats', () => {
    const st = { '^GSPC': [{ kind: 'passover', n: 60, years: [1928, 2026], upPct: 0.63, baseUpPct: 0.52, meanRet: 0.003, relMove: 0.87, measured: false, verdict: 'no measurable difference from a normal day' }] } as any;
    const h = historyLines('passover', st);
    expect(h.lines[0]).toMatch(/S&P 500 index, 60 days 1928–2026: closed up 63%/); expect(h.measured).toBe(false);
  });
});
