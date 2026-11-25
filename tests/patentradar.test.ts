import { describe, expect, it } from 'vitest';
import { RADAR, RADAR_GROUPS, change, radarBody, radarWindows, themeQ, topFacet } from '../shared/patentRadar';

describe('patent radar', () => {
  it('has every theme in a known group, named groups first and all 9 CPC sections', () => {
    expect(RADAR.every((t) => (RADAR_GROUPS as readonly string[]).includes(t.group))).toBe(true);
    expect(RADAR.filter((t) => t.group === 'All sectors').map((t) => t.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'Y']);
    expect(new Set(RADAR.map((t) => t.id)).size).toBe(RADAR.length);
  });
  it('builds prefix queries in both forms', () => {
    expect(themeQ(['G06N'], 'wild')).toBe('applicationMetaData.cpcClassificationBag:G06N*');
    expect(themeQ(['H01L', 'H10'], 'quoted-wild')).toBe('(applicationMetaData.cpcClassificationBag:"H01L*" OR applicationMetaData.cpcClassificationBag:"H10*")');
  });
  it('compares the last 90 days with the same days a year earlier', () => {
    const w = radarWindows(new Date('2026-11-25T15:00:00Z'));
    expect(w.cur).toEqual({ from: '2026-08-27', to: '2026-11-24' });
    expect(w.prev).toEqual({ from: '2025-08-27', to: '2025-11-24' });
  });
  it('counts by publication or grant date, facets only when asked', () => {
    const w = { from: 'a', to: 'b' };
    expect(radarBody('q', 'published', w).rangeFilters[0].field).toBe('applicationMetaData.earliestPublicationDate');
    expect(radarBody('q', 'granted', w).rangeFilters[0].field).toBe('applicationMetaData.grantDate');
    expect('facets' in radarBody('q', 'granted', w)).toBe(false);
    expect(radarBody('q', 'granted', w, true).facets).toEqual(['applicationMetaData.firstApplicantName']);
  });
  it('reads top filers from several facet shapes', () => {
    expect(topFacet({ facets: [{ field: 'x', values: [{ value: 'A', count: 2 }, { value: 'B', count: 9 }] }] })).toEqual([{ name: 'B', n: 9 }, { name: 'A', n: 2 }]);
    expect(topFacet({ facets: { x: [{ key: 'C', docCount: 4 }] } })).toEqual([{ name: 'C', n: 4 }]);
    expect(topFacet({})).toEqual([]);
  });
  it('computes % change only when the base is known and non-zero', () => {
    expect(change(150, 100)).toBe(50);
    expect(change(5, 0)).toBeNull();
    expect(change(null, 3)).toBeNull();
  });
});

describe('sub-category spellings', () => {
  it('tries spaced and slashed forms for group-level codes only', async () => {
    const { prefixVariants, hasGroup, RADAR, orQ } = await import('../shared/patentRadar');
    expect(prefixVariants('G06N')).toEqual(['applicationMetaData.cpcClassificationBag:G06N*']);
    expect(prefixVariants('G06N10')).toEqual([
      'applicationMetaData.cpcClassificationBag:G06N10*',
      'applicationMetaData.cpcClassificationBag:G06N\\ 10*',
      'applicationMetaData.cpcClassificationBag:"G06N 10/*"',
      'applicationMetaData.cpcClassificationBag:G06N10/*',
    ]);
    expect(RADAR.filter(hasGroup).map((t) => t.id)).toEqual(['quantum']);
    expect(orQ(['a', 'b'])).toBe('(a OR b)');
  });
});
