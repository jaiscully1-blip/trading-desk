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
