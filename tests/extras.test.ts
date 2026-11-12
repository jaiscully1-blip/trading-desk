import { describe, expect, it } from 'vitest';
import { addActuals, csvLine, daysLate, fundMessages, highShortInterest, parseDataroma, parseEarningsApiCal, parseHolidays, parseMempool, parseReactions, parseTradeTime, parseZillowHead } from '../shared/extras';
import type { EarnItem } from '../shared/eventsCal';

describe('earningsapi.com', () => {
  const cal = parseEarningsApiCal({ date: '2026-11-11', pre: [{ symbol: 'aaa', name: 'A Co', epsEstimate: 1.2, eps: 1.36, revenue: 100, revenueEstimate: 90 }], after: [{ symbol: 'BBB', name: 'B', epsEstimate: 0.5, eps: null }], notSupplied: [{ symbol: '???' }] }, '2026-11-11');
  it('maps pre / after to before-open / after-close and keeps nulls', () => {
    expect(cal.map((r) => [r.sym, r.when, r.epsAct])).toEqual([['AAA', 'bmo', 1.36], ['BBB', 'amc', null]]);
  });
  it('fills actuals without overwriting', () => {
    const base = (p: Partial<EarnItem>): EarnItem => ({ date: '2026-11-11', sym: 'AAA', name: '', when: 'unknown', quarter: '', epsEst: 1.25, epsAct: null, revEst: null, revAct: null, nEsts: null, mcap: 5e9, epsLastYear: null, source: 'Nasdaq', ...p });
    const [a, b] = addActuals([base({}), base({ sym: 'BBB', epsAct: 0.6 })], cal);
    expect(a).toMatchObject({ epsAct: 1.36, epsEst: 1.25, revAct: 100, when: 'bmo', source: 'Nasdaq + Earnings API' });
    expect(b.epsAct).toBe(0.6);
  });
  it('reactions: newest first, next-day and 3-day moves', () => {
    const r = parseReactions([
      { date: '2026-01-29', eps: { surprisePercent: 7.2, beat: true }, revenue: { surprisePercent: 3.9, beat: true }, reactions: [{ date: '2026-02-02', priceChange: 4 }, { date: '2026-01-30', priceChange: 1 }, { date: '2026-02-03', priceChange: -2 }] },
      { date: '2026-04-30', eps: { surprisePercent: -1, beat: false }, reactions: [] },
    ]);
    expect(r.map((x) => x.date)).toEqual(['2026-04-30', '2026-01-29']);
    expect(r[1].day1).toEqual({ date: '2026-01-30', pct: 1 });
    expect(r[1].day3).toBeCloseTo((1.01 * 1.04 * 0.98 - 1) * 100);
    expect(r[0]).toMatchObject({ epsBeat: false, day1: null, day3: null });
  });
});

describe('Trade Time, Zillow, mempool', () => {
  it('exchange status and holidays', () => {
    expect(parseTradeTime({ exchanges: [{ id: 'nyse', name: 'NYSE', timezone: 'America/New_York', open: false, status: 'closed', timeToNextHours: 5.5, closedReason: 'holiday' }] })[0]).toMatchObject({ id: 'nyse', open: false, toNextH: 5.5, closedReason: 'holiday' });
    expect(parseHolidays({ holidays: ['2026-11-26', 'x'], earlyCloses: [{ date: '2026-11-27', closeTime: 13 }] })).toEqual({ holidays: ['2026-11-26'], early: [{ date: '2026-11-27', close: 13 }] });
  });
  it('Zillow head: quoted names, year-over-year, cut-off last line dropped', () => {
    expect(csvLine('1,"New York, NY",x')).toEqual(['1', 'New York, NY', 'x']);
    const months = Array.from({ length: 14 }, (_, i) => `2025-${String(((i + 7) % 12) + 1).padStart(2, '0')}-28`); // Aug 2025 … Sep 2026 (labels only)
    const head = `RegionID,SizeRank,RegionName,RegionType,StateName,${['2025-08-31', '2025-09-30', '2025-10-31', '2025-11-30', '2025-12-31', '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30'].join(',')}`;
    const us = `102001,0,United States,country,,${Array.from({ length: 14 }, (_, i) => 100 + i).join(',')}`;
    const ny = `394913,1,"New York, NY",msa,NY,${Array.from({ length: 14 }, () => 200).join(',')}`;
    const rows = parseZillowHead(`${head}\n${us}\n${ny}\n394974,2,"Los Ang`);
    expect(months.length).toBe(14);
    expect(rows.map((r) => r.region)).toEqual(['United States', 'New York, NY']);
    expect(rows[0].last).toEqual({ date: '2026-09-30', val: 113 });
    expect(rows[0].yoyPct).toBeCloseTo((113 / 101 - 1) * 100);
  });
  it('mempool', () => {
    const m = parseMempool({ fastestFee: 3, hourFee: 1, minimumFee: 1 }, { difficultyChange: -7, remainingBlocks: 226, timeAvg: 645554, estimatedRetargetDate: 1 }, { hashrates: [{ avgHashrate: 9.8e20 }] }, 975518);
    expect(m).toMatchObject({ height: 975518, fees: { fast: 3, hour: 1, min: 1 }, diffChangePct: -7, blocksToRetarget: 226 });
    expect(m.hashrateEh).toBeCloseTo(980);
    expect(m.avgBlockMin).toBeCloseTo(10.76, 1);
  });
});

