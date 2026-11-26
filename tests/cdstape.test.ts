// Real DTCC rows (2026-11-25): a name DTCC replaced with "¿¿¿", trades with a junk -115.76% coupon (gave -11,576bp
// spreads), a normal Oracle trade, and a placeholder name.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cdsTrades, impliedSpread, parseCsv } from '../shared/cds';

const ts = cdsTrades(parseCsv(readFileSync(new URL('./fixtures/dtcc-sample.csv', import.meta.url), 'utf8')));

describe('CDS tape: bad DTCC rows', () => {
  it('never shows a zero or negative spread', () => {
    expect(ts.every((t) => t.spreadBp == null || t.spreadBp > 0)).toBe(true);
    const junk = ts.filter((t) => t.couponBp === -11576);
    expect(junk.length).toBe(3); // the "¿¿¿" entity is one of the same basket's trades
    expect(junk.every((t) => t.spreadBp == null)).toBe(true);
  });
  it('names an entity DTCC blanked out by its reference code', () => {
    expect(ts.some((t) => /¿/.test(t.name))).toBe(false);
    expect(ts.some((t) => /^Name not given by DTCC \(ref .+\)$/.test(t.name))).toBe(true);
  });
  it('keeps a normal trade with a positive estimated spread, and drops placeholder names', () => {
    const o = ts.find((t) => t.name === 'ORACLE CORPORATION');
    expect(o?.spreadBp).toBeGreaterThan(0);
    expect(ts.some((t) => /REGISTEREDGOVT/i.test(t.name))).toBe(false);
  });
  it('refuses impossible coupons', () => {
    expect(impliedSpread(1.34, -11576, 5, 1)).toBeNull();
    expect(impliedSpread(1.34, 0, 5, 1)).toBeNull();
    expect(impliedSpread(1.34, 100, 5, 1)).toBeGreaterThan(100);
  });
});
