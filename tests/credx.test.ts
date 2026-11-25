import { describe, expect, it } from 'vitest';
import { credibility } from '../shared/credibility';
import { carryRow, marginRows, termRead } from '../shared/xasset';
import { paceMs } from '../src/lib/pace';

describe('headline check', () => {
  it('labels fear without data', () => {
    expect(credibility('MARKET CRASH IMMINENT as dollar collapse nears!').label).toBe('fear');
    expect(credibility("The bubble is about to burst and nobody is talking about it").label).toBe('fear');
  });
  it('labels data-backed and alarm-with-data', () => {
    expect(credibility('CPI rose 0.3% in October, BLS data show').label).toBe('data');
    expect(credibility('Stocks plunge 4% as Fed signals higher rates').label).toBe('alarm-data');
    expect(credibility('Apple names new head of design').label).toBe('plain');
  });
  it('does not count unnamed sources as evidence', () => {
    expect(credibility('Bank collapse feared, sources say').label).toBe('fear');
  });
});

describe('carry and leverage math', () => {
  it('computes carry, carry/vol and flags a 5% monthly drop as an unwind', () => {
    const closes = Array.from({ length: 260 }, (_, i) => 150 * (1 + 0.002 * Math.sin(i))).concat(Array.from({ length: 22 }, (_, i) => 150 * (1 - 0.003 * (i + 1))));
    const r = carryRow({ target: 'USD', fund: 'JPY' }, { USD: 4.1, JPY: 1.7 }, closes);
    expect(r.carry).toBe(2.4); expect(r.unwind).toBe(true); expect(r.ratio).not.toBeNull();
  });
  it('reads FINRA margin rows and the VIX curve', () => {
    expect(marginRows([['Year-Month', 'a', 'b', 'c'], ['2026-10', '1448360', '210290', '212890']])).toEqual([{ month: '2026-10', debit: 1448360, credit: 423180 }]);
    expect(termRead(26.4, 25.5).state).toBe('backwardation'); expect(termRead(15, 18).state).toBe('contango');
  });
});

describe('market-hours pacing', () => {
  const at = (iso: string) => Date.parse(iso);
  it('slows down outside the session and when closed', () => {
    expect(paceMs(60_000, at('2026-11-24T15:00:00Z'), 'auto')).toBe(60_000);       // 10:00 ET, open
    expect(paceMs(60_000, at('2026-11-24T13:00:00Z'), 'auto')).toBe(180_000);      // 8:00 ET, pre-market
    expect(paceMs(60_000, at('2026-11-29T15:00:00Z'), 'auto')).toBe(15 * 60_000);  // Sunday
    expect(paceMs(60_000, at('2026-11-24T15:00:00Z'), 'fast')).toBe(30_000);
    expect(paceMs(60_000, at('2026-11-24T15:00:00Z'), 'saver')).toBe(240_000);
  });
});

import { scoreboard } from '../shared/macroextra';
describe('earnings scoreboard companies', () => {
  it('lists each sector\'s reported companies, newest first', () => {
    const b = scoreboard([
      { sym: 'AAPL', date: '2026-10-30', hour: 'amc', epsEst: 1.6, epsAct: 1.7, revEst: 1e11, revAct: 1.02e11 },
      { sym: 'MSFT', date: '2026-10-28', hour: 'amc', epsEst: 3.1, epsAct: 3.0, revEst: null, revAct: null },
      { sym: 'XOM', date: '2026-10-31', epsEst: null, epsAct: 2, revEst: null, revAct: null },
    ], (s) => (s === 'XOM' ? 'Energy' : 'Information Technology'));
    expect(b.companies['Information Technology'].map((r) => r.sym)).toEqual(['AAPL', 'MSFT']);
    expect(b.companies.Energy).toBeUndefined(); // no estimate: not scored
  });
});

import { parseEdp } from '../shared/xasset';
describe('EU deficit procedure data', () => {
  it('reads Eurostat JSON-stat into rows per country', () => {
    const j = { id: ['freq', 'unit', 'sector', 'na_item', 'geo', 'time'], size: [1, 1, 1, 2, 2, 2], value: { 0: -1.9, 1: -2.2, 2: -4.7, 3: -5.4, 4: 61.4, 5: 62.8, 6: 112.6, 7: 115.7 },
      dimension: { na_item: { category: { index: { B9: 0, GD: 1 } } }, geo: { category: { index: { DE: 0, FR: 1 }, label: { DE: 'Germany', FR: 'France' } } }, time: { category: { index: { 2024: 0, 2025: 1 } } } } };
    const e = parseEdp(j);
    expect(e.years).toEqual(['2024', '2025']);
    expect(e.rows[1]).toEqual({ geo: 'FR', name: 'France', deficit: [-4.7, -5.4], debt: [112.6, 115.7] });
  });
});