describe('Dataroma, short interest, Congress', () => {
  const xml = `<rss><channel><item><title><![CDATA[Davis Advisors]]></title><link>http://www.dataroma.com/m/holdings.php?m=DAV</link><pubDate>Tue, 10 Nov 2026 13:03:57 -0700</pubDate><description><![CDATA[<br/><b>Bought:</b> ZTS CRM<br/><b>Added to:</b> APP AMZN NVDA<br/><br/>]]></description></item><item><title><![CDATA[Guy Spier]]></title><link>x</link><pubDate>Tue, 10 Nov 2026 12:00:00 -0700</pubDate><description><![CDATA[<br/><br/>]]></description></item></channel></rss>`;
  it('superinvestor updates -> messages, your tickers first', () => {
    const ms = parseDataroma(xml);
    expect(ms[0]).toMatchObject({ manager: 'Davis Advisors', bought: ['ZTS', 'CRM'], added: ['APP', 'AMZN', 'NVDA'], url: 'https://www.dataroma.com/m/holdings.php?m=DAV' });
    const f = fundMessages(ms, new Set(['NVDA']));
    expect(f[0]).toMatchObject({ kind: 'fund', sym: 'NVDA', title: 'Davis Advisors filed its 13F (includes NVDA)' });
    expect(f[0].text).toContain('Added to: NVDA APP AMZN');
    expect(f[1].text).toContain('No buys or additions listed');
  });
  it('high short interest: latest settlement, % of shares out, bad share counts dropped', () => {
    const rows = [
      { symbolCode: 'AAA', currentShortPositionQuantity: 30e6, daysToCoverQuantity: 6, settlementDate: '2026-10-30', issueName: 'A' },
      { symbolCode: 'AAA', currentShortPositionQuantity: 10e6, daysToCoverQuantity: 2, settlementDate: '2026-10-15' },
      { symbolCode: 'BBB', currentShortPositionQuantity: 1e6, daysToCoverQuantity: 1, settlementDate: '2026-10-30' },
      { symbolCode: 'CCC', currentShortPositionQuantity: 5e6, daysToCoverQuantity: 9, settlementDate: '2026-10-30' }, // no share count: kept on days to cover
      { symbolCode: 'DDD', currentShortPositionQuantity: 50e6, daysToCoverQuantity: 9, settlementDate: '2026-10-30' }, // over 100%: stale share count
    ];
    const out = highShortInterest(rows, new Map([['AAA', 100e6], ['BBB', 100e6], ['DDD', 10e6]]));
    expect(out.map((r) => r.sym)).toEqual(['AAA', 'CCC']);
    expect(out[0].pctOut).toBeCloseTo(30);
  });
  it('days past the 45-day disclosure deadline', () => {
    expect(daysLate('2026-08-01', '2026-09-10')).toBe(0);
    expect(daysLate('2026-08-01', '2026-10-01')).toBe(16);
    expect(daysLate('', '2026-10-01')).toBe(0);
  });
});
