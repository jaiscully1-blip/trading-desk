import { describe, expect, it } from 'vitest';
import { EMPTY_FIN, interestCover, parseDistressFile, priceStats, rollup, runwayMonths, scoreCompany, shareChange, stateOf, tagHeadline, zScore, type DistressInput } from '../shared/distress';
import { finFromFrames, framePeriods, fromSubmissions, insiderAgg, parseEfts, parseFinraShort, parseFrame, parseSpark, parseYahooRss } from '../shared/distressGather';

const TODAY = '2026-11-11';
const base = (over: Partial<DistressInput> = {}): DistressInput => ({
  sym: 'XYZ', name: 'XYZ Corp', sector: 'Industrials', industry: 'Machinery', hq: 'Austin, Texas', state: 'TX', lat: 30.3, lon: -97.7,
  fin: null, events: [], late: [], goingConcern: null, insiders: { buys: 0, sells: 0, buyValue: 0, sellValue: 0, buyers: 0 }, price: null, shortVol: null, news: [], ...over,
});

describe('headline rules', () => {
  it('tags weak and strong headlines, and leaves mixed ones neutral', () => {
    expect(tagHeadline('Acme to cut 1,200 jobs as demand slows')).toMatchObject({ side: 'weak', tags: ['layoffs'] });
    expect(tagHeadline('Acme raises full-year guidance on strong orders')).toMatchObject({ side: 'turn' });
    expect(tagHeadline('Acme names new CEO')).toMatchObject({ side: 'turn', tags: ['new hire'] });
    expect(tagHeadline('Acme CFO steps down').side).toBe('weak');
    expect(tagHeadline('Acme lays off staff but raises guidance').side).toBe('none');
    expect(tagHeadline('Acme reports quarterly results').tags).toEqual([]);
  });
});

describe('financial ratios', () => {
  const fin = { ...EMPTY_FIN, assets: 1000, liabilities: 800, curAssets: 200, curLiab: 300, retained: -200, equity: 200, cash: 50, ebitQ: -10, ocfY: -120, interestY: 40, sharesNow: 120, sharesYearAgo: 100 };
  it('Altman Z", runway, cover and share change', () => {
    expect(zScore(fin)).toBeCloseTo(6.56 * -0.1 + 3.26 * -0.2 + 6.72 * -0.04 + 1.05 * 0.25, 5);
    expect(zScore(fin, 'Financials')).toBeNull();
    expect(zScore(fin, 'Utilities')).toBeNull();
    expect(runwayMonths(fin)).toBeCloseTo(5, 5);
    expect(runwayMonths({ ...fin, ocfY: 10 })).toBeNull();
    expect(interestCover({ ...fin, ebitQ: 20 })).toBeCloseTo(2, 5);
    expect(shareChange(fin)).toBeCloseTo(20, 5);
    expect(shareChange({ ...fin, sharesNow: 1024, sharesYearAgo: 251 })).toBeNull(); // 4:1 split, not dilution
    expect(shareChange({ ...fin, sharesNow: 10, sharesYearAgo: 100 })).toBeNull(); // 1:10 reverse split
  });
  it('a big buyback company with a low Z" but strong cash flow is not called distressed', () => {
    const r = scoreCompany(base({ fin: { ...EMPTY_FIN, assets: 1000, liabilities: 1100, curAssets: 100, curLiab: 300, retained: -500, equity: -100, cash: 100, ebitQ: 50, ocfY: 300, interestY: 20 } }), TODAY);
    expect(r.z).toBeLessThan(1.1);
    expect(r.signals.find((s) => s.id === 'z')!.pts).toBe(4);
    expect(r.label).toBe('healthy');
  });
});

