import { describe, expect, it } from 'vitest';
import { currencyStrength, fxFromFrankfurter, indexMovers, parseHalts, parseNdxList, parseSparkPx } from '../shared/worldmkt';
import { etToUtc } from '../shared/clock';

describe('world markets', () => {
  it('spark quotes (both Yahoo shapes)', () => {
    const v7 = { spark: { result: [{ symbol: '^N225', response: [{ meta: { regularMarketPrice: 105, chartPreviousClose: 100 }, timestamp: [1, 2], indicators: { quote: [{ close: [101, null, 105] }] } }] }] } };
    expect(parseSparkPx(v7)['^N225']).toMatchObject({ last: 105, prev: 100, spark: [101, 105], at: 2000 });
    expect(parseSparkPx(v7)['^N225'].chgPct).toBeCloseTo(5);
    const v8 = { 'EURUSD=X': { symbol: 'EURUSD=X', chartPreviousClose: 1.1, close: [1.1, 1.111], timestamp: [5] } };
    expect(parseSparkPx(v8)['EURUSD=X'].chgPct).toBeCloseTo(1);
  });
  it('ECB fallback: pairs from per-USD rates', () => {
    const fx = fxFromFrankfurter({ date: '2026-11-11', rates: { EUR: 0.9, JPY: 150, GBP: 0.75 } }, { date: '2026-11-10', rates: { EUR: 0.91, JPY: 150, GBP: 0.75 } });
    expect(fx['EURUSD=X'].last).toBeCloseTo(1 / 0.9);
    expect(fx['USDJPY=X'].last).toBe(150);
    expect(fx['EURJPY=X'].last).toBeCloseTo(150 / 0.9);
    expect(fx['EURUSD=X'].chgPct).toBeGreaterThan(0); // fewer EUR per USD = stronger euro
  });
  it('currency strength', () => {
    const s = currencyStrength({ 'EURUSD=X': { sym: 'EURUSD=X', last: 1, prev: 1, chgPct: 1, spark: [], at: null }, 'USDJPY=X': { sym: 'USDJPY=X', last: 1, prev: 1, chgPct: -2, spark: [], at: null } });
    expect(s[0]).toMatchObject({ ccy: 'JPY', score: 2 });
    expect(s.find((x) => x.ccy === 'USD')!.score).toBeCloseTo(-1.5);
  });
  it('halts feed', () => {
    const xml = `<rss><item><ndaq:HaltDate>11/11/2026</ndaq:HaltDate><ndaq:HaltTime>19:50:00.000</ndaq:HaltTime><ndaq:IssueSymbol>ARAI</ndaq:IssueSymbol><ndaq:IssueName>Arrive AI Inc. CS</ndaq:IssueName><ndaq:Market>NASDAQ</ndaq:Market><ndaq:ReasonCode>T1</ndaq:ReasonCode><ndaq:PauseThresholdPrice /><ndaq:ResumptionDate /><ndaq:ResumptionTradeTime /></item>
      <item><ndaq:HaltDate>11/11/2026</ndaq:HaltDate><ndaq:HaltTime>10:05:12</ndaq:HaltTime><ndaq:IssueSymbol>XYZ</ndaq:IssueSymbol><ndaq:ReasonCode>LUDP</ndaq:ReasonCode><ndaq:PauseThresholdPrice>4.25</ndaq:PauseThresholdPrice><ndaq:ResumptionDate>11/11/2026</ndaq:ResumptionDate><ndaq:ResumptionTradeTime>10:10:12</ndaq:ResumptionTradeTime></item></rss>`;
    const h = parseHalts(xml, etToUtc);
    expect(h[0]).toMatchObject({ sym: 'ARAI', code: 'T1', reason: 'News pending', resumedAt: null, haltedAt: etToUtc(2026, 11, 11, 19, 50) });
    expect(h[1]).toMatchObject({ sym: 'XYZ', reason: 'Volatility pause (limit up / limit down)', pausePrice: 4.25, haltedAt: etToUtc(2026, 11, 11, 10, 5) + 12000, resumedAt: etToUtc(2026, 11, 11, 10, 10) + 12000 });
  });
  it('index movers: cap weights × change', () => {
    const m = indexMovers([{ sym: 'A', name: 'A' }, { sym: 'B', name: 'B' }, { sym: 'C', name: 'C' }, { sym: 'D', name: 'D' }], { A: { c: 2, mc: 300 }, B: { c: -1, mc: 100 }, C: { c: 0.5, mc: 100 }, D: { c: 5, mc: null } });
    expect(m.covered).toBe(3);
    expect(m.up.map((x) => x.sym)).toEqual(['A', 'C']);
    expect(m.up[0].contrib).toBeCloseTo(1.2);
    expect(m.down[0]).toMatchObject({ sym: 'B' });
    expect(m.total).toBeCloseTo(1.2 - 0.2 + 0.1);
    expect(parseNdxList({ data: { data: { rows: [{ symbol: 'NVDA', companyName: 'NVIDIA' }, { symbol: '', companyName: 'x' }] } } })).toEqual([{ sym: 'NVDA', name: 'NVIDIA' }]);
  });
});

describe('index movers: share classes', () => {
  it('two classes with the same company cap count once', () => {
    const m = indexMovers([{ sym: 'GOOGL', name: 'Alphabet Inc. (Class A)' }, { sym: 'GOOG', name: 'Alphabet Inc. (Class C)' }, { sym: 'X', name: 'X' }], { GOOGL: { c: 2, mc: 300 }, GOOG: { c: 2, mc: 300 }, X: { c: 1, mc: 100 } });
    expect(m.covered).toBe(2);
    expect(m.up[0]).toMatchObject({ sym: 'GOOGL', weight: 0.75 });
  });
});
