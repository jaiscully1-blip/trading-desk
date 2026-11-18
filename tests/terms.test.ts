import { describe, expect, it } from 'vitest';
import { brandTicker } from '../shared/company';
import { loadTermDecks, lookupTerm } from '../shared/terms';
import { beforeAll } from 'vitest';
beforeAll(() => loadTermDecks());

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

import { clock, turnTimes } from '../shared/transcript';
describe('transcript timeline', () => {
  it('estimates start times from word counts', () => {
    const t = turnTimes([{ text: Array(150).fill('w').join(' ') }, { text: 'hi there' }], 150, 3);
    expect(t).toEqual([0, 63]); expect(clock(63)).toBe('1:03'); expect(clock(3725)).toBe('1:02:05');
  });
});

describe('terms for clickable stats', () => {
  it('covers the top strip and Quant Lab labels', () => {
    for (const k of ['VIX', 'P/C (SPY)', 'Fear & Greed', '2s10s', '3m10y', '10Y', 'Oil (USO)', 'Dollar (UUP)', 'SPY exp. move', 'Walk-forward test', 'Luck check (q)', 'Momentum (winners minus losers)'])
      expect(lookupTerm(k), k).not.toBeNull();
  });
});
