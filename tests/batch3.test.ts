import { describe, expect, it } from 'vitest';
import type { Chain, Contract } from '../shared/gamma';
import { maxPain, unusualActivity, unusualSummary } from '../shared/optflow';
import { closeOn, floatShares, latestByCik, recentInstantPeriods, tearFromFacts } from '../shared/tearsheet';
import { sharesForRisk } from '../shared/risk';
import { parseCboe } from '../shared/gamma';

const c = (p: Partial<Contract>): Contract => ({ exp: '2026-11-20', dte: 9, T: 9 / 365, K: 100, cp: 'C', iv: 0.4, oi: 0, vol: 0, last: 1, ...p });

describe('options activity', () => {
  const ch: Chain = { sym: 'X', spot: 100, asOf: null, contracts: [
    c({ K: 110, cp: 'C', vol: 5000, oi: 1000, last: 2 }), // $1.0M, 5x
    c({ K: 90, cp: 'P', vol: 2000, oi: 100, last: 1.5 }), // $300K
    c({ K: 105, cp: 'C', vol: 400, oi: 900, last: 3 }), // volume under OI: no
    c({ K: 70, cp: 'C', vol: 3000, oi: 10, last: 30 }), // deep in the money: left out
    c({ K: 120, cp: 'C', vol: 1000, oi: 0, last: 0.1 }), // $10K: under the premium floor
    c({ K: 95, cp: 'P', vol: 500, oi: 0, last: 0, bid: 1, ask: 1.2 }), // no last trade: midpoint 1.1 -> $55K, brand new
  ] };
  it('volume above open interest, biggest premium first', () => {
    const u = unusualActivity(ch);
    expect(u.map((x) => `${x.K}${x.cp}`)).toEqual(['110C', '90P', '95P']);
    expect(u[0]).toMatchObject({ premium: 1_000_000, ratio: 5 });
    expect(u[0].otmPct).toBeCloseTo(10);
    expect(u[2].ratio).toBe(Infinity);
    expect(u[2].premium).toBeCloseTo(55_000);
    const s = unusualSummary(u);
    expect(s.callShare).toBeCloseTo(1_000_000 / 1_355_000);
    expect(s.n).toBe(3);
  });
  it('max pain = strike where holders collect the least', () => {
    const mp = maxPain({ sym: 'X', spot: 100, asOf: null, contracts: [
      c({ K: 95, cp: 'P', oi: 3000 }), c({ K: 100, cp: 'C', oi: 500 }), c({ K: 100, cp: 'P', oi: 500 }), c({ K: 105, cp: 'C', oi: 3000 }),
      c({ exp: '2026-12-18', K: 100, cp: 'C', oi: 10 }), // too little open interest: skipped
    ] });
    expect(mp).toHaveLength(1);
    expect(mp[0]).toMatchObject({ exp: '2026-11-20', strike: 100, distPct: 0 });
  });
  it('Cboe parse keeps price fields', () => {
    const ch2 = parseCboe({ data: { current_price: 100, options: [{ option: 'X261120C00100000', iv: 0.3, open_interest: 10, volume: 20, last_trade_price: 1.25, bid: 1.2, ask: 1.3, delta: 0.5 }] } }, 'X', Date.parse('2026-11-11T15:00:00Z'));
    expect(ch2.contracts[0]).toMatchObject({ last: 1.25, bid: 1.2, ask: 1.3, delta: 0.5 });
  });
});

