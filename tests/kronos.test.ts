import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { KRONOS_LABEL, MIN_SCORED_DAYS, parseKronos, scoreKronos, type KronosFile, type KronosForecast } from '../shared/kronos';
import { KronosView } from '../src/components/KronosW';

// Test-only numbers (hand-made so the expected scores can be checked by hand). Never shown on the desk.
const day = (i: number) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
const fc = (ticker: string, asOf: string, last: number, close5: number, lo: number, hi: number, move = 2): KronosForecast => ({
  ticker, asOf, lastClose: last, moveAbsPct: move, rangePct: ((hi - lo) / last) * 100,
  steps: [1, 2, 3, 4, 5].map((n) => ({ n, date: day(n), open: last, high: hi, low: lo, close: n === 5 ? close5 : last, closeLow: n === 5 ? lo : last, closeHigh: n === 5 ? hi : last })),
});
/** closes: bar i has date day(i) and close 100 + i unless overridden */
const bars = (n: number, over: Record<number, number> = {}): [string, number][] => Array.from({ length: n }, (_, i) => [day(i), over[i] ?? 100 + i]);
const file = (p: Partial<KronosFile> = {}): KronosFile => ({
  schema: 1, label: KRONOS_LABEL, model: { name: 'NeoQuasar/Kronos-mini', tokenizer: 't' }, generatedAt: '2026-02-10T21:50:00Z',
  horizon: 5, samples: 12, lookback: 250, source: 'Yahoo Finance daily bars', forecasts: [], history: [], closes: {}, ...p,
});

