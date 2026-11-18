import { describe, expect, it } from 'vitest';
import { customerConcentration, guidanceCheck, quarterOf, riskDiff, riskSection, wordsChanged } from '../shared/intel';

const P = (s: string) => `${s} `.repeat(12).trim();
describe('filings intel', () => {
  it('finds Item 1A after the table of contents and diffs paragraphs', () => {
    const doc = `Item 1A. Risk Factors 12 Item 1B. Unresolved 30\nItem 1A. Risk Factors\n${P('Competition from large banks could reduce our margins')}\n${P('Crypto regulation could change how we operate')}\nItem 1B. Unresolved Staff Comments none`;
    const sec = riskSection(doc);
    expect(sec).toContain('Competition');
    const old = `${P('Competition from large banks could reduce our margins')}\n${P('Interest rates falling would cut our income')}`;
    const d = riskDiff(old, sec);
    expect(d.added[0]).toMatch(/Crypto regulation/);
    expect(d.removed[0]).toMatch(/Interest rates/);
  });
  it('customer concentration sentences only when a share of revenue is stated', () => {
    expect(customerConcentration('We serve many customers. Our largest customer accounted for 14% of our total revenue in 2025. Customers grew 20% in 2025.')).toEqual(['Our largest customer accounted for 14% of our total revenue in 2025.']);
  });
  it('words that changed, guidance check, quarters', () => {
    const w = wordsChanged('margins margins margins growth growth demand demand', 'tariffs tariffs tariffs tariffs margins demand demand');
    expect(w.up[0].w).toBe('tariffs');
    expect(guidanceCheck(10, 12, 13)).toBe('above');
    expect(guidanceCheck(10, 12, 11)).toBe('inside');
    expect(guidanceCheck(10, null, 9)).toBe('below');
    expect(guidanceCheck(null, null, 9)).toBeNull();
    expect(quarterOf('2026-12-15')).toBe('2026Q4');
  });
});
