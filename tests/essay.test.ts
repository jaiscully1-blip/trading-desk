import { describe, expect, it } from 'vitest';
import { citeText, cleanCheck, cleanOutline, factLines, rangeStats, type DayBar } from '../shared/essay';

const t = (d: string) => Date.parse(`${d}T14:30:00Z`) / 1000;
const bar = (d: string, c: number, v = 100): DayBar => ({ time: t(d), open: c, high: c + 2, low: c - 2, close: c, volume: v });
const bars = [bar('2026-11-02', 100), bar('2026-11-03', 102), bar('2026-11-04', 98, 300), bar('2026-11-05', 95, 300), bar('2026-11-06', 97, 300)];
const spy = [bar('2026-11-03', 500), bar('2026-11-04', 495), bar('2026-11-05', 490), bar('2026-11-06', 495)];

describe('essay range stats', () => {
  it('measures from the close before the range, with high / low, up days and SPY over the same days', () => {
    const s = rangeStats(bars, 2, 4, spy)!;
    expect(s.days).toBe(3);
    expect(s.startPx).toBe(102);
    expect(s.chgPct).toBeCloseTo((97 / 102 - 1) * 100);
    expect(s.high).toBe(100); expect(s.low).toBe(93);
    expect(s.upDays).toBe(1);
    expect(s.spyChgPct).toBeCloseTo((495 / 500 - 1) * 100);
    expect(s.vsSpy).toBeCloseTo(s.chgPct - s.spyChgPct!);
    expect(rangeStats(bars, 4, 2, spy)!.from).toBe(s.from); // drag right to left works too
  });
  it('writes the citation sentence and the fact line from real numbers', () => {
    const s = rangeStats(bars, 2, 4, spy)!;
    expect(citeText('NVDA', s)).toBe('NVDA fell 4.9% from Nov 4, 2026 to Nov 6, 2026 (SPY -1.0%)');
    expect(factLines('NVDA', s)).toContain('change -4.90%');
    expect(citeText('NVDA', rangeStats(bars, 1, 1)!)).toBe('NVDA rose 2.0% on Nov 3, 2026');
  });
  it('keeps AI answers inside the schema', () => {
    expect(cleanOutline({ sections: [{ heading: 'What happened', points: ['a', 'b'] }, { heading: '' }], questions: ['why?'], missing: 'x' })).toEqual({ sections: [{ heading: 'What happened', points: ['a', 'b'] }], questions: ['why?'], missing: [] });
    expect(cleanCheck({ claims: [{ quote: 'fell 5%', verdict: 'bogus', note: 'n' }] }).claims[0].verdict).toBe('unverified');
  });
});
