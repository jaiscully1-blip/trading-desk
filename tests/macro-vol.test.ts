import { describe, expect, it } from 'vitest';
import { closeToClose, garmanKlass, parkinson, rankPct, volOfVol, volRead, yangZhang } from '../shared/volatility';
import { isMonthlyOpex, moveStats } from '../shared/movementStats';
import { liquiditySummary, toBillions, valueAsOf } from '../shared/liquidity';
import type { Bar } from '../shared/types';

const DAY = 86400;
const t0 = Date.UTC(2026, 0, 5) / 1000; // a Monday
/** weekday-only bars: each day opens at the prior close, closes `ret` higher/lower, and has a fixed high-low spread */
function bars(n: number, ret: (i: number) => number, spread = 0.01): Bar[] {
  const out: Bar[] = []; let px = 100; let t = t0;
  for (let i = 0; i < n; i++) {
    while ([0, 6].includes(new Date(t * 1000).getUTCDay())) t += DAY;
    const open = px, close = px * (1 + ret(i));
    out.push({ time: t, open, close, high: Math.max(open, close) * (1 + spread / 2), low: Math.min(open, close) * (1 - spread / 2), volume: 1000 });
    px = close; t += DAY;
  }
  return out;
}

describe('volatility estimators', () => {
  it('close-to-close is zero for a steady drift and matches the log-return deviation otherwise', () => {
    const flat = bars(30, () => 0.001);
    expect(closeToClose(flat, 20)).toBeCloseTo(0, 6);
    const zig = bars(30, (i) => (i % 2 ? 0.01 : -0.01));
    expect(closeToClose(zig, 20)!).toBeGreaterThan(0.15);
  });
  it('Parkinson equals sqrt(ln(h/l)^2 / (4 ln 2)) x sqrt(252) when every day has the same range', () => {
    const b = bars(25, () => 0, 0.02);
    const r = Math.log(1.01 / 0.99);
    expect(parkinson(b, 20)!).toBeCloseTo(Math.sqrt(r * r / (4 * Math.LN2)) * Math.sqrt(252), 6);
  });
  it('estimators need enough history', () => {
    const b = bars(10, () => 0.001);
    expect(closeToClose(b, 20)).toBeNull();
    expect(yangZhang(b, 20)).toBeNull();
    expect(garmanKlass(b, 20)).toBeNull();
  });
  it('Yang-Zhang sees overnight gaps that Parkinson ignores', () => {
    const calm = bars(30, () => 0, 0.004);
    const gappy = calm.map((b, i) => (i % 2 ? { ...b, open: b.open * 1.02, high: b.high * 1.02, low: b.low * 1.02, close: b.close * 1.02 } : b));
    expect(yangZhang(gappy, 20)!).toBeGreaterThan(yangZhang(calm, 20)! * 2);
  });
  it('rank is the position between low and high; percentile is the share below', () => {
    const v = Array.from({ length: 100 }, (_, i) => 10 + i / 10); // 10 .. 19.9, rising
    const r = rankPct(v)!;
    expect(r.rank).toBeCloseTo(100, 6);
    expect(r.percentile).toBeCloseTo(99, 6);
    expect(rankPct([1, 2])).toBeNull();
  });
  it('vol of vol and the premium over realized are returned together', () => {
    expect(volOfVol(Array.from({ length: 30 }, () => 20), 20)).toBeCloseTo(0, 9);
    const vix = Array.from({ length: 60 }, (_, i) => 18 + (i % 5));
    const r = volRead(vix, bars(40, (i) => (i % 2 ? 0.004 : -0.004)))!;
    expect(r.premium).toBeCloseTo(vix[vix.length - 1] - r.realized.yangZhang! * 100, 9);
    expect(volRead([1], [])).toBeNull();
  });
});