describe('tear sheet', () => {
  const facts = { facts: {
    dei: {
      EntityCommonStockSharesOutstanding: { units: { shares: [
        { val: 90, end: '2025-08-01', filed: '2025-08-05', form: '10-Q' },
        { val: 60, end: '2026-08-01', filed: '2026-08-05', form: '10-Q' }, { val: 40, end: '2026-08-01', filed: '2026-08-05', form: '10-Q' }, // two share classes
      ] } },
      EntityPublicFloat: { units: { USD: [{ val: 5000, end: '2026-03-31', form: '10-K' }] } },
    },
    'us-gaap': {
      CashAndCashEquivalentsAtCarryingValue: { units: { USD: [{ val: 50, end: '2026-06-30', form: '10-Q' }] } },
      LongTermDebt: { units: { USD: [{ val: 30, end: '2026-06-30', form: '10-Q' }] } },
      ShortTermBorrowings: { units: { USD: [{ val: 5, end: '2026-06-30', form: '10-Q' }] } },
      // old concept name with old data, new one with the latest year: the newest wins
      SalesRevenueNet: { units: { USD: [{ val: 1, start: '2017-01-01', end: '2017-12-31', form: '10-K' }] } },
      Revenues: { units: { USD: [{ val: 900, start: '2025-01-01', end: '2025-12-31', form: '10-K' }, { val: 250, start: '2026-04-01', end: '2026-06-30', form: '10-Q' }] } },
      NetIncomeLoss: { units: { USD: [{ val: -20, start: '2025-01-01', end: '2025-12-31', form: '10-K' }] } },
      NetCashProvidedByUsedInOperatingActivities: { units: { USD: [{ val: 100, start: '2025-01-01', end: '2025-12-31', form: '10-K' }] } },
      PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [{ val: 30, start: '2025-01-01', end: '2025-12-31', form: '10-K' }] } },
    },
  } };
  it('reads shares (summing classes), float, cash, debt and the last fiscal year', () => {
    const t = tearFromFacts(facts);
    expect(t).toMatchObject({ sharesOut: 100, sharesYearAgo: 90, publicFloatUsd: 5000, floatAsOf: '2026-03-31', cash: 50, debt: 35, revenueFY: 900, netIncomeFY: -20, fcfFY: 70, fyEnd: '2025-12-31' });
  });
  it('float estimate and the close on a date', () => {
    const bars = [{ time: Date.parse('2026-03-27T20:00:00Z') / 1000, close: 60 }, { time: Date.parse('2026-04-01T20:00:00Z') / 1000, close: 70 }];
    expect(closeOn(bars, '2026-03-31')).toBe(60); // weekend / holiday: the last close before
    expect(closeOn(bars, '2025-01-01')).toBeNull();
    expect(floatShares(5000, 60, 100)).toBeCloseTo(83.33, 1);
    expect(floatShares(5000, 10, 100)).toBe(100); // never above shares outstanding
    expect(floatShares(null, 60, 100)).toBeNull();
  });
  it('SEC frames helpers', () => {
    expect(recentInstantPeriods('2026-11-11', 4)).toEqual(['CY2026Q3I', 'CY2026Q2I', 'CY2026Q1I', 'CY2025Q4I']);
    expect(recentInstantPeriods('2026-02-01', 2)).toEqual(['CY2025Q4I', 'CY2025Q3I']);
    const m = latestByCik([{ data: [{ cik: 1, val: 10, end: '2025-06-30' }] }, { data: [{ cik: 1, val: 20, end: '2026-06-30' }, { cik: 2, val: 5, end: '2026-03-31' }] }, null]);
    expect(m.get(1)).toEqual({ val: 20, end: '2026-06-30' });
    expect(m.get(2)?.val).toBe(5);
  });
});

describe('dollar-risk sizing', () => {
  it('shares = risk ÷ distance to the stop, capped by the ticket limits', () => {
    expect(sharesForRisk(100, 50, 48)).toMatchObject({ shares: 50, perShare: 2, risk: 100, cost: 2500, cappedBy: null });
    expect(sharesForRisk(100, 50, 48, 1000)).toMatchObject({ shares: 20, cappedBy: 'dollar cap' });
    expect(sharesForRisk(100, 50, 48, Infinity, 10)).toMatchObject({ shares: 10, cappedBy: 'share cap' });
    expect(sharesForRisk(100, 50, 50)).toBeNull();
    expect(sharesForRisk(0, 50, 48)).toBeNull();
  });
});
