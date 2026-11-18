import { describe, expect, it } from 'vitest';
import { FUNDS, JETS, LOTS, REG_SOURCES, RULE_PICKS, SETUP_TAGS, JOURNAL_TAGS } from '../shared/suggest';

describe('suggested inputs', () => {
  it('jets are unique 6-character hex codes with a label', () => {
    for (const j of JETS) { expect(j.icao).toMatch(/^[0-9a-f]{6}$/); expect(j.label.length).toBeGreaterThan(3); }
    expect(new Set(JETS.map((j) => j.icao)).size).toBe(JETS.length);
  });
  it('lots have real coordinates and fund CIKs are digits', () => {
    for (const l of LOTS) { expect(Math.abs(l.lat)).toBeLessThan(80); expect(Math.abs(l.lon)).toBeLessThanOrEqual(180); expect(l.size).toBeGreaterThan(100); }
    for (const f of FUNDS) expect(f.cik).toMatch(/^\d{4,10}$/);
    expect(new Set(FUNDS.map((f) => f.cik)).size).toBe(FUNDS.length);
  });
  it('links are web links and picks are unique', () => {
    for (const s of REG_SOURCES) expect(s.url).toMatch(/^https?:\/\//);
    for (const xs of [RULE_PICKS, SETUP_TAGS, JOURNAL_TAGS]) expect(new Set(xs).size).toBe(xs.length);
  });
});
