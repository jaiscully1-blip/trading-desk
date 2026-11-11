import { describe, expect, it } from 'vitest';
import { countJobs, jobsAgg, matchWarn, normCo, parseCsv, parseWarn, pushHistory, sameCompany, slugCandidates, warnAgg, warnByState } from '../shared/labor';
import { distressAlerts, marketOpen, parseDayBars, priceAlerts, readTickers } from '../shared/alerts';
import { scoreCompany, type DistressInput, type DistressRow } from '../shared/distress';

const TODAY = '2026-11-11';
const CSV = `hash_id,postal_code,company,location,notice_date,effective_date,jobs,is_temporary,is_closure,is_amendment
a,CA,"Apple, Inc. - Cupertino",Cupertino,2026-10-01,,120,,False,False
b,CA,Apple Auto Mitsubishi,Fresno,2026-10-02,,60,,,False
c,IL,"Tyson Foods, Inc.",Joslin,2026-09-15,,"1,200",,True,False
d,IL,"Tyson Foods, Inc.",Joslin,2026-09-20,,1200,,True,True
e,WA,Target Logistics LLC,Kent,2026-10-10,,80,,,False
f,KY,Old Notice Co,X,2024-01-01,,500,,,False
g,KY,Typo Future Inc,X,2027-07-01,,26,,True,False
h,TX,Frito-Lay Inc,Irving,2026-10-20,,90,,,False`;

describe('WARN notices', () => {
  const ns = parseWarn(CSV, TODAY);
  it('parses quoted CSV, drops amendments, old notices and far-future typos', () => {
    expect(parseCsv('a,"b,c",d\n"x ""y""",2,3')).toEqual([['a', 'b,c', 'd'], ['x "y"', '2', '3']]);
    expect(ns.map((n) => n.company)).toEqual(['Apple, Inc. - Cupertino', 'Apple Auto Mitsubishi', 'Tyson Foods, Inc.', 'Target Logistics LLC', 'Frito-Lay Inc']);
    expect(ns.find((n) => n.company.startsWith('Tyson'))).toMatchObject({ jobs: 1200, closure: true });
  });
  it('matches filers to companies without generic-word false positives', () => {
    const m = matchWarn(ns, [{ sym: 'AAPL', name: 'Apple Inc.' }, { sym: 'TSN', name: 'Tyson Foods' }, { sym: 'TGT', name: 'Target Corporation' }, { sym: 'PEP', name: 'PepsiCo' }]);
    expect(m.get('AAPL')?.map((n) => n.location)).toEqual(['Cupertino']);
    expect(m.get('TSN')).toHaveLength(1);
    expect(m.get('TGT')).toBeUndefined(); // "Target Logistics" is a different company
    expect(m.get('PEP')?.[0].company).toBe('Frito-Lay Inc'); // subsidiary alias
    expect(warnAgg(m.get('TSN')!, TODAY)).toMatchObject({ jobs: 1200, states: ['IL'], closure: true });
    expect(warnByState(ns, TODAY).CA).toEqual({ notices: 2, jobs: 180 });
  });
  it('adds a WARN signal to the score', () => {
    const base: DistressInput = { sym: 'TSN', name: 'Tyson', sector: '', industry: '', hq: '', state: '', lat: null, lon: null, fin: null, events: [], late: [], goingConcern: null, insiders: null, price: null, shortVol: null, news: [] };
    const r = scoreCompany({ ...base, warn: { notices: 1, jobs: 1200, states: ['IL'], closure: true, latest: '2026-09-15', names: ['Tyson Foods, Inc.'] } }, TODAY);
    expect(r.signals.find((s) => s.id === 'warn')).toMatchObject({ pts: 13, side: 'weak' });
    expect(scoreCompany(base, TODAY).missing).toContain('WARN notices');
  });
});

