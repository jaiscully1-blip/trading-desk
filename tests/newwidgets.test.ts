import { describe, expect, it } from 'vitest';
import { modelRs, monteCarlo } from '../shared/montecarlo';
import { fearGreed } from '../shared/feargreed';
import { form4List, insiderSummary, parseForm4 } from '../shared/insider';
import { parsePolymarketEvents } from '../shared/polymarket';
import { premarketFromAlpha } from '../shared/parse';

describe('monte carlo', () => {
  it('a losing edge loses, a winning edge wins, and it is repeatable', () => {
    const good = monteCarlo({ rs: modelRs(0.5, 2, 1), riskPct: 1, trades: 100, runs: 2000 })!;
    const bad = monteCarlo({ rs: modelRs(0.3, 1, 1), riskPct: 1, trades: 100, runs: 2000 })!;
    expect(good.expectancyR).toBeCloseTo(0.5);
    expect(good.pUp).toBeGreaterThan(0.9);
    expect(bad.pUp).toBeLessThan(0.1);
    expect(monteCarlo({ rs: [1, -1, 2], riskPct: 1, trades: 20, runs: 500 })).toEqual(monteCarlo({ rs: [1, -1, 2], riskPct: 1, trades: 20, runs: 500 }));
    expect(good.bands[0]).toMatchObject({ i: 0, p50: 0 });
  });
});

describe('desk fear & greed', () => {
  it('scores calm uptrends as greed and spikes as fear', () => {
    const calm = fearGreed({ vix: [...Array(49).fill(20), 14], spx: [...Array(124).fill(100), 108], hy: [...Array(100).fill(4), 3], putCall: 0.6, date: 'd' })!;
    const panic = fearGreed({ vix: [...Array(49).fill(15), 30], spx: [...Array(124).fill(100), 90], hy: [...Array(100).fill(3), 6], putCall: 1.3, date: 'd' })!;
    expect(calm.score).toBeGreaterThan(75);
    expect(panic.score).toBeLessThan(10);
    expect(panic.label).toBe('Extreme fear');
    expect(fearGreed({ vix: [1], date: 'd' })).toBeNull();
  });
});

describe('form 4', () => {
  it('reads owner, role and open-market buys and sells', () => {
    const xml = `<ownershipDocument><reportingOwner><reportingOwnerId><rptOwnerName>Huang Jen Hsun</rptOwnerName></reportingOwnerId><reportingOwnerRelationship><isDirector>1</isDirector><isOfficer>1</isOfficer><officerTitle>President and CEO</officerTitle></reportingOwnerRelationship></reportingOwner>
<nonDerivativeTable><nonDerivativeTransaction><transactionDate><value>2026-10-20</value></transactionDate><transactionCoding><transactionCode>S</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>1000</value></transactionShares><transactionPricePerShare><value>150.5</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode></transactionAmounts><postTransactionAmounts><sharesOwnedFollowingTransaction><value>5000</value></sharesOwnedFollowingTransaction></postTransactionAmounts></nonDerivativeTransaction></nonDerivativeTable></ownershipDocument>`;
    const t = parseForm4(xml, '2026-10-22', 'u');
    expect(t[0]).toMatchObject({ who: 'Huang Jen Hsun', role: 'Director, President and CEO', code: 'S', kind: 'Sell', shares: 1000, price: 150.5, value: 150500, after: 5000, date: '2026-10-20' });
    expect(insiderSummary(t, '2026-10-01')).toMatchObject({ sells: 1, sellValue: 150500, buys: 0 });
    const list = form4List({ filings: { recent: { form: ['4', '10-K'], accessionNumber: ['0001-26-000001', 'x'], primaryDocument: ['xslF345X05/wk-form4.xml', 'a.htm'], filingDate: ['2026-10-22', 'x'] } } }, 1045810);
    expect(list[0].url).toBe('https://www.sec.gov/Archives/edgar/data/1045810/000126000001/wk-form4.xml');
  });
});

describe('polymarket + premarket', () => {
  it('parses string-encoded outcomes and prices', () => {
    const ev = parsePolymarketEvents([{ title: 'Fed decision in December?', slug: 'fed-dec', volume24hr: 1000, endDate: '2026-12-10T00:00:00Z', markets: [{ question: 'Cut 25bp?', groupItemTitle: '25 bp cut', outcomes: '["Yes","No"]', outcomePrices: '["0.77","0.23"]', volume24hr: 900 }] }]);
    expect(ev[0]).toMatchObject({ url: 'https://polymarket.com/event/fed-dec', ends: '2026-12-10' });
    expect(ev[0].markets[0]).toMatchObject({ q: '25 bp cut', outcomes: [{ name: 'Yes', p: 0.77 }, { name: 'No', p: 0.23 }] });
  });
  it('takes only 04:00-09:30 bars of the day', () => {
    const j = { 'Time Series (5min)': { '2026-11-06 03:55:00': { '2. high': '999', '3. low': '1' }, '2026-11-06 04:00:00': { '2. high': '101', '3. low': '99' }, '2026-11-06 09:25:00': { '2. high': '103', '3. low': '100' }, '2026-11-06 09:30:00': { '2. high': '200', '3. low': '50' } } };
    expect(premarketFromAlpha(j, '2026-11-06')).toMatchObject({ high: 103, low: 99, bars: 2 });
  });
});
