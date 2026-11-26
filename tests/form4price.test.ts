// Real NVIDIA Form 4 (filed 2026-11): sale prices are weighted averages with a footnote after the value
// (<value>146.0298</value><footnoteId id="F2"/>), which the old parser missed (every price came back empty).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseForm4 } from '../shared/insider';

describe('Form 4 prices with footnotes', () => {
  it('reads the price and value when a footnote follows the value', () => {
    const xml = readFileSync(new URL('./fixtures/form4-footnoted-price.xml', import.meta.url), 'utf8');
    const txs = parseForm4(xml, '2026-11-21', 'https://www.sec.gov/x');
    const sells = txs.filter((t) => t.code === 'S');
    expect(sells.length).toBeGreaterThan(0);
    expect(sells[0].price).toBeCloseTo(146.0298, 3);
    expect(sells.every((t) => t.price != null && t.value != null && t.value > 0)).toBe(true);
  });
  it('still reads a plain value without a footnote', () => {
    const xml = '<ownershipDocument><reportingOwner><reportingOwnerId><rptOwnerName>Doe Jane</rptOwnerName></reportingOwnerId><reportingOwnerRelationship><isOfficer>1</isOfficer><officerTitle>CFO</officerTitle></reportingOwnerRelationship></reportingOwner><nonDerivativeTable><nonDerivativeTransaction><transactionDate><value>2026-11-01</value></transactionDate><transactionCoding><transactionCode>P</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>100</value></transactionShares><transactionPricePerShare><value>10.5</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts><postTransactionAmounts><sharesOwnedFollowingTransaction><value>1100</value></sharesOwnedFollowingTransaction></postTransactionAmounts></nonDerivativeTransaction></nonDerivativeTable></ownershipDocument>';
    const [t] = parseForm4(xml, '2026-11-02', 'u');
    expect(t).toMatchObject({ code: 'P', shares: 100, price: 10.5, value: 1050 });
  });
});