describe('kronos json shape', () => {
  it('accepts a good file and forces the MODEL FORECAST label', () => {
    const r = parseKronos({ ...file({ forecasts: [fc('SPY', day(10), 100, 103, 98, 106)] }), label: 'anything' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file.label).toBe('MODEL FORECAST, not data, not advice');
  });
  it('rejects broken files with a reason instead of guessing', () => {
    expect(parseKronos(null)).toEqual({ ok: false, error: 'not an object' });
    expect(parseKronos({ ...file(), schema: 2 })).toMatchObject({ ok: false });
    expect(parseKronos({ ...file(), generatedAt: 'x' })).toMatchObject({ ok: false, error: 'missing generatedAt' });
    expect(parseKronos({ ...file(), model: {} })).toMatchObject({ ok: false });
    const bad = fc('SPY', day(10), 100, 103, 98, 106);
    (bad.steps[0] as any).close = 'NaN';
    expect(parseKronos({ ...file(), forecasts: [bad] })).toEqual({ ok: false, error: 'bad forecasts' });
    expect(parseKronos({ ...file(), closes: { SPY: [['2026-01-01', 'x']] } })).toEqual({ ok: false, error: 'bad closes' });
  });
});

describe('kronos scorecard math', () => {
  it('scores one forecast by hand', () => {
    // asOf bar 10 (close 110). Day-5 bar is index 15: actual 115 (default 100+15). Forecast median 112, range 108..114.
    const s = scoreKronos(file({ forecasts: [fc('SPY', day(10), 110, 112, 108, 114, 3)], closes: { SPY: bars(30) } }));
    expect(s.forecasts).toBe(1);
    const r = s.rows[0];
    expect(r.actualClose).toBe(115);
    expect(r.hit).toBe(true);                         // both up
    expect(r.errPct).toBeCloseTo((3 / 115) * 100);    // |112-115| / 115
    expect(r.naiveErrPct).toBeCloseTo((5 / 115) * 100);
    expect(r.inRange).toBe(false);                    // 115 is above 114
    expect(r.actualMovePct).toBeCloseTo((5 / 110) * 100);
    expect(s.moveBias).toBeCloseTo(3 - (5 / 110) * 100);
    expect(s.beatsNaive).toBe(1);
    expect(s.coverage).toBe(0);
  });
  it('counts wrong direction, flat as a miss, and in-range', () => {
    const closes = { SPY: bars(40, { 15: 105 }), QQQ: bars(40, { 25: 110 }) };     // SPY day-5 of bar 10 = 105 (down from 110); QQQ bar 20 -> bar 25 = 110 (flat vs 120)
    const s = scoreKronos(file({
      closes: { SPY: closes.SPY, QQQ: bars(40, { 25: 120 }) },
      forecasts: [fc('SPY', day(10), 110, 112, 100, 113), fc('QQQ', day(20), 120, 121, 115, 125)],
    }));
    const spy = s.rows.find((r) => r.ticker === 'SPY')!, qqq = s.rows.find((r) => r.ticker === 'QQQ')!;
    expect(spy.hit).toBe(false);                      // model said up, it fell
    expect(spy.inRange).toBe(true);                   // 105 inside 100..113
    expect(qqq.actualClose).toBe(120);
    expect(qqq.hit).toBe(false);                      // flat actual is not a hit
    expect(s.hitRate).toBe(0);
    expect(s.days).toBe(2);
  });
  it('skips forecasts whose outcome is not in yet, or whose day is missing', () => {
    const s = scoreKronos(file({ forecasts: [fc('SPY', day(10), 110, 112, 108, 114), fc('SPY', day(13), 113, 115, 110, 118), fc('QQQ', day(10), 1, 1, 1, 1)], closes: { SPY: bars(17) } }));
    expect(s.forecasts).toBe(1);                      // bar 15 exists (index 16 is last) so only asOf bar 10 resolves; bar 13 needs index 18
    expect(s.hitRate).toBe(1);
    expect(scoreKronos(file()).hitRate).toBeNull();
  });
  it('says too early under 20 days and judges from 20', () => {
    const mk = (days: number) => {
      const hist = Array.from({ length: days }, (_, i) => fc('SPY', day(i), 100 + i, 101 + i + 5, 90, 200));
      return scoreKronos(file({ history: hist, closes: { SPY: bars(days + 6) } }));
    };
    expect(MIN_SCORED_DAYS).toBe(20);
    expect(mk(19)).toMatchObject({ days: 19, enough: false });
    expect(mk(20)).toMatchObject({ days: 20, enough: true });
  });
  it('does not double count a forecast that sits in both history and forecasts', () => {
    const f = fc('SPY', day(10), 110, 112, 108, 114);
    expect(scoreKronos(file({ history: [f], forecasts: [f], closes: { SPY: bars(30) } })).forecasts).toBe(1);
  });
});

describe('Kronos widget', () => {
  const sample = file({
    forecasts: [fc('SPY', day(10), 110, 112.4, 106, 117, 2.1), fc('QQQ', day(10), 500, 505, 480, 520, 3)],
    closes: { SPY: bars(30), QQQ: bars(30) }, errors: { NVDA: 'only 12 daily bars' },
  });
  it('renders the label, model, range, movement size and "too early to judge" from a sample file', () => {
    const html = renderToStaticMarkup(createElement(KronosView, { file: sample }));
    expect(html).toContain('MODEL FORECAST, NOT DATA, NOT ADVICE');
    expect(html).toContain('NeoQuasar/Kronos-mini');
    expect(html).toContain('SPY');
    expect(html).toContain('±2.1%');
    expect(html).toContain('106.0–117.0');
    expect(html).toContain('too early to judge');
    expect(html).toContain('NVDA');                   // failed tickers are named, never filled in
    expect(html).not.toMatch(/bullish|bearish|buy|sell/i);
  });
  it('shows the scorecard numbers once there are enough scored days', () => {
    const hist = Array.from({ length: 22 }, (_, i) => fc('SPY', day(i), 100 + i, 101 + i + 5, 90, 200));
    const html = renderToStaticMarkup(createElement(KronosView, { file: { ...sample, history: hist, closes: { SPY: bars(40) } } }));
    expect(html).toContain('Scorecard</b> over 22 forecast days');
    expect(html).not.toContain('too early');
  });
});
