import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as research } from '../api/research';
import { _clearCache, _resetLimits } from '../api/_lib/core';
import { isIpoHeadline, mdy, mergeEarnings, mergeIpos, money, parseEdgarAtom, parseFinnhubIpo, parseNasdaqEarnings, parseNasdaqIpo, sortEarnings, surprisePct } from '../shared/eventsCal';

const nqEarn = { data: { rows: [
  { lastYearRptDt: '11/03/2025', lastYearEPS: '$1.43', time: 'time-after-hours', symbol: 'FNV', name: 'Franco-Nevada Corporation', marketCap: '$50,867,020,000', fiscalQuarterEnding: 'Sep/2026', epsForecast: '$1.77', noOfEsts: '3' },
  { lastYearRptDt: 'N/A', lastYearEPS: '($0.20)', time: 'time-pre-market', symbol: 'TINY', name: 'Tiny Co', marketCap: '$12,000,000', fiscalQuarterEnding: 'Sep/2026', epsForecast: '($0.12)', noOfEsts: '1' },
  { time: 'time-not-supplied', symbol: 'BIGG', name: 'Big Corp', marketCap: '$900,000,000,000', fiscalQuarterEnding: 'Oct/2026', epsForecast: 'N/A', noOfEsts: '0' },
] } };
const nqIpo = { data: {
  priced: { rows: [{ proposedTickerSymbol: 'NARA', companyName: 'Narragansett Bancorp, Inc.', proposedExchange: 'NASDAQ Capital', proposedSharePrice: '10.00', sharesOffered: '9,098,800', pricedDate: '11/02/2026', dollarValueOfSharesOffered: '$90,988,000', dealStatus: 'Priced' }] },
  upcoming: { upcomingTable: { rows: [{ proposedTickerSymbol: 'NEWC', companyName: 'NewCo Holdings', proposedExchange: 'NYSE', proposedSharePrice: '14.00-16.00', sharesOffered: '5,000,000', expectedPriceDate: '11/13/2026', dollarValueOfSharesOffered: '$75,000,000' }] } },
  filed: { rows: [{ proposedTickerSymbol: 'RACV', companyName: 'Research Alliance Corp V', filedDate: '11/09/2026', dollarValueOfSharesOffered: '$62,000,000' }] },
  withdrawn: { rows: [{ proposedTickerSymbol: null, companyName: 'Bitari Inc', sharesOffered: '4,285,715', filedDate: '8/21/2026', dollarValueOfSharesOffered: '$34,500,004', withdrawDate: '11/09/2026' }] },
} };
const atom = `<?xml version="1.0"?><feed><entry><title>424B4 - Narragansett Bancorp, Inc. (0002012345) (Filer)</title><link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/2012345/0001437749-26-012345-index.htm"/><updated>2026-11-09T16:02:11-05:00</updated></entry><entry><title>S-1 - R&amp;D Labs Inc (0001999999) (Filer)</title><link rel="alternate" href="https://www.sec.gov/Archives/edgar/data/1999999/0001-index.htm"/><updated>2026-11-08T09:00:00-05:00</updated></entry><entry><title>junk</title><link href="https://evil.example/x"/><updated>2026-11-08T09:00:00-05:00</updated></entry></feed>`;

describe('earnings and IPO parsers', () => {
  it('reads Nasdaq money and dates', () => {
    expect(money('$50,867,020,000')).toBe(50867020000);
    expect(money('($0.12)')).toBe(-0.12);
    expect(money('N/A')).toBeNull();
    expect(money('')).toBeNull();
    expect(mdy('11/02/2026')).toBe('2026-11-02');
    expect(mdy('8/21/2026')).toBe('2026-08-21');
    expect(mdy(undefined)).toBe('');
  });
  it('parses Nasdaq earnings rows with timing, market cap and negative estimates', () => {
    const r = parseNasdaqEarnings(nqEarn, '2026-11-10');
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({ sym: 'FNV', when: 'amc', mcap: 50867020000, epsEst: 1.77, nEsts: 3, epsLastYear: 1.43, date: '2026-11-10', quarter: 'Sep/2026' });
    expect(r[1]).toMatchObject({ when: 'bmo', epsEst: -0.12 });
    expect(r[2]).toMatchObject({ when: 'unknown', epsEst: null });
  });
  it('merges Finnhub actuals into Nasdaq rows and sorts the biggest companies first within a day', () => {
    const base = parseNasdaqEarnings(nqEarn, '2026-11-10');
    const m = mergeEarnings(base, [{ sym: 'FNV', date: '2026-11-10', hour: 'amc', epsEst: 1.75, epsAct: 1.9, revEst: 300, revAct: 320 }, { sym: 'ONLY', date: '2026-11-11', hour: 'bmo', epsEst: 0.5, epsAct: null, revEst: null, revAct: null }]);
    const fnv = m.find((x) => x.sym === 'FNV')!;
    expect(fnv).toMatchObject({ epsAct: 1.9, epsEst: 1.75, revAct: 320, source: 'Nasdaq + Finnhub' });
    expect(m.find((x) => x.sym === 'ONLY')).toMatchObject({ source: 'Finnhub', when: 'bmo' });
    expect(sortEarnings(m).map((x) => x.sym)).toEqual(['BIGG', 'FNV', 'TINY', 'ONLY']);
    expect(surprisePct(1.9, 1.75)).toBeCloseTo(8.57, 1);
    expect(surprisePct(0.1, 0)).toBeNull();
    expect(surprisePct(null, 1)).toBeNull();
  });
  it('parses the four Nasdaq IPO sections and merges later stages over earlier ones', () => {
    const a = parseNasdaqIpo(nqIpo);
    expect(a.map((x) => [x.sym || x.name, x.status])).toEqual([['NEWC', 'upcoming'], ['NARA', 'priced'], ['RACV', 'filed'], ['Bitari Inc', 'withdrawn']]);
    expect(a[0]).toMatchObject({ date: '2026-11-13', price: '14.00-16.00', shares: 5000000, amount: 75000000 });
    expect(a[3].date).toBe('2026-11-09'); // withdrawal date wins over the filing date
    const f = parseFinnhubIpo({ ipoCalendar: [{ date: '2026-11-13', exchange: 'NYSE', name: 'NewCo Holdings', numberOfShares: 5000000, price: '14-16', status: 'expected', symbol: 'NEWC', totalSharesValue: 75000000 }, { date: '2026-11-02', name: 'Narragansett Bancorp, Inc.', status: 'priced', symbol: 'NARA', price: '10' }] });
    const m = mergeIpos(a, f);
    expect(m.find((x) => x.sym === 'NARA')).toMatchObject({ status: 'priced', source: 'Nasdaq + Finnhub' });
    expect(m.filter((x) => x.sym === 'NEWC')).toHaveLength(1);
  });
  it('reads EDGAR atom entries and ignores links that are not sec.gov', () => {
    const f = parseEdgarAtom(atom);
    expect(f).toHaveLength(2);
    expect(f[0]).toEqual({ form: '424B4', company: 'Narragansett Bancorp, Inc.', date: '2026-11-09', url: expect.stringContaining('https://www.sec.gov/') });
    expect(f[1].company).toBe('R&D Labs Inc');
  });
  it('recognises IPO headlines without matching IPO ETF noise', () => {
    expect(isIpoHeadline('Acme prices upsized IPO at $18')).toBe(true);
    expect(isIpoHeadline('Startup files confidentially to go public')).toBe(true);
    expect(isIpoHeadline('The best IPO ETFs to own')).toBe(false);
    expect(isIpoHeadline('Fed holds rates steady')).toBe(false);
  });
});

