import { afterEach, describe, expect, it } from 'vitest';
import { clock, etToUtc, lastSessionDates, phasesFor } from '../shared/clock';
import { resetMarketCalendar, setMarketCalendar } from '../shared/marketCalendar';
import { computeBase } from '../shared/scan';
import { encodeEtWall } from '../shared/parse';
import { barsFrom, ramp } from './helpers';

afterEach(() => resetMarketCalendar());
const at = (mo: number, d: number, h: number, mi = 0, y = 2026) => clock(etToUtc(y, mo, d, h, mi));

describe('holidays and early closes (NYSE 2026 calendar)', () => {
  it('Thanksgiving is closed all day and counts down to Friday’s open', () => {
    const c = at(11, 26, 11);
    expect(c).toMatchObject({ holiday: 'Thanksgiving Day', session: 'Closed', mode: 'after' });
    expect(c.toOpen).toBe(22.5 * 3600); // Fri 9:30
  });
  it('day after Thanksgiving closes at 1:00 PM: power hour from noon, after-hours from 1', () => {
    expect(at(11, 27, 11, 30).mode).toBe('midday');
    expect(at(11, 27, 12, 15).mode).toBe('power');
    expect(at(11, 27, 13, 5)).toMatchObject({ mode: 'after', session: 'After-hours' });
    expect(at(11, 27, 12, 0).toClose).toBe(3600);
    expect(at(11, 27, 10).earlyClose).toMatch(/Day after Thanksgiving: closes 1:00 PM ET/);
    expect(at(11, 27, 17, 30).session).toBe('Closed'); // early-close days end the late session at 5 PM
    expect(phasesFor(13 * 3600).map((p) => p.start / 3600)).toEqual([4, 9.5, 11, 12, 13]);
  });
  it('Christmas week: Christmas Eve early close, Christmas closed, next open Monday the 28th', () => {
    expect(at(12, 24, 14).session).toBe('After-hours');
    const c = at(12, 24, 16);
    expect(c.nextLabel).toBe('Pre-market');
    expect(c.toNext).toBe((24 * 3 + 12) * 3600); // Mon 12/28 4:00
    expect(at(12, 25, 10).holiday).toBe('Christmas Day');
  });
  it('July 3 2026 (Independence Day observed, a Friday): Thursday after the close counts to Monday', () => {
    expect(at(7, 2, 17).toOpen).toBe((16.5 + 24 * 3) * 3600);
  });
  it('normal day unchanged', () => {
    expect(at(11, 4, 15, 30)).toMatchObject({ mode: 'power', holiday: null, earlyClose: null, closeSod: 16 * 3600 });
  });
  it('unscheduled closure from the status feed closes the day', () => {
    setMarketCalendar({ unscheduled: { '2026-11-04': 'National Day of Mourning' } });
    expect(at(11, 4, 11)).toMatchObject({ holiday: 'National Day of Mourning', session: 'Closed' });
  });
  it('session history skips holidays', () => {
    const d = lastSessionDates(3, etToUtc(2026, 11, 30, 12, 0)); // Mon after Thanksgiving week
    expect(d.map((x) => `${x.mo}/${x.d}`)).toEqual(['11/25', '11/27', '11/30']);
  });
  it('RVOL uses the shorter session on early-close days', () => {
    const bars = barsFrom(ramp(50, 60, 60), { end: Date.UTC(2026, 10, 27) / 1000, vol: (i) => (i === 59 ? 500_000 : 1_000_000) });
    // 12:00 on a 1 PM close = 150 of 210 minutes -> same point on the curve as 278 of 390 minutes
    const b = computeBase('X', bars, encodeEtWall('2026-11-27 12:00:00'), 0, 't');
    expect(b.rvol).toBeGreaterThan(0.5);
    expect(b.rvol).toBeLessThan(0.9);
  });
});
