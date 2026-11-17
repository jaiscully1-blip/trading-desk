import { describe, expect, it } from 'vitest';
import { issuerOf, parseForm4 } from '../shared/insider';
import { byTicker, clusterBuys, mergeRows, toRow, topBuys, weekly, type Row } from '../shared/insiderMarket';

const xml = (code: string, who: string, title: string, px: number, shares: number, plan = '') => `<ownershipDocument>${plan}<issuer><issuerCik>0000123456</issuerCik><issuerName>Acme &amp; Co</issuerName><issuerTradingSymbol>acme</issuerTradingSymbol></issuer>
<reportingOwner><reportingOwnerId><rptOwnerName>${who}</rptOwnerName></reportingOwnerId><reportingOwnerRelationship><isOfficer>1</isOfficer><officerTitle>${title}</officerTitle></reportingOwnerRelationship></reportingOwner>
<nonDerivativeTable><nonDerivativeTransaction><transactionDate><value>2026-11-10</value></transactionDate><transactionCoding><transactionCode>${code}</transactionCode></transactionCoding>
<transactionAmounts><transactionShares><value>${shares}</value></transactionShares><transactionPricePerShare><value>${px}</value></transactionPricePerShare></transactionAmounts></nonDerivativeTransaction></nonDerivativeTable></ownershipDocument>`;

describe('insider market', () => {
  const mk = (code: string, who: string, title: string, px: number, shares: number, plan = '') => { const x = xml(code, who, title, px, shares, plan); const i = issuerOf(x); return parseForm4(x, '2026-11-12', 'u').map((t) => toRow(t, i)).filter(Boolean) as Row[]; };
  it('reads the issuer and keeps open-market buys and big sales only', () => {
    expect(issuerOf(xml('P', 'A', 'CEO', 10, 100))).toMatchObject({ cik: '123456', name: 'Acme & Co', sym: 'ACME', plan: false });
    expect(mk('P', 'Ann', 'CEO', 10, 1000)[0]).toMatchObject({ sym: 'ACME', code: 'P', val: 10000 });
    expect(mk('S', 'Bob', 'CFO', 10, 100)).toHaveLength(0); // $1,000 sale: dropped
    expect(mk('S', 'Bob', 'CFO', 100, 5000)).toHaveLength(1);
    expect(mk('A', 'Cy', 'CFO', 100, 5000)).toHaveLength(0); // award, not open market
    expect(mk('S', 'Dee', 'CFO', 100, 5000, '<aff10b5One>1</aff10b5One>')[0].plan).toBe(true);
  });
  it('finds cluster buys, ranks buys and merges without duplicates', () => {
    const rows = [...mk('P', 'Ann', 'CEO', 10, 1000), ...mk('P', 'Ben', 'Director', 10, 2000), ...mk('P', 'Cat', 'Director', 10, 3000), ...mk('S', 'Dan', 'CFO', 100, 5000)];
    const t = byTicker(rows, '2026-11-15');
    expect(t[0]).toMatchObject({ buyers: 3, buyVal: 60000, sellers: 1, topBuy: true });
    expect(clusterBuys(t)).toHaveLength(1);
    expect(topBuys(rows, '2026-11-15')[0].who).toBe('Cat');
    expect(mergeRows(rows, rows, '2026-11-15')).toHaveLength(rows.length);
    expect(mergeRows(rows, [], '2027-06-01')).toHaveLength(0); // older than 45 days
    expect(weekly(rows, '2026-11-15', 2).reduce((a, w) => a + w.buy, 0)).toBe(60000);
  });
});
