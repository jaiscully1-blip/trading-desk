import { describe, expect, it } from 'vitest';
import { placeOf, pointsFromArticles } from '../shared/places';
import { parseCongress } from '../api/_lib/research/congress';

describe('headline places (GDELT GEO fallback)', () => {
  it('prefers the specific hotspot and ignores the word "us"', () => {
    expect(placeOf('Israeli strikes hit Gaza overnight')?.name).toBe('Gaza');
    expect(placeOf('Houthis fire on tanker in the Red Sea')?.name).toBe('Red Sea');
    expect(placeOf('Stocks give us a scare')).toBeNull();
    expect(placeOf('Nigeria raises rates')?.name).toBe('Nigeria');
  });
  it('groups articles and falls back to the outlet country', () => {
    const pts = pointsFromArticles([{ title: 'Oil jumps as Iran tensions rise', url: 'a' }, { title: 'Tehran warns shipping', url: 'b' }, { title: 'Markets wobble', url: 'c', sourcecountry: 'Japan' }, { title: 'nothing here', url: 'd' }]);
    expect(pts.map((p) => [p.name, p.count])).toEqual([['Iran', 1], ['Tehran, Iran', 1], ['Japan', 1]]);
  });
});

describe('congress trades', () => {
  it('drops repeated rows and sorts newest first', () => {
    const t = { politician_canonical: 'A B', party: 'R', state_district: 'FL27', chamber: 'HOUSE', transaction_type: 'BUY', transaction_date: '2026-10-23', amount_min: '1001.00', amount_max: '15000.00', owner_code: 'SELF' };
    const r = parseCongress({ trades: [t, t, { ...t, transaction_date: '2026-10-30', transaction_type: 'SELL' }] });
    expect(r.map((x) => [x.traded, x.type])).toEqual([['2026-10-30', 'SELL'], ['2026-10-23', 'BUY']]);
    expect(r[1]).toMatchObject({ min: 1001, max: 15000, state: 'FL27' });
  });
});
