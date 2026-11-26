import { describe, expect, it } from 'vitest';
import { bankProtectionSignal, cdsIndexSignal, indexTradesByDay, marginSignal, readMove, riskNotes, spreadSignal, surgeSignal, tally } from '../shared/riskPanel';

describe('risk panel signals', () => {
  it('reads moves both ways against a threshold', () => {
    expect(readMove(0.39, 0.25)).toBe('stress');
    expect(readMove(-0.3, 0.25)).toBe('ease');
    expect(readMove(0.1, 0.25)).toBe('normal');
    expect(readMove(5, 3, true)).toBe('ease');
    expect(readMove(null, 1)).toBe('normal');
  });
  it('reads the high-yield spread from Credit page stats', () => {
    expect(spreadSignal('hy', 'High-yield spread', { last: 3.72, chg1m: 0.39, pctile: 95.5 })).toMatchObject({ value: '3.72 pp (96th pct.)', read: 'stress' });
  });
  it('reads a CDS index move over the tape days', () => {
    expect(cdsIndexSignal('CDX.NA.HY', 'CDX High Yield', 336.2, 374.2)).toMatchObject({ value: '374 bp', change: '+38 bp over the last 5 trading days', read: 'stress' });
    expect(cdsIndexSignal('CDX.NA.IG', 'CDX IG', 60, 58)?.read).toBe('normal');
  });
  it('spots a surge in index CDS trading vs the normal day', () => {
    const day = (d: string) => Date.parse(`${d}T15:00:00Z`);
    const tr = (d: string, name = 'CDX.NA.HY') => ({ id: '', t: day(d), name, ref: '', kind: 'index' as const, years: 5, maturity: '', couponBp: null, notional: null, capped: false, upfrontPct: null, spreadBp: null } as any);
    const trades = [...['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'].flatMap((d) => Array.from({ length: 100 }, () => tr(d))), ...Array.from({ length: 210 }, () => tr('2026-11-23')), tr('2026-11-23', 'ORACLE CORP')];
    const byDay = indexTradesByDay(trades, (ms) => new Date(ms).toISOString().slice(0, 10));
    expect(byDay.get('2026-11-23')).toBe(210);
    expect(surgeSignal(byDay, '2026-11-23')).toMatchObject({ read: 'stress', change: '2.1x the normal day (median of 5 days: 100)' });
  });
  it('reads bank protection bought and margin debt', () => {
    expect(bankProtectionSignal(4.2e12, 3.24e12, '2026-09-30')).toMatchObject({ value: '$4.20T (quarter ended 2026-09-30)', change: '+30% vs last quarter', read: 'stress' });
    expect(marginSignal([{ month: '2026-10', debit: 1448360 }, { month: '2026-09', debit: 1480054 }])).toMatchObject({ change: '-2.1% vs the month before', read: 'normal' });
  });
  it('tallies and writes notes only for signals that are not normal', () => {
    const s = [spreadSignal('hy', 'High-yield spread', { last: 3.72, chg1m: 0.39 })!, cdsIndexSignal('X', 'CDX IG', 60, 58)!];
    expect(tally(s)).toMatchObject({ stress: 1, normal: 1, line: '1 of 2 signals are stressing' });
    expect(riskNotes(s)).toEqual(['High-yield spread: stressing (+0.39 pp in a month).']);
  });
});

describe('index CDS count per daily file', () => {
  it('counts only the main index families', async () => {
    const { indexTradeCount } = await import('../shared/riskPanel');
    const t = (name: string, kind = 'index') => ({ name, kind } as any);
    expect(indexTradeCount([t('CDX.NA.HY'), t('CDX.NA.IG'), t('ITRAXX EUROPE CROSSOVER'), t('CDX.EM'), t('ORACLE CORP', 'single')])).toBe(3);
  });
});
