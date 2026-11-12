import { describe, expect, it } from 'vitest';
import { impliedSpy, linkStats, overnightLine, tagWorldNews } from '../shared/global';

const D = 86400;
describe('Global → US', () => {
  // an index whose daily move SPY follows at half size (open gap for Asia, whole day for Europe)
  const days = 120;
  const idx = [{ time: 20000 * D, open: 100, close: 100 }], spy = [{ time: 20000 * D, open: 500, close: 500 }];
  for (let i = 1; i < days; i++) {
    const r = Math.sin(i * 1.7) * 2; // ±2%
    const prevI = idx[i - 1].close, prevS = spy[i - 1].close;
    idx.push({ time: (20000 + i) * D, open: prevI, close: prevI * (1 + r / 100) });
    const s = prevS * (1 + r / 200);
    spy.push({ time: (20000 + i) * D, open: s, close: s }); // gap = day move
  }
  it('links an index to SPY: correlation, beta, same-way share on big days', () => {
    const a = linkStats('^N225', idx, spy)!;
    expect(a.versus).toBe('SPY open gap');
    expect(a.beta).toBeCloseTo(0.5, 3);
    expect(a.corr).toBeCloseTo(1, 3);
    expect(a.sameWayPct).toBe(100);
    expect(linkStats('^GDAXI', idx, spy)!.versus).toBe('SPY day');
    expect(linkStats('^N225', idx.slice(0, 20), spy)).toBeNull();
    expect(impliedSpy(2, a)).toBeCloseTo(1, 3);
    expect(impliedSpy(2, { beta: 1, corr: 0.05 })).toBeNull();
  });
  it('world news: market stories only, regions and linked tickers, company names', () => {
    const t = Date.parse('2026-11-12T03:00:00Z');
    const out = tagWorldNews([
      { title: 'Bank of Japan holds rates as yen weakens', url: 'a', t, src: 'X' },
      { title: 'Bank of Japan holds rates as yen weakens', url: 'b', t: t - 1, src: 'Y' }, // duplicate
      { title: 'Storm cancels Lisbon tech summit', url: 'c', t, src: 'X' }, // not about markets
      { title: 'Palm oil prices climb on El Niño', url: 'd', t, src: 'X' },
      { title: 'Nvidia shares slide in Asia trading', url: 'e', t, src: 'X' },
    ], 10, (title) => (/nvidia/i.test(title) ? ['NVDA'] : []));
    expect(out.map((x) => x.url)).toEqual(['a', 'd', 'e']);
    expect(out[0]).toMatchObject({ regions: ['japan'], syms: ['EWJ', 'TM'] });
    expect(out[1].regions).toEqual(['mideast']); // "oil prices" counts as oil news
    expect(out[2].syms).toEqual(['NVDA']);
  });
  it('overnight sentence', () => {
    expect(overnightLine({ '^N225': -0.3, '^HSI': -1.9, '^KS11': -0.6, '^GDAXI': 1.2, '^FTSE': 0.8 }, -0.35)).toBe('Asia lower (Nikkei -0.3%, Hang Seng -1.9%, KOSPI -0.6%); Europe higher (DAX +1.2%, FTSE +0.8%); S&P 500 futures -0.35%.');
    expect(overnightLine({}, null)).toBe('');
  });
});
