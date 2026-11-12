import { describe, expect, it } from 'vitest';
import { at, chainActivity, mostActive, parseHyperliquid, yieldCurve } from '../shared/optrates';
import type { Chain, Contract } from '../shared/gamma';

const c = (p: Partial<Contract>): Contract => ({ exp: '2026-11-13', dte: 1, T: 1 / 365, K: 100, cp: 'C', iv: 0.4, oi: 10, vol: 0, last: 1, ...p });

describe('options + rates', () => {
  it('most active contracts and per-name activity', () => {
    const a: Chain = { sym: 'AAA', spot: 100, asOf: null, contracts: [c({ K: 105, vol: 5000, last: 2 }), c({ K: 95, cp: 'P', vol: 3000, dte: 30 }), c({ vol: 50 })] };
    const b: Chain = { sym: 'BBB', spot: 50, asOf: null, contracts: [c({ K: 50, vol: 8000, last: 0.5 })] };
    const top = mostActive([a, b]);
    expect(top.map((x) => `${x.sym}${x.K}${x.cp}`)).toEqual(['BBB50C', 'AAA105C', 'AAA95P']);
    expect(top[1]).toMatchObject({ premium: 1_000_000 });
    expect(top[1].otmPct).toBeCloseTo(5);
    expect(chainActivity(a)).toMatchObject({ volume: 8050, pcRatio: 3000 / 5050 });
    expect(chainActivity(a).zeroDteShare).toBeCloseTo(5050 / 8050);
  });
  it('yield curve: now, a month and a year ago, spreads in bp', () => {
    const s = (vals: [string, number][]) => vals.map(([date, value]) => ({ date, value }));
    const series = {
      DGS2: s([['2025-11-10', 3.6], ['2026-10-09', 3.9], ['2026-11-10', 4.0]]),
      DGS10: s([['2025-11-10', 4.1], ['2026-10-09', 4.8], ['2026-11-10', 4.98]]),
      DGS3MO: s([['2025-11-10', 4.0], ['2026-11-10', 3.8]]),
    };
    const y = yieldCurve(series);
    expect(y.asOf).toBe('2026-11-10');
    expect(y.points.find((p) => p.id === 'DGS10')).toMatchObject({ now: 4.98, m1: 4.8, y1: 4.1 });
    const s210 = y.spreads.find((x) => x.label === '10Y − 2Y')!;
    expect(s210.now).toBeCloseTo(98);
    expect(s210.y1).toBeCloseTo(50);
    expect(at([], 0)).toBeNull();
  });
  it('Hyperliquid funding', () => {
    const p = parseHyperliquid([{ universe: [{ name: 'BTC', maxLeverage: 40 }, { name: 'OLD', isDelisted: true }, { name: 'ETH' }] }, [
      { funding: '0.0000125', openInterest: '100', prevDayPx: '100', dayNtlVlm: '5000', premium: '-0.0005', markPx: '110' },
      { funding: '0.01', markPx: '1' },
      { funding: '-0.00001', openInterest: '10', dayNtlVlm: '9000', markPx: '50' },
    ]]);
    expect(p.map((x) => x.coin)).toEqual(['ETH', 'BTC']);
    expect(p[1].fundingApr).toBeCloseTo(0.0000125 * 24 * 365 * 100);
    expect(p[1]).toMatchObject({ oiUsd: 11000, maxLev: 40 });
    expect(p[1].chgPct).toBeCloseTo(10);
  });
});
