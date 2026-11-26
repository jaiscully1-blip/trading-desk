// Parser checked on the real CFTC pages saved 2026-11-26 (week of 2026-11-06).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mergeWeeks, parseGross, parseTickets } from '../shared/cftc';

const read = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');

describe('CFTC weekly swaps report (credit)', () => {
  it('reads gross notional outstanding by grade', () => {
    expect(parseGross(read('cftc-gross.html'))).toEqual({ week: '2026-11-06', hy: 1313405, ig: 6386137, total: 8268686 });
  });
  it('reads transaction tickets by grade', () => {
    expect(parseTickets(read('cftc-tickets.html'))).toEqual({ week: '2026-11-06', hy: 5180, ig: 6387, total: 12215 });
  });
  it('returns null for a page without the table', () => {
    expect(parseGross('<html><body>Maintenance</body></html>')).toBeNull();
  });
  it('keeps one snapshot per week, oldest first', () => {
    const w = (week: string, total: number) => ({ week, gross: { total, hy: 0, ig: 0 }, tickets: null });
    expect(mergeWeeks([w('2026-10-30', 1), w('2026-11-06', 2)], w('2026-11-06', 3)).map((x) => [x.week, x.gross!.total])).toEqual([['2026-10-30', 1], ['2026-11-06', 3]]);
  });
});