describe('move stats by day type', () => {
  it('finds the third Friday as monthly options expiration', () => {
    expect(isMonthlyOpex('2026-11-20')).toBe(true);
    expect(isMonthlyOpex('2026-11-13')).toBe(false);
    expect(isMonthlyOpex('2026-11-19')).toBe(false);
  });
  it('flags big days on an event date and quiet days elsewhere', () => {
    const b = bars(120, (i) => (i % 40 === 30 ? 0.03 : 0.002 * (i % 2 ? 1 : -1)));
    const ev = new Date(b[70].time * 1000).toISOString().slice(0, 10); // i = 70 -> 70 % 40 = 30: the 3% day
    const s = moveStats(b, { cpi: [ev, new Date(b[75].time * 1000).toISOString().slice(0, 10), new Date(b[80].time * 1000).toISOString().slice(0, 10)] })!;
    const cpi = s.events.find((e) => e.key === 'cpi')!;
    expect(cpi.n).toBe(3);
    expect(s.all.n).toBeGreaterThan(80);
    expect(s.weekday).toHaveLength(5);
    expect(s.all.bigPct).toBeGreaterThan(0);
  });
  it('gap fill and continuation are counted per direction', () => {
    // alternate: gap up and sell off through the prior close (fills, does not continue), then flat days
    const out: Bar[] = []; let px = 100; let t = t0;
    for (let i = 0; i < 90; i++) {
      while ([0, 6].includes(new Date(t * 1000).getUTCDay())) t += DAY;
      const gapDay = i % 3 === 0 && i > 25;
      const open = gapDay ? px * 1.01 : px, close = gapDay ? px * 0.995 : px * 1.0005;
      out.push({ time: t, open, close, high: Math.max(open, close) * 1.001, low: Math.min(open, close, gapDay ? px * 0.994 : 99999) * 0.999, volume: 1 });
      px = close; t += DAY;
    }
    const s = moveStats(out)!;
    expect(s.gaps.up.n).toBeGreaterThan(10);
    expect(s.gaps.up.fillPct).toBeGreaterThan(90);
    expect(s.gaps.up.continuePct).toBeLessThan(10);
    expect(s.overnightVarShare).toBeGreaterThan(0);
  });
  it('needs enough history', () => {
    expect(moveStats(bars(30, () => 0.001))).toBeNull();
  });
});

describe('liquidity summary', () => {
  const weekly = (v: number[], end = '2026-11-04') => v.map((x, i) => ({ date: new Date(Date.parse(`${end}T12:00:00Z`) - (v.length - 1 - i) * 7 * 86400_000).toISOString().slice(0, 10), value: x }));
  it('puts everything in billions (WALCL and WTREGEN come in millions)', () => {
    expect(toBillions('WALCL', 6_500_000)).toBe(6500);
    expect(toBillions('WTREGEN', 800_000)).toBe(800);
    expect(toBillions('RRPONTSYD', 120)).toBe(120);
  });
  it('carries the last known value forward', () => {
    const s = [{ date: '2026-10-01', value: 5 }, { date: '2026-10-08', value: 7 }];
    expect(valueAsOf(s, '2026-10-05')).toBe(5);
    expect(valueAsOf(s, '2026-09-01')).toBeNull();
    expect(valueAsOf(s, '2026-12-01')).toBe(7);
  });
  it('net liquidity is Fed assets minus Treasury cash minus reverse repo, with changes', () => {
    const rows = liquiditySummary({
      WALCL: weekly([6_400_000, 6_410_000, 6_420_000, 6_430_000, 6_440_000, 6_450_000]),
      WTREGEN: weekly([800_000, 800_000, 800_000, 800_000, 800_000, 900_000]),
      RRPONTSYD: weekly([100, 100, 100, 100, 100, 50]),
    });
    const net = rows.find((r) => r.id === 'NET')!;
    expect(net.calculated).toBe(true);
    expect(net.value).toBeCloseTo(6450 - 900 - 50, 6);
    expect(net.chg1w).toBeCloseTo((6450 - 900 - 50) - (6440 - 800 - 100), 6);
    expect(rows.find((r) => r.id === 'WALCL')!.value).toBe(6450);
  });
  it('skips net liquidity when a piece is missing and tolerates empty input', () => {
    expect(liquiditySummary({ WALCL: weekly([6_400_000, 6_410_000]) }).some((r) => r.id === 'NET')).toBe(false);
    expect(liquiditySummary({})).toEqual([]);
  });
});