describe('scoreCompany', () => {
  it('stacks real distress signals into "distressed" with sources', () => {
    const r = scoreCompany(base({
      events: [{ date: '2026-10-01', items: ['2.05', '9.01'], url: 'https://www.sec.gov/a' }, { date: '2026-09-01', items: ['3.01'], url: 'https://www.sec.gov/b' }],
      goingConcern: { date: '2026-08-10', form: '10-Q', url: 'https://www.sec.gov/c' },
      price: priceStats(Array.from({ length: 260 }, (_, i) => 100 - i * 0.3)),
    }), TODAY);
    expect(r.label).toBe('distressed');
    expect(r.weak).toBeGreaterThanOrEqual(40);
    expect(r.signals.every((s) => s.src)).toBe(true);
    expect(r.signals.find((s) => s.id === 'gc')?.url).toBe('https://www.sec.gov/c');
  });
  it('ignores 8-Ks older than 180 days and caps news points', () => {
    const news = Array.from({ length: 10 }, (_, i) => ({ t: Date.parse('2026-11-01') - i * 3600_000, title: `x ${i}`, url: `https://n/${i}`, src: 'T', tags: ['layoffs', 'downgrade', 'credit stress', 'probe', 'guidance cut'], side: 'weak' as const }));
    const r = scoreCompany(base({ events: [{ date: '2026-01-01', items: ['1.03'], url: 'u' }], news }), TODAY);
    expect(r.signals.find((s) => s.id.startsWith('8k'))).toBeUndefined();
    expect(r.signals.find((s) => s.id === 'news-weak')!.pts).toBe(15);
  });
  it('a beaten-down name with insider buying and buybacks is a turnaround', () => {
    const closes = [...Array.from({ length: 150 }, (_, i) => 100 - i * 0.4), ...Array.from({ length: 110 }, (_, i) => 40 + i * 0.12)];
    const r = scoreCompany(base({ insiders: { buys: 3, sells: 0, buyValue: 2e6, sellValue: 0, buyers: 2 }, fin: { ...EMPTY_FIN, assets: 1000, sharesNow: 95, sharesYearAgo: 100 }, price: priceStats(closes) }), TODAY);
    expect(r.price!.ddPct).toBeLessThan(-25);
    expect(r.label).toBe('turnaround');
  });
  it('says what was not read instead of treating it as good news', () => {
    const r = scoreCompany(base({ fin: null, events: null, late: null, goingConcern: undefined, insiders: null, news: null }), TODAY);
    expect(r.missing).toEqual(expect.arrayContaining(['8-K filings', 'financials', 'insider filings', 'news', 'going-concern search', 'price history']));
  });
});

describe('roll-ups and helpers', () => {
  it('rolls up by sector, most stressed first', () => {
    const a = scoreCompany(base({ sym: 'A', sector: 'Energy', goingConcern: { date: '2026-10-01', form: '10-Q', url: 'u' }, late: [{ form: 'NT 10-Q', date: '2026-10-01', url: 'u' }] }), TODAY);
    const b = scoreCompany(base({ sym: 'B', sector: 'Tech' }), TODAY);
    const g = rollup([a, b], (r) => r.sector);
    expect(g[0].key).toBe('Energy');
    expect(g[0].distressed).toBe(1);
  });
  it('finds the US state in an HQ string', () => {
    expect(stateOf('Santa Clara, California')).toBe('CA');
    expect(stateOf('Dublin, Ireland')).toBe('');
    expect(stateOf('Austin, TX')).toBe('TX');
  });
  it('price stats', () => {
    const p = priceStats(Array.from({ length: 252 }, (_, i) => 50 + i))!;
    expect(p.hi52).toBe(301); expect(p.ddPct).toBeCloseTo(0, 5); expect(p.above50).toBe(true);
    expect(priceStats([1, 2, 3])).toBeNull();
  });
  it('rejects a malformed published file', () => {
    expect(parseDistressFile({ version: 1, rows: [{ sym: 'A' }], sectors: [] }).ok).toBe(false);
    expect(parseDistressFile({ version: 2 }).ok).toBe(false);
  });
});

