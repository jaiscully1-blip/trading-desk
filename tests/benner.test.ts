import { describe, expect, it } from 'vitest';
import { A_YEARS, B_YEARS, C_YEARS, status } from '../shared/benner';

describe('benner card', () => {
  it('has the card’s marked years in order', () => {
    for (const l of [A_YEARS, B_YEARS, C_YEARS]) expect([...l].sort((a, b) => a - b)).toEqual(l);
    expect(A_YEARS).toHaveLength(8); expect(B_YEARS).toHaveLength(15); expect(C_YEARS).toHaveLength(16);
  });
  it('places 2026 as a good-times year that follows the 2023 buy year', () => {
    const s = status(2026);
    expect(s.kinds).toEqual(['B']);
    expect(s.last).toEqual({ year: 2026, kind: 'B' });
    expect(s.next.map((m) => `${m.year}${m.kind}`)).toEqual(['2032C', '2034B', '2035A', '2039C']);
    expect(s.phase).toBe('falling'); expect(s.yearsToNext).toBe(6);
  });
  it('handles a year between marks and a year with two marks', () => {
    expect(status(2024)).toMatchObject({ kinds: [], phase: 'rising', last: { year: 2023, kind: 'C' } });
    expect(status(1999).kinds.sort()).toEqual(['A', 'B']);
  });
});
