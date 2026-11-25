import { describe, expect, it } from 'vitest';
import { parseCboe, premiumTotals, strikeGrid } from '../shared/gamma';
import { TILES, FIPS, droughtLevel, femaByState, latestDrought } from '../shared/cmap';

const NOW = Date.UTC(2026, 10, 20, 15);
const ch = parseCboe({ data: { current_price: 100, options: [
  { option: 'XYZ261127C00100000', iv: 0.3, open_interest: 1000, volume: 50, bid: 2, ask: 2.2 },
  { option: 'XYZ261127P00100000', iv: 0.3, open_interest: 400, volume: 80, bid: 1.9, ask: 2.1 },
  { option: 'XYZ261127C00105000', iv: 0.3, open_interest: 10, volume: 10, last_trade_price: 0.5 },
  { option: 'XYZ261204P00095000', iv: 0.3, open_interest: 300, volume: 0, bid: 1, ask: 1.2 },
  { option: 'XYZ261127C00150000', iv: 0.3, open_interest: 99, volume: 1, bid: 0, ask: 0.05 },
] } }, 'XYZ', NOW);

describe('strike grid', () => {
  it('builds strikes × expiries inside the band, highest strike first', () => {
    const g = strikeGrid(ch);
    expect(g.strikes).toEqual([105, 100, 95]);
    expect(g.expiries.map((e) => e.exp)).toEqual(['2026-11-27', '2026-12-04']);
    const c = g.cells[0][1];
    expect(c.slice(1)).toEqual([1000, 400, 50, 80]);
    expect(c[0]).toBeGreaterThan(0); // more call OI than put OI at the money
    expect(g.cells[1][2][0]).toBeLessThan(0); // puts only
  });
  it('sums gross premium (volume × mid) by side', () => {
    const t = premiumTotals(ch);
    expect(t.callPrem).toBe(50 * 2.1 * 100 + 10 * 0.5 * 100); // the 150 call has no bid and no last trade: no price, no premium
    expect(t.putPrem).toBe(80 * 2 * 100);
    expect(t.otmCallPrem).toBe(10 * 0.5 * 100); // the 150 call has no bid and no last trade: no price, no premium
    expect(t.callVol).toBe(61);
  });
});

describe('commodity map', () => {
  it('has a tile and a FIPS code for all 50 states, no tile overlaps', () => {
    expect(Object.keys(TILES)).toHaveLength(50);
    expect(Object.keys(FIPS).sort()).toEqual(Object.keys(TILES).sort());
    expect(new Set(Object.values(TILES).map((x) => x.join(','))).size).toBe(50);
  });
  it('keeps the latest drought week per state and grades it', () => {
    const d = latestDrought([
      { stateAbbreviation: 'TX', mapDate: '2026-11-10T00:00:00', none: 50, d0: 50, d1: 30, d2: 5, d3: 0, d4: 0 },
      { stateAbbreviation: 'TX', mapDate: '2026-11-17T00:00:00', none: 40, d0: 60, d1: 40, d2: 20, d3: 2, d4: 0 },
    ]);
    expect(d.TX.day).toBe('2026-11-17');
    expect(droughtLevel(d.TX)).toBe(2);
    expect(droughtLevel(undefined)).toBe(-1);
  });
  it('dedupes FEMA declarations per state, newest first', () => {
    const f = femaByState([
      { state: 'CA', declarationTitle: 'NORTE FIRE', incidentType: 'Fire', declarationDate: '2026-10-16T00:00:00.000Z' },
      { state: 'CA', declarationTitle: 'NORTE FIRE', incidentType: 'Fire', declarationDate: '2026-10-16T00:00:00.000Z' },
      { state: 'CA', declarationTitle: 'STORM', incidentType: 'Severe Storm', declarationDate: '2026-11-01T00:00:00.000Z' },
    ]);
    expect(f.CA.map((x) => x.title)).toEqual(['STORM', 'NORTE FIRE']);
  });
});

import { alpacaToCboe } from '../shared/alpacaChain';
describe('alpaca chain', () => {
  it('merges snapshots and open interest into a chain parseCboe reads', () => {
    const raw = alpacaToCboe(100, {
      XYZ261127C00100000: { latestQuote: { bp: 2, ap: 2.2 }, latestTrade: { p: 2.1 }, impliedVolatility: 0.3, greeks: { delta: 0.5 }, dailyBar: { v: 50 } },
    }, [{ symbol: 'XYZ261127C00100000', open_interest: '1000' }, { symbol: 'XYZ261127P00100000', open_interest: '400' }]);
    const c = parseCboe(raw, 'XYZ', NOW);
    expect(c.spot).toBe(100);
    expect(c.contracts).toHaveLength(2);
    const call = c.contracts.find((x) => x.cp === 'C')!;
    expect([call.oi, call.vol, call.iv, call.bid, call.ask, call.last]).toEqual([1000, 50, 0.3, 2, 2.2, 2.1]);
    expect(c.contracts.find((x) => x.cp === 'P')!.oi).toBe(400);
  });
});
