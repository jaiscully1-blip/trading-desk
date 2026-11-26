import { describe, expect, it } from 'vitest';
import { bankNotes, fromTiny, prettyBank, fdicDate, latestChanges, parseBankQs, reportDates } from '../shared/bankHedge';

const row = (d: string, ben: number, gty: number, lev = 7.2, uc = 100e6) => ({ data: { REPDTE: d, ASSET: 4e9, CTDERBEN: ben, CTDERGTY: gty, RBC1AAJ: lev, RBCT1JR: 15, UC: uc } });

describe('banks and hedging', () => {
  it('reads FDIC rows in dollars (from thousands), oldest first', () => {
    const qs = parseBankQs({ data: [row('20260930', 1156147000, 1055395000), row('20260630', 873345000, 776211000)] });
    expect(qs.map((q) => q.q)).toEqual(['2026-06-30', '2026-09-30']);
    expect(qs[1]).toMatchObject({ bought: 1156147000000, sold: 1055395000000, net: 100752000000, t1Lev: 7.2 });
    expect(fdicDate('20260331')).toBe('2026-03-31');
  });
  it('computes quarter and year changes', () => {
    const qs = parseBankQs({ data: ['20250930', '20251231', '20260331', '20260630', '20260930'].map((d, i) => row(d, [800, 820, 850, 873, 1156][i] * 1e6, 700e6)) });
    const c = latestChanges(qs)!;
    expect(Math.round(c.boughtQ!)).toBe(32);
    expect(Math.round(c.boughtY!)).toBe(45);
  });
  it('lists the last n report dates', () => {
    expect(reportDates('20260930', 5)).toEqual(['20250930', '20251231', '20260331', '20260630', '20260930']);
  });
  it('writes quiet notes only for sharp moves', () => {
    const qs = parseBankQs({ data: [row('20260630', 873345000, 776211000, 7.9, 1e9), row('20260930', 1156147000, 1255395000, 7.2, 1.2e9)] });
    expect(bankNotes('JPMorgan', latestChanges(qs))).toEqual([
      'JPMorgan: credit protection bought up 32% in a quarter, to $1.16T.',
      'JPMorgan: now a net seller of credit protection ($99B net).',
      'JPMorgan: Tier 1 leverage ratio fell 0.7 points in a quarter, to 7.2%.',
      'JPMorgan: unused loan commitments up 20% in a quarter, to $1.20T.',
    ]);
    const calm = parseBankQs({ data: [row('20260630', 873e6, 776e6), row('20260930', 880e6, 780e6)] });
    expect(bankNotes('Calm', latestChanges(calm))).toEqual([]);
  });
});

describe('bank names and tiny bases', () => {
  it('writes bank names the usual way', () => {
    expect(prettyBank('JPMORGAN CHASE BANK NA')).toBe('JPMorgan Chase Bank N.A.');
    expect(prettyBank('U S BANK NATIONAL ASSN')).toBe('U.S. Bank National Assn');
    expect(prettyBank('HSBC BANK USA NATIONAL ASSN')).toBe('HSBC Bank USA National Assn');
    expect(prettyBank('THE BANK OF NEW YORK MELLON')).toBe('The Bank of New York Mellon');
  });
  it('treats a change from under 5% of today as new', () => {
    expect(fromTiny(950e9, 20e9)).toBe(true);
    expect(fromTiny(950e9, 700e9)).toBe(false);
    expect(fromTiny(950e9, null)).toBe(false);
  });
});
