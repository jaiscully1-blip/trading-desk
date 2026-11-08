import { describe, expect, it } from 'vitest';
import { parsePmScan, ruleSummary, setupFor, type PmRow } from '../shared/morning';
import type { QuantRead } from '../shared/quant';

const row = (o: Partial<PmRow>): PmRow => ({ sym: 'NVDA', name: 'NVIDIA', close: 100, chg: 1, pmChg: 4, pmPx: 104, pmVol: 2e6, mc: 1e12, sector: 'Tech', avgVol: 2e7, ...o });
const q = (score: number) => ({ verdict: { label: score > 0 ? 'Bullish' : 'Bearish', score, reasons: [{ factor: 'Trend', pts: Math.sign(score), text: 'trend text' }] }, regime: { label: 'Trending', text: '' } }) as unknown as QuantRead;

describe('morning setups', () => {
  it('parses the screener columns in order', () => {
    const r = parsePmScan({ data: [{ s: 'NASDAQ:NVDA', d: ['NVDA', 'NVIDIA Corp', 100, 1.2, 3.4, 103.4, 1500000, 3e12, 'Electronic Technology', 2e8] }, { s: 'X:BAD', d: ['BAD', 'x', null] }] });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ sym: 'NVDA', close: 100, chg: 1.2, pmChg: 3.4, pmPx: 103.4, pmVol: 1500000, avgVol: 2e8 });
  });
  it('gap up into an uptrend = buy bias; gap down into a downtrend = sell bias; against the trend = wait', () => {
    expect(setupFor(row({}), q(3)).bias).toBe('Buy bias');
    expect(setupFor(row({ pmChg: -5, pmPx: 95 }), q(-3)).bias).toBe('Sell bias');
    expect(setupFor(row({}), q(-3)).bias).toBe('Wait');
    expect(setupFor(row({ pmChg: 0.5 }), q(3)).bias).toBe('Wait');
  });
  it('flags extended gaps and falls back to the day move without premarket volume', () => {
    expect(setupFor(row({ pmChg: 12 }), q(3)).reasons.some((r) => r.startsWith('Extended'))).toBe(true);
    const s = setupFor(row({ pmChg: null, pmVol: null, chg: -3 }), null);
    expect(s.moveKind).toBe('day');
    expect(s.move).toBe(-3);
  });
  it('rule summary names indexes, sectors and setups', () => {
    const t = ruleSummary([row({ sym: 'SPY', pmChg: 0.3 }), row({ sym: 'QQQ', pmChg: 0.5 })], ['XLK', 'XLE', 'XLF', 'XLU'].map((s, i) => row({ sym: s, pmChg: 1 - i })), [setupFor(row({}), q(3))], 'premarket');
    expect(t).toContain('SPY +0.30%');
    expect(t).toContain('Leading: XLK');
    expect(t).toContain('Buy-bias watch: NVDA');
  });
});
