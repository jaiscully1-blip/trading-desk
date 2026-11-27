// Real public responses (2026-11-26) from OKX, Kraken Futures and Deribit.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { crowdingNotes, deribitPerp, krakenPerp, liquidations, longShort, oiHistory, okxFunding, okxOiUsd } from '../shared/cryptoderiv';

const fx = JSON.parse(readFileSync(new URL('./fixtures/crypto-deriv.json', import.meta.url), 'utf8'));

describe('crypto derivatives across exchanges', () => {
  it('puts every venue on a yearly funding rate', () => {
    const o = okxFunding(fx.okxFunding);
    expect(o.periodH).toBe(8);
    expect(o.aprPct).toBeCloseTo(6.795, 2); // 0.0062% per 8 hours
    expect(krakenPerp(fx.kraken, 'PF_XBTUSD')!.aprPct).toBeCloseTo(8.509, 2); // hourly
    expect(deribitPerp(fx.deribit, 'BTC')).toMatchObject({ venue: 'Deribit', oiUsd: 817621710 });
    expect(krakenPerp(fx.kraken, 'PF_NOPE')).toBeNull();
  });
  it('values open interest in dollars', () => {
    expect(okxOiUsd(fx.okxOi)).toBeGreaterThan(1e9);
    const k = krakenPerp(fx.kraken, 'PF_XBTUSD')!;
    expect(k.oiUsd).toBeCloseTo(2118.0768 * 61220.99, -3); // coins x mark
  });
  it('reads OKX open-interest history and the account ratio range', () => {
    const h = oiHistory(fx.okxOiHist);
    expect(h.last).toBeCloseTo(2850775648.27, 0);
    expect(h.d1).toBeCloseTo((2850775648.2693 / 2719417061.6682 - 1) * 100, 1);
    expect(h.series.length).toBe(90);
    expect(h.series[0][0]).toBeLessThan(h.series[89][0]);
    const ls = longShort(fx.okxLs);
    expect(ls.last).toBe(2.54);
    expect(ls.pctile).toBeGreaterThanOrEqual(0);
    expect(ls.min!).toBeLessThanOrEqual(2.54);
  });
  it('adds up the latest liquidations by side, with the time they cover', () => {
    const l = liquidations(fx.okxLiq, 0.01);
    expect(l.n).toBe(100);
    expect(l.longUsd + l.shortUsd).toBeGreaterThan(0);
    expect(l.spanMin).toBeCloseTo(2.4, 0);
  });
  it('writes plain crowding facts', () => {
    expect(crowdingNotes([{ venue: 'A', aprPct: 40, oiUsd: 1 }, { venue: 'B', aprPct: 35, oiUsd: 1 }], { last: 1, d1: 1, d7: 15, d30: 1, series: [] }, { last: 3, pctile: 95, min: 1, max: 3 }))
      .toEqual(['Funding positive on all 2 venues (longs pay shorts), about 37.5% a year on average.', 'Funding above 30% a year: longs are paying a lot to stay in.', 'Open interest up 15% in 7 days on OKX (new positions building).', 'OKX long / short account ratio 3 is at the top of its 30-day range.']);
    expect(crowdingNotes([{ venue: 'A', aprPct: 5, oiUsd: 1 }, { venue: 'B', aprPct: -2, oiUsd: 1 }], { last: 1, d1: 0, d7: 2, d30: 0, series: [] }, { last: 2, pctile: 50, min: 1, max: 3 })).toEqual(['Funding mixed: positive on 1 of 2 venues.']);
  });
});
