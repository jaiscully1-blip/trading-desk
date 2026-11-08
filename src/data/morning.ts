import { useEffect, useState } from 'react';
import type { Freshness } from '../types';
import type { DataMode } from './live';
import { INDEX_ETFS, SECTOR_ETFS, setupFor, type PmRow, type Setup } from '../../shared/morning';
import { DEMO_AT, rng } from '../lib/demo';

export interface MorningState {
  phase: 'premarket' | 'day'; indexes: (PmRow & { label: string })[]; sectors: (PmRow & { label: string })[];
  gainers: PmRow[]; losers: PmRow[]; watch: PmRow[]; setups: Setup[]; summary: string; summarySrc: 'gemini' | 'rules';
  errors: Record<string, string>; asOf: number; source: string; freshness: Freshness;
}

function demoMorning(): MorningState {
  const r = rng(77);
  const row = (sym: string, name: string, base: number, mv: number): PmRow => ({ sym, name, close: base, chg: +(mv * 0.6).toFixed(2), pmChg: mv, pmPx: +(base * (1 + mv / 100)).toFixed(2), pmVol: Math.round(2e5 + r() * 3e6), mc: 5e10, sector: 'Sample', avgVol: 2e7 });
  const indexes = INDEX_ETFS.map(([s, label]) => ({ ...row(s, label, 400 + r() * 200, +((r() - 0.45) * 1.2).toFixed(2)), label }));
  const sectors = SECTOR_ETFS.map(([s, label]) => ({ ...row(s, label, 50 + r() * 150, +((r() - 0.5) * 2.4).toFixed(2)), label }));
  const movers = ['NVDA', 'AMD', 'PLTR', 'TSLA', 'COIN', 'SOFI', 'RKLB', 'SMCI', 'CELH', 'HOOD'].map((s) => row(s, `${s} (sample)`, 20 + r() * 300, +((r() - 0.5) * 16).toFixed(2)));
  const gainers = movers.filter((m) => m.pmChg! > 0).sort((a, b) => b.pmChg! - a.pmChg!);
  const losers = movers.filter((m) => m.pmChg! < 0).sort((a, b) => a.pmChg! - b.pmChg!);
  const setups = movers.slice(0, 6).map((m) => setupFor(m, null)).sort((a, b) => b.score - a.score);
  return { phase: 'premarket', indexes, sectors, gainers, losers, watch: movers.slice(0, 4), setups, summary: 'Sample briefing: this is demo data so you can see the layout. Live mode fills it from the premarket screener.', summarySrc: 'rules', errors: {}, asOf: DEMO_AT, source: 'Generated sample data', freshness: 'demo' };
}

/** Fetches only while the Morning page is open; refreshes every 5 minutes (the server caches the screener 10 minutes). */
export function useMorning(mode: DataMode, open: boolean, symbols: string[]): MorningState | null {
  const [st, setSt] = useState<MorningState | null>(null);
  const key = symbols.slice(0, 40).join(',');
  useEffect(() => {
    if (!open || mode.kind === 'checking') return;
    if (mode.kind === 'demo') { setSt(demoMorning()); return; }
    let stop = false;
    const go = () => fetch(`/api/research?fn=morning&symbols=${encodeURIComponent(key)}`).then(async (r) => {
      const j = await r.json();
      if (!stop && r.ok) setSt({ ...j, freshness: j.setups?.length || j.indexes?.length ? 'delayed' : 'nodata' });
    }).catch(() => {});
    go();
    const id = setInterval(go, 5 * 60_000);
    return () => { stop = true; clearInterval(id); };
  }, [mode.kind, open, key]);
  return st;
}