describe('gather parsers', () => {
  it('picks the last finished quarter and the year before', () => {
    const p = framePeriods('2026-11-11');
    expect(p.inst).toEqual(['CY2026Q3I', 'CY2026Q2I']);
    expect(p.instYearAgo[0]).toBe('CY2025Q3I');
    expect(p.year).toBe('CY2025');
    expect(framePeriods('2026-02-01').inst[0]).toBe('CY2025Q3I'); // Q4 is reported in 10-Ks, mostly filed in late February
  });
  it('builds Fin from frames, falling back to the older quarter and to L&SE minus equity', () => {
    const P = framePeriods('2026-11-11');
    const fr = (rows: [number, number][]) => parseFrame({ data: rows.map(([cik, val]) => ({ cik, val, end: '2026-06-30' })) });
    const f = finFromFrames({ 'Assets@CY2026Q2I': fr([[7, 500]]), 'LiabilitiesAndStockholdersEquity@CY2026Q2I': fr([[7, 500]]), 'StockholdersEquity@CY2026Q2I': fr([[7, 120]]),
      'Revenues@CY2026Q3': fr([[7, 90]]), 'Revenues@CY2025Q3': fr([[7, 100]]), 'NetCashProvidedByUsedInOperatingActivities@CY2025': fr([[7, -24]]) }, P, 7)!;
    expect(f.assets).toBe(500); expect(f.liabilities).toBe(380); expect(f.revenueQ).toBe(90); expect(f.revenueQPrev).toBe(100); expect(f.ocfY).toBe(-24);
    expect(finFromFrames({}, P, 7)).toBeNull();
  });
  it('reads 8-K items, late filings and Form 4s from submissions', () => {
    const j = { addresses: { business: { stateOrCountry: 'TX', city: 'AUSTIN' } }, filings: { recent: {
      form: ['8-K', '4', 'NT 10-Q', '8-K', '10-K'], filingDate: ['2026-11-01', '2026-10-20', '2026-08-15', '2025-01-01', '2024-01-01'],
      accessionNumber: ['0001-26-1', '0001-26-2', '0001-26-3', '0001-25-4', '0001-24-5'], primaryDocument: ['a.htm', 'xslF345X05/f4.xml', 'nt.htm', 'b.htm', 'k.htm'], items: ['2.05,9.01', '', '', '5.02', ''] } } };
    const s = fromSubmissions(j, 99, TODAY);
    expect(s.events).toHaveLength(1);
    expect(s.events[0].items).toEqual(['2.05', '9.01']);
    expect(s.late[0].form).toBe('NT 10-Q');
    expect(s.form4[0].url).toBe('https://www.sec.gov/Archives/edgar/data/99/0001262/f4.xml');
    expect(s.state).toBe('TX');
  });
  it('counts open-market buys and sells only', () => {
    const t = (code: string, who: string, value: number, date = '2026-10-01') => ({ date, filed: date, who, role: '', code, kind: '', shares: 1, price: 1, value, after: null, url: '' });
    expect(insiderAgg([t('P', 'a', 100), t('P', 'b', 50), t('S', 'c', 10), t('A', 'd', 999), t('P', 'e', 1, '2026-01-01')], TODAY)).toEqual({ buys: 2, sells: 1, buyValue: 150, sellValue: 10, buyers: 2 });
  });
  it('full-text search hits, spark prices, FINRA short volume and Yahoo RSS', () => {
    const m = new Map();
    parseEfts({ hits: { hits: [{ _source: { ciks: ['0000000042'], adsh: '0001-26-000001', file_date: '2026-08-01', form: '10-Q' } }, { _source: { ciks: ['0000000042'], adsh: '0001-26-000002', file_date: '2026-10-01', form: '10-Q' } }] } }, m);
    expect(m.get(42)).toMatchObject({ date: '2026-10-01', url: 'https://www.sec.gov/Archives/edgar/data/42/000126000002/' });
    expect(parseSpark({ 'BRK-B': { close: [1, null, 2] } }, ['BRK.B']).get('BRK.B')).toEqual([1, 2]);
    expect(parseFinraShort(['Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market\n1|AA|60|0|100|N\n1|ZZ|1|0|2|N', 'h\n2|AA|40|0|100|N'], new Set(['AA'])).get('AA')).toBeCloseTo(0.5, 5);
    const rss = '<rss><channel><item><title>Acme to cut 500 jobs</title><link>https://finance.yahoo.com/x</link><pubDate>Mon, 10 Nov 2026 12:00:00 +0000</pubDate></item><item><title>bad</title><link>javascript:x</link><pubDate>Mon, 10 Nov 2026 12:00:00 +0000</pubDate></item></channel></rss>';
    const n = parseYahooRss(rss);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ side: 'weak', tags: ['layoffs'] });
  });
});

describe('fixes from the first full run', () => {
  const b = (over: Partial<DistressInput> = {}): DistressInput => ({ sym: 'X', name: 'X', sector: 'Industrials', industry: '', hq: '', state: '', lat: null, lon: null, fin: null, events: [], late: [], goingConcern: null, insiders: null, price: null, shortVol: null, news: [], ...over });
  const px = (last: number, dd: number) => ({ last, hi52: last / (1 + dd / 100), lo52: last, ddPct: dd, offLowPct: 0, r3m: null, rv20: null, above50: null });
  it('a listing notice from a healthy stock (a transfer) counts little; from a collapsed one, a lot', () => {
    const ev = [{ date: '2026-10-01', items: ['3.01'], url: 'u' }];
    expect(scoreCompany(b({ events: ev, price: px(150, -10) }), TODAY).signals.find((s) => s.id === '8k-3.01')!.pts).toBe(4);
    expect(scoreCompany(b({ events: ev, price: px(3, -70) }), TODAY).signals.find((s) => s.id === '8k-3.01')!.pts).toBe(18);
  });
  it('shares up after a completed acquisition are not called dilution', () => {
    const fin = { ...EMPTY_FIN, assets: 100, sharesNow: 137, sharesYearAgo: 100 };
    const s = scoreCompany(b({ fin, events: [{ date: '2026-09-01', items: ['2.01'], url: 'u' }] }), TODAY).signals.find((x) => x.id === 'dilution')!;
    expect(s.pts).toBe(2);
    expect(s.text).toContain('acquisition');
  });
  it('small insider buys print in thousands, not $0M', () => {
    const s = scoreCompany(b({ insiders: { buys: 1, sells: 0, buyValue: 85_000, sellValue: 0, buyers: 1 } }), TODAY).signals.find((x) => x.id === 'ins-buy')!;
    expect(s.text).toContain('$85K');
  });
});
