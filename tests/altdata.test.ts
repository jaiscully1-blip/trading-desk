import { describe, expect, it } from 'vitest';
import { appRank, countJobs, prune, series, spike, trend, type AltFile } from '../shared/altdata';

describe('alt data snapshots', () => {
  const f: AltFile = { version: 1, updated: '', days: {
    '2025-11-12': { jobs: { HOOD: 100 }, apps: { UBER: 60 }, github: { UBER: { repos: 300, pushed30: 20, stars: 5000 } } },
    '2026-10-13': { jobs: { HOOD: 150 }, apps: { UBER: 50 } },
    '2026-11-13': { jobs: { HOOD: 160 }, apps: { UBER: 54 }, github: { UBER: { repos: 310, pushed30: 25, stars: 6000 } } },
  } };
  it('pulls one ticker\'s series, oldest first (GitHub uses repos pushed in 30 days)', () => {
    expect(series(f, 'jobs', 'HOOD').map((x) => x.value)).toEqual([100, 150, 160]);
    expect(series(f, 'github', 'UBER').map((x) => x.value)).toEqual([20, 25]);
    expect(series(null, 'jobs', 'HOOD')).toEqual([]);
  });
  it('30-day and 1-year change, as % or as rank places', () => {
    const t = trend(series(f, 'jobs', 'HOOD'));
    expect(t.last).toBe(160);
    expect(t.d30).toBeCloseTo((160 / 150 - 1) * 100);
    expect(t.d365).toBeCloseTo(60);
    expect(trend(series(f, 'apps', 'UBER'), 'diff')).toMatchObject({ d30: 4, d365: -6 });
  });
  it('counts jobs from each board format and finds app ranks by publisher', () => {
    expect(countJobs({ jobs: [1, 2, 3] })).toBe(3);
    expect(countJobs([1, 2])).toBe(2);
    expect(countJobs({})).toBeNull();
    expect(appRank([{ artistName: 'TikTok Ltd.' }, { artistName: 'Uber Technologies, Inc.' }], ['Uber Technologies'])).toBe(2);
    expect(appRank([{ artistName: 'X' }], ['Uber'])).toBeNull();
  });
  it('mention spike vs the 7 days before, and pruning old days', () => {
    const s = [10, 10, 10, 10, 10, 10, 10, 40].map((v, i) => ({ date: `2026-11-0${i + 1}`, value: v }));
    expect(spike(s)).toBe(4);
    expect(spike(s.slice(0, 2))).toBeNull();
    expect(Object.keys(prune(f, '2026-11-13', 60).days)).toEqual(['2026-10-13', '2026-11-13']);
  });
});
