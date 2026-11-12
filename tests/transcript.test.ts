import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseTranscript, qaStart, quarterCandidates, transcriptSummary, usualCallTime } from '../shared/transcript';

// first 14 turns of Apple's fiscal Q3 2026 call (Alpha Vantage), each cut to 160 characters
const fx = JSON.parse(readFileSync(new URL('./fixtures/aapl-transcript.json', import.meta.url), 'utf8'));

describe('earnings call transcripts', () => {
  const t = parseTranscript(fx, 'AAPL', '2026Q3')!;
  it('turns, roles and Q&A start', () => {
    expect(t.turns.length).toBe(14);
    expect(t.turns[1]).toMatchObject({ speaker: 'Tim Cook', role: 'company', sentiment: 0.9 });
    expect(t.turns[5].role).toBe('operator');
    expect(t.turns[6]).toMatchObject({ speaker: 'Amit Daryanani', role: 'analyst' });
    expect(qaStart(t)).toBe(6);
  });
  it('summary', () => {
    const s = transcriptSummary(t);
    expect(s.prepared).toBeCloseTo((0.9 + 0.3 + 0.8) / 3); // the investor-relations host's 0.0 turns are left out
    expect(s.analysts[0]).toEqual({ name: 'Amit Daryanani', firm: 'Evercore' });
  });
  it('empty / errors give null; quarter candidates; call times', () => {
    expect(parseTranscript({ Information: 'rate limit' }, 'X', '2026Q3')).toBeNull();
    expect(quarterCandidates(Date.parse('2026-11-12T00:00:00Z'), 3)).toEqual(['2026Q4', '2026Q3', '2026Q2']);
    expect(quarterCandidates(Date.parse('2026-02-01T00:00:00Z'), 2)).toEqual(['2026Q1', '2025Q4']);
    expect(usualCallTime('amc')).toMatch(/PM/);
  });
});
