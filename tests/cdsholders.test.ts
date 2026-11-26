// Checked on the real BIS file saved 2026-11-26 (CDS by counterparty sector, 2010-S1 to 2025-S2).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { holderNotes, latestHolders, parseHolders, periodLabel } from '../shared/cdsHolders';

const d = parseHolders(readFileSync(new URL('./fixtures/bis-cds-sectors.csv', import.meta.url), 'utf8'));

describe('CDS by holder (BIS)', () => {
  it('reads 32 half-years and the total outstanding', () => {
    expect(d.periods).toHaveLength(32);
    expect(d.periods.at(-1)).toBe('2025-S2');
    expect(Math.round(d.total.at(-1)! / 1e9)).toBe(11005);
  });
  it('mirrors the dealer view: non-financial companies bought what dealers sold to them', () => {
    const u = d.sectors.U.at(-1)!;
    expect(Math.round(u.bought! / 1e6)).toBe(47211); // dealers sold (T) 47,211 $M
    expect(Math.round(u.sold! / 1e6)).toBe(74863); // dealers bought (S) 74,863 $M
  });
  it('gives each sector its share of all CDS and its change', () => {
    const rows = latestHolders(d);
    const u = rows.find((r) => r.code === 'U')!;
    expect(u.share!).toBeCloseTo(1.11, 1); // 122,075 of 11,004,844 outstanding
    expect(Math.round(u.boughtH!)).toBe(13); // 41,776 -> 47,211
    expect(rows.find((r) => r.code === 'B')!.bought).toBeNull(); // dealer-to-dealer has no mirror side
  });
  it('labels periods and writes notes only for big six-month moves', () => {
    expect(periodLabel('2025-S2')).toBe('end of 2025');
    expect(periodLabel('2025-S1')).toBe('mid-2025');
    const fake = [{ code: 'O', label: 'Hedge funds', note: undefined, outstanding: 1, share: 1, bought: 2e11, sold: 1, net: 1, boughtH: 40, boughtY: 1 }];
    expect(holderNotes(fake, '2025-S2')).toEqual(['Hedge funds: protection bought up 40% in six months, to $200B (end of 2025).']);
  });
});
