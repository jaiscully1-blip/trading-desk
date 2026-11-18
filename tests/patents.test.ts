import { describe, expect, it } from 'vitest';
import { applicantName, countOf, grantedQuery } from '../shared/patents';

describe('USPTO patents', () => {
  it('cleans company names for the applicant search', () => {
    expect(applicantName('NVIDIA Corp')).toBe('NVIDIA');
    expect(applicantName('Alphabet Inc. Class A')).toBe('Alphabet');
    expect(applicantName('Apple Inc.')).toBe('Apple');
  });
  it('asks for utility grants in one year and reads the count', () => {
    const q = grantedQuery('Apple', 2025);
    expect(q.q).toBe('applicationMetaData.firstApplicantName:"Apple"');
    expect(q.rangeFilters[0]).toEqual({ field: 'applicationMetaData.grantDate', valueFrom: '2025-01-01', valueTo: '2025-12-31' });
    expect(countOf({ count: 2412 })).toBe(2412);
    expect(countOf({})).toBe(0);
  });
});
