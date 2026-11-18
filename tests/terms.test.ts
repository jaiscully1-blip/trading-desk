import { describe, expect, it } from 'vitest';
import { brandTicker } from '../shared/company';
import { lookupTerm } from '../shared/terms';

describe('brands and terms', () => {
  it('maps brands and subsidiaries to the listed parent', () => {
    expect(brandTicker('Google')).toBe('GOOGL'); expect(brandTicker('Google LLC')).toBe('GOOGL'); expect(brandTicker('YouTube')).toBe('GOOGL');
    expect(brandTicker('Amazon Web Services (AWS)')).toBe('AMZN'); expect(brandTicker('Microsoft Azure')).toBe('MSFT'); expect(brandTicker('Instagram')).toBe('META');
    expect(brandTicker('Samsung Electronics')).toBe(''); expect(brandTicker('Acme Widgets')).toBeUndefined();
  });
  it('explains desk labels from every source', () => {
    expect(lookupTerm('P/E (trailing)')?.title).toBe('P/E (trailing)');
    expect(lookupTerm('Float (est.)')?.title).toBe('Float');
    expect(lookupTerm('Revenue FY26')?.title).toBe('Revenue');
    expect(lookupTerm('Market order')?.what).toMatch(/now/);
    expect(lookupTerm('Covered call')?.learn).toBe('basics');
    expect(lookupTerm('Website')).toBeNull();
  });
});