describe('/api/research?fn=eventcal', () => {
  const calls: string[] = [];
  beforeEach(() => {
    _clearCache(); _resetLimits(); calls.length = 0;
    process.env.FINNHUB_API_KEY = 'fh-key';
    process.env.SEC_USER_AGENT = 'TradingDesk test';
    vi.stubGlobal('fetch', async (input: string) => {
      const u = new URL(input);
      calls.push(u.host + u.pathname);
      if (u.host === 'api.nasdaq.com' && u.pathname.includes('/calendar/earnings')) return Response.json(nqEarn);
      if (u.host === 'api.nasdaq.com' && u.pathname.includes('/ipo/calendar')) return Response.json(nqIpo);
      if (u.host === 'finnhub.io' && u.pathname.endsWith('/calendar/earnings')) return Response.json({ earningsCalendar: [{ symbol: 'FNV', date: u.searchParams.get('from'), hour: 'amc', epsEstimate: 1.75, epsActual: 1.9, revenueEstimate: 300, revenueActual: 320 }] });
      if (u.host === 'finnhub.io' && u.pathname.endsWith('/calendar/ipo')) return Response.json({ ipoCalendar: [] });
      if (u.host === 'www.sec.gov') return new Response(atom, { headers: { 'content-type': 'application/atom+xml' } });
      return new Response('not found', { status: 404 });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns earnings, IPOs and SEC filings, keeps the tickers you asked for, and never leaks keys', async () => {
    const r = await research(new Request('http://x/api/research?fn=eventcal&symbols=TINY'));
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.earnings.length).toBeGreaterThan(3);
    expect(j.earnings.some((e: { sym: string }) => e.sym === 'TINY')).toBe(true);
    expect(j.ipos.map((x: { status: string }) => x.status).sort()).toEqual(['filed', 'priced', 'upcoming', 'withdrawn']);
    expect(j.filings.length).toBeGreaterThan(0);
    expect(j.errors).toEqual({});
    expect(JSON.stringify(j)).not.toContain('fh-key');
    expect(calls.filter((c) => c === 'api.nasdaq.com/api/ipo/calendar')).toHaveLength(2); // this month and next
  });
  it('names a source that failed instead of failing the whole response', async () => {
    vi.stubGlobal('fetch', async (input: string) => {
      const u = new URL(input);
      if (u.host === 'api.nasdaq.com') return new Response('blocked', { status: 403 });
      if (u.host === 'finnhub.io' && u.pathname.endsWith('/calendar/earnings')) return Response.json({ earningsCalendar: [{ symbol: 'FNV', date: u.searchParams.get('from'), hour: 'amc', epsEstimate: 1.75, epsActual: null, revenueEstimate: null, revenueActual: null }] });
      if (u.host === 'finnhub.io') return Response.json({ ipoCalendar: [{ date: '2026-11-13', name: 'NewCo', symbol: 'NEWC', status: 'expected' }] });
      return new Response('nope', { status: 500 });
    });
    const j = await (await research(new Request('http://x/api/research?fn=eventcal'))).json();
    expect(j.errors.nasdaqEarnings).toBeTruthy();
    expect(j.errors.nasdaqIpo).toBeTruthy();
    expect(j.earnings.length).toBeGreaterThan(0); // Finnhub alone still fills the calendar
    expect(j.ipos.map((x: { sym: string }) => x.sym)).toEqual(['NEWC']);
  });
});
