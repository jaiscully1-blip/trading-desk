import { describe, expect, it } from 'vitest';
import { bullFlag, computeBase, cupHandle, liveRow, rankRs, volumeFraction, type ScanBase } from '../shared/scan';
import { encodeEtWall } from '../shared/parse';
import { barsFrom, ramp } from './helpers';

const NOW_AFTER_CLOSE = encodeEtWall('2026-11-03 17:00:00');
const NOW_1100 = encodeEtWall('2026-11-03 11:00:00');

describe('volume curve', () => {
  it('is 0 at the open, 1 at the close, monotonic', () => {
    expect(volumeFraction(0)).toBe(0);
    expect(volumeFraction(390)).toBe(1);
    expect(volumeFraction(90)).toBeCloseTo(0.32);
    let prev = 0;
    for (let m = 0; m <= 390; m += 15) { const f = volumeFraction(m); expect(f).toBeGreaterThanOrEqual(prev); prev = f; }
  });
});

describe('computeBase', () => {
  const closes = ramp(50, 100, 300);
  it('separates today\'s forming bar from completed sessions', () => {
    const bars = barsFrom(closes, { vol: (i) => (i === 299 ? 960_000 : 1_000_000) });
    const b = computeBase('X', bars, NOW_1100, 0, 't');
    expect(b.formingIsToday).toBe(true);
    expect(b.prevClose).toBeCloseTo(closes[298]);
    expect(b.c5).toBeCloseTo(closes[294]);
    expect(b.hi20).toBeCloseTo(Math.max(...bars.slice(279, 299).map((x) => x.high)));
    // 960k by 11:00 (32% of a typical day) vs 1M average -> 3.0x
    expect(b.rvol).toBeCloseTo(0.96 / 0.32, 2);
    expect(b.sma20).toBeCloseTo(closes.slice(279, 299).reduce((a, c) => a + c, 0) / 20);
  });
  it('treats the last bar as completed when it is not today', () => {
    const bars = barsFrom(closes, { end: Date.UTC(2026, 10, 2) / 1000 });
    const b = computeBase('X', bars, NOW_AFTER_CLOSE, 0, 't');
    expect(b.formingIsToday).toBe(false);
    expect(b.rvol).toBeNull();
    expect(b.prevClose).toBeCloseTo(closes[298]);
  });
});

describe('bull flag', () => {
  const base = Array(30).fill(10);
  const pole = ramp(10, 12.5, 8); // +25% in 8 bars
  const flag = [12.3, 12.2, 12.0, 11.9, 12.0, 11.95];
  const vol = (poleStart: number, flagStart: number, flagVol: number) => (i: number) => (i >= flagStart ? flagVol : i >= poleStart ? 3e6 : 1e6);

  it('finds pole + tight flag on lighter volume', () => {
    const c = [...base, ...pole, ...flag];
    const hit = bullFlag(barsFrom(c, { vol: vol(30, 38, 1e6) }));
    expect(hit.ok).toBe(true);
    expect(hit.trigger).toBeGreaterThan(12);
    expect(hit.detail).toMatch(/flag/);
  });
  it('rejects a flag that gives back more than half the pole', () => {
    const c = [...base, ...pole, 12, 11.5, 11, 10.8, 10.9, 11];
    expect(bullFlag(barsFrom(c, { vol: vol(30, 38, 1e6) })).ok).toBe(false);
  });
  it('rejects a flag on heavier volume than the pole', () => {
    const c = [...base, ...pole, ...flag];
    expect(bullFlag(barsFrom(c, { vol: vol(30, 38, 5e6) })).ok).toBe(false);
  });
});

describe('cup and handle', () => {
  const lead = ramp(80, 100, 20);
  const down = Array.from({ length: 20 }, (_, i) => 100 - 25 * Math.sin(((i + 1) / 20) * (Math.PI / 2))); // to 75
  const up = Array.from({ length: 20 }, (_, i) => 75 + 24 * Math.sin(((i + 1) / 20) * (Math.PI / 2))); // to 99
  const handle = [97, 95.5, 95, 95.8, 96.5, 97];

  it('finds a rounded 25% cup with a shallow handle', () => {
    const hit = cupHandle(barsFrom([...lead, ...down, ...up, ...handle], { range: 0.002 }));
    expect(hit.ok).toBe(true);
    expect(hit.trigger).toBeGreaterThan(98);
  });
  it('rejects a cup that is too deep (50%)', () => {
    const deep = down.map((x) => 100 - (100 - x) * 2);
    const deepUp = up.map((x) => 50 + ((x - 75) * 49) / 24);
    expect(cupHandle(barsFrom([...lead, ...deep, ...deepUp, ...handle], { range: 0.002 })).ok).toBe(false);
  });
  it('rejects a handle that drops into the lower half of the cup', () => {
    expect(cupHandle(barsFrom([...lead, ...down, ...up, 95, 90, 85, 84, 86, 88], { range: 0.002 })).ok).toBe(false);
  });
});

describe('live rows and RS rank', () => {
  const mk = (sym: string, closes: number[]) => computeBase(sym, barsFrom(closes), NOW_AFTER_CLOSE, 0, 't');
  const flat = Array(100).fill(100);
  const spy = mk('SPY', [...flat.slice(0, 40), ...ramp(100, 110, 60)]);
  const strong = mk('AAA', [...flat.slice(0, 40), ...ramp(100, 150, 60)]);
  const weak = mk('BBB', [...flat.slice(0, 40), ...ramp(100, 95, 60)]);

  it('RS is the stock return minus SPY return', () => {
    const r = liveRow(strong, undefined, { base: spy });
    expect(r.ret20! - (spy.last / spy.c20! - 1) * 100).toBeCloseTo(r.rs20!);
    expect(r.rs20!).toBeGreaterThan(0);
    expect(liveRow(weak, undefined, { base: spy }).rs20!).toBeLessThan(0);
  });

  it('ranks 1-99 across the universe, excluding the indexes', () => {
    const mid = mk('CCC', [...flat.slice(0, 40), ...ramp(100, 115, 60)]);
    const ranked = rankRs([spy, strong, weak, mid].map((b) => liveRow(b, undefined, { base: spy })));
    const by = Object.fromEntries(ranked.map((r) => [r.sym, r.rsRank]));
    expect(by).toEqual({ SPY: null, AAA: 99, BBB: 1, CCC: 50 });
  });

  it('uses the live quote for price and yesterday’s close for change when today’s bar isn’t in yet', () => {
    const r = liveRow(strong, { last: 160, open: 155, prevClose: strong.last, t: 0 }, { base: spy }, undefined, true);
    expect(r.chgPct).toBeCloseTo((160 / strong.last - 1) * 100);
    expect(r.gapPct).toBeCloseTo((155 / strong.last - 1) * 100);
  });

  it('squeeze is unknown without short interest, false when any leg fails', () => {
    const b: ScanBase = { ...strong, volTrend: 1.5 };
    expect(liveRow(b, undefined, { base: spy }).squeeze).toBeNull();
    expect(liveRow({ ...b, si: { shares: 1e7, daysToCover: 8, changePct: 0, settlementDate: '', pctOut: 20 }, catalyst: { count: 2 } }, undefined, { base: spy }).squeeze).toBe(true);
    expect(liveRow({ ...b, si: { shares: 1e5, daysToCover: 0.5, changePct: 0, settlementDate: '', pctOut: 1 }, catalyst: { count: 2 } }, undefined, { base: spy }).squeeze).toBe(false);
  });
});