describe('job boards', () => {
  it('normalizes names and proposes safe board slugs', () => {
    expect(normCo('Bank of America Corp.')).toBe('bank of america');
    expect(slugCandidates('Bank of America Corp.')).toEqual(['bankofamerica', 'bank-of-america']);
    expect(slugCandidates('Target Corporation')).toEqual([]);
    expect(sameCompany('Robinhood', 'Robinhood Markets, Inc.')).toBe(true);
    expect(sameCompany('Acme Labs', 'Robinhood Markets')).toBe(false);
  });
  it('counts jobs from each API shape', () => {
    expect(countJobs('greenhouse', { jobs: [1, 2], meta: { total: 156 } })).toBe(156);
    expect(countJobs('lever', [1, 2, 3])).toBe(3);
    expect(countJobs('ashby', { jobs: [1] })).toBe(1);
    expect(countJobs('lever', { ok: false })).toBeNull();
  });
  it('keeps one point a day and reads 30 / 90 day changes', () => {
    let h: [string, number][] = [];
    h = pushHistory(h, '2026-08-13', 200); h = pushHistory(h, '2026-10-12', 150); h = pushHistory(h, TODAY, 90); h = pushHistory(h, TODAY, 100);
    expect(h).toHaveLength(3);
    expect(jobsAgg({ ats: 'greenhouse', slug: 'x' }, h, TODAY)).toMatchObject({ count: 100, d30: 150, d90: 200, url: 'https://job-boards.greenhouse.io/x' });
    expect(jobsAgg({ ats: 'lever', slug: 'x' }, [[TODAY, 5]], TODAY)).toMatchObject({ d30: null, d90: null });
  });
});

describe('phone alerts', () => {
  const chart = (closes: number[], highs: number[], lows: number[], last: number, lastDay: string) => ({ chart: { result: [{ meta: { regularMarketPrice: last, regularMarketTime: Date.parse(`${lastDay}T19:00:00Z`) / 1000 }, timestamp: closes.map((_, i) => Date.parse(`2026-11-${String(6 + i).padStart(2, '0')}T14:30:00Z`) / 1000), indicators: { quote: [{ close: closes, high: highs, low: lows }] } }] } });
  it('reads yesterday from the bar before today', () => {
    const b = parseDayBars(chart([10, 11, 12], [10.5, 11.5, 12.5], [9.5, 10.5, 11.5], 13, '2026-11-08'))!;
    expect(b).toMatchObject({ last: 13, prevClose: 11, prevHigh: 11.5, prevLow: 10.5 });
  });
  it('fires moves and level breaks, once per day id', () => {
    const a = priceAlerts('NVDA', { last: 109, prevClose: 100, prevHigh: 105, prevLow: 98, at: 0 }, TODAY);
    expect(a.map((x) => x.id)).toEqual([`${TODAY}:NVDA:move+8`, `${TODAY}:NVDA:pdh`]);
    expect(priceAlerts('NVDA', { last: 105, prevClose: 100, prevHigh: 110, prevLow: 98, at: 0 }, TODAY, 4, new Set([`${TODAY}:NVDA:move+8`]))).toEqual([]); // no 4% alert after the 8% one
    expect(priceAlerts('X', { last: 100.5, prevClose: 100, prevHigh: 101, prevLow: 99, at: 0 }, TODAY)).toEqual([]);
  });
  it('label changes only for the alert list', () => {
    const row = (sym: string, label: DistressRow['label']) => ({ sym, label, weak: 50, turn: 0, signals: [{ text: 'x' }] }) as unknown as DistressRow;
    const out = distressAlerts([row('A', 'watch'), row('B', 'healthy')], [row('A', 'distressed'), row('B', 'distressed')], new Set(['A']), TODAY);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: 'A: watch → distressed', priority: 4 });
  });
  it('market hours and ticker lists', () => {
    expect(marketOpen(Date.parse('2026-11-11T15:00:00Z'))).toBe(true); // 10:00 New York
    expect(marketOpen(Date.parse('2026-11-11T21:30:00Z'))).toBe(false); // 16:30
    expect(marketOpen(Date.parse('2026-11-14T15:00:00Z'))).toBe(false); // Saturday
    expect(readTickers('# x\nspy\nNVDA # chips\nbad ticker!\nSPY')).toEqual(['SPY', 'NVDA']);
  });
});
