import { describe, expect, it } from 'vitest';
import { consensus, fundamentalClaims, newsClaims, technicalClaims } from '../shared/claims';
import { bestBet, historicalOdds, wilsonLow } from '../shared/edge';
import { sentimentWords } from '../shared/news';
import { barsFrom, ramp } from './helpers';

describe('claims', () => {
  it('technical claims cite numbers', () => {
    const c = technicalClaims(barsFrom(ramp(50, 100, 120)));
    expect(c.find((x) => x.text === 'Price is above its 50-day average')?.evidence).toMatch(/close 100.00 vs 50-day average/);
    expect(c.every((x) => x.cat === 'technical' && x.evidence)).toBe(true);
  });
  it('fundamental claims from metrics + analyst counts', () => {
    const c = fundamentalClaims({ revenueGrowthTTMYoy: 42, netProfitMarginTTM: 55, 'totalDebt/totalEquityQuarterly': 0.2, peTTM: 70 },
      [{ period: '2026-11-01', strongBuy: 20, buy: 30, hold: 5, sell: 1, strongSell: 0 }, { period: '2026-10-01', strongBuy: 15, buy: 25, hold: 12, sell: 3, strongSell: 1 }]);
    expect(c.map((x) => [x.side, x.text])).toEqual([
      ['bull', 'Revenue growing 42% year over year'], ['bull', 'High profit margin (55%)'], ['bull', 'Light debt (debt/equity 0.20)'],
      ['bear', 'Expensive: P/E 70'], ['bull', '89% of 56 analysts rate it Buy'], ['bull', 'Analysts turned more bullish this month'],
    ]);
  });
  it('news claims only from words in the headline', () => {
    expect(sentimentWords('Nvidia beats estimates and raises guidance').bull).toEqual(['beats', 'raises']);
    const c = newsClaims([{ title: 'Nvidia beats estimates', src: 'Reuters', t: 1 }, { title: 'Nvidia to hold annual meeting', src: 'PR', t: 2 }, { title: 'Probe into chipmaker widens', src: 'WSJ', t: 3 }]);
    expect(c.map((x) => [x.side, x.source, x.evidence])).toEqual([['bull', 'Reuters', 'words: beats'], ['bear', 'WSJ', 'words: probe']]);
  });
  it('consensus: each category votes once', () => {
    const mk = (cat: any, side: any) => ({ cat, side, text: '', evidence: '', source: '' });
    expect(consensus([mk('technical', 'bull'), mk('technical', 'bull'), mk('news', 'bull'), mk('fundamental', 'bear')]).overall).toBe('mixed');
    expect(consensus([mk('technical', 'bull'), mk('news', 'bull')]).overall).toBe('bullish');
    expect(consensus([]).overall).toBe('no data');
  });
});

describe('poker math', () => {
  it('Wilson lower bound is below the raw rate and tightens with more hands', () => {
    expect(wilsonLow(6, 10)).toBeLessThan(60);
    expect(wilsonLow(60, 100)).toBeGreaterThan(wilsonLow(6, 10));
  });
  it('a steady uptrend gives long bets positive EV and the right pot odds', () => {
    const closes = Array.from({ length: 260 }, (_, i) => 50 + i * 0.3 + Math.sin(i / 3) * 1.2);
    const o = historicalOdds(barsFrom(closes, { range: 0.01 }), 'long', 2)!;
    expect(o.requiredPct).toBeCloseTo(33.33, 1);
    expect(o.n).toBeGreaterThan(25);
    expect(o.evR).toBeGreaterThan(0);
    expect(['raise', 'call']).toContain(o.call);
    expect(o.target).toBeGreaterThan(o.entry);
    expect(bestBet(barsFrom(closes, { range: 0.01 }))!.side).toBe('long');
  });
  it('needs history', () => {
    expect(historicalOdds(barsFrom(ramp(1, 2, 40)), 'long')).toBeNull();
  });
});
