import { describe, expect, it } from 'vitest';
import { mostTraded, topTraded } from '../src/lib/mostTraded';
import type { Trade } from '../src/lib/journal';

const day = 86400_000, now = Date.parse('2026-11-19T15:00:00Z');
const tr = (sym: string, ago: number, extra: Partial<Trade> = {}): Trade => ({
  id: `${sym}${ago}${Math.random()}`, created: now - ago * day, updated: now, sym, side: 'long', initialStop: null, stop: null, stopHistory: [], target: null,
  plannedSize: null, thesis: '', setup: '', emotion: null, grade: null, checklist: [], fills: [{ id: 'f', t: now - ago * day, action: 'buy', qty: 1, price: 1, src: 'csv' }], ...extra,
});

describe('most traded tickers for the watchlist', () => {
  it('counts trades per ticker, options under their underlying, newest wins ties', () => {
    const m = mostTraded([tr('NVDA', 1), tr('NVDA', 3), tr('NVDA 250117C150', 2, { opt: { root: 'NVDA', type: 'call', strike: 150, expiry: '2027-01-15' } }), tr('TSLA', 5), tr('AMD', 2), tr('AAPL', 1, { deleted: true }), tr('META', 1, { demo: true })], 90, now);
    expect(m.NVDA.n).toBe(3);
    expect(m.AAPL).toBeUndefined(); expect(m.META).toBeUndefined();
    expect(topTraded(m)).toEqual(['NVDA', 'AMD', 'TSLA']);
  });
  it('falls back to all time when nothing is recent', () => {
    expect(mostTraded([tr('SOFI', 400)], 90, now).SOFI.n).toBe(1);
  });
});
