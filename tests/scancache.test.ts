import { describe, expect, it } from 'vitest';
import { scanNeeds } from '../shared/scanCache';

const base = { universe: ['A', 'B', 'C'], now: 2000, lastCloseMs: 1000 };
describe('scanner cache', () => {
  it('open market: ask for everything so prices stay fresh', () => {
    expect(scanNeeds({ ...base, have: ['A', 'B', 'C'], savedAt: 1500, closed: false })).toEqual(['A', 'B', 'C']);
  });
  it('closed market, saved after the close: ask only for symbols never fetched', () => {
    expect(scanNeeds({ ...base, have: ['A'], savedAt: 1500, closed: true })).toEqual(['B', 'C']);
    expect(scanNeeds({ ...base, have: ['A', 'B', 'C'], savedAt: 1500, closed: true })).toEqual([]);
  });
  it('closed market but the copy predates the last close: refresh all', () => {
    expect(scanNeeds({ ...base, have: ['A', 'B', 'C'], savedAt: 500, closed: true })).toEqual(['A', 'B', 'C']);
    expect(scanNeeds({ ...base, have: [], savedAt: null, closed: true })).toEqual(['A', 'B', 'C']);
  });
});
