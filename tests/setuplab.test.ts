import { describe, expect, it } from 'vitest';
import { gapFills, orb, sessions, sweeps, vwapSeries } from '../shared/setuplab';
import { SETUPS } from '../shared/setups';

// one trading day of 5-minute bars, ET wall clock encoded as UTC: 09:30 .. 15:55
const day = (date: string, path: (i: number) => number, vol = 1000) => Array.from({ length: 78 }, (_, i) => {
  const t = Date.parse(`${date}T09:30:00Z`) / 1000 + i * 300, c = path(i);
  return { time: t, open: c, high: c + 0.1, low: c - 0.1, close: c, volume: vol };
});

describe('setup lab', () => {
  it('groups regular sessions', () => {
    const ss = sessions([...day('2026-11-02', () => 100), ...day('2026-11-03', () => 100)]);
    expect(ss.map((s) => s.date)).toEqual(['2026-11-02', '2026-11-03']);
  });
  it('scores a clean long ORB that reaches 2R', () => {
    // range 99.9-100.1 for 15 min, then a steady climb
    const ss = sessions(day('2026-11-02', (i) => (i < 3 ? 100 : 100 + (i - 2) * 0.1)));
    const o = orb(ss, 15, 2);
    expect(o.trades).toHaveLength(1);
    expect(o.trades[0].side).toBe('long');
    expect(o.trades[0].r).toBe(2);
    expect(o.fake).toBe(0);
  });
  it('counts a stop-out and a fakeout', () => {
    const ss = sessions(day('2026-11-02', (i) => (i < 3 ? 100 : i === 3 ? 100.2 : 99.5)));
    const o = orb(ss, 15, 2);
    expect(o.trades[0].r).toBe(-1);
    expect(o.fake).toBe(100);
  });
  it('vwap equals price when price is flat', () => {
    expect(vwapSeries(day('2026-11-02', () => 50)).at(-1)).toBeCloseTo(50);
  });
  it('daily sweeps and gap fills', () => {
    const d = [{ time: 0, open: 100, high: 101, low: 99, close: 100, volume: 1 }, { time: 1, open: 100.4, high: 102, low: 99.8, close: 100.5, volume: 1 }];
    expect(sweeps(d)).toMatchObject({ upBreaks: 1, upRejected: 100 });
    expect(gapFills(d)[0].up).toEqual({ n: 1, filled: 1 });
  });
  it('every setup has the parts a trader needs', () => {
    for (const s of SETUPS) { expect(s.what.length).toBeGreaterThan(0); expect(s.watch.length).toBeGreaterThan(0); expect(s.why.length).toBeGreaterThan(20); expect(s.invalid.length).toBeGreaterThan(5); }
  });
});
