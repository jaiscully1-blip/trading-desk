import { useEffect, useMemo, useState } from 'react';
import type { Freshness } from '../types';
import type { DataMode } from './live';
import { computeBase, type ScanBase } from '../../shared/scan';
import { encodeInstant, type Mover } from '../../shared/parse';
import { clock, etToUtc, lastSessionDates } from '../lib/clock';
import { load as loadLocal, save as saveLocal } from '../lib/store';
import { scanNeeds } from '../../shared/scanCache';
import { DEMO_AT, makeCandles, rng } from '../lib/demo';

export interface ScanState {
  bases: Record<string, ScanBase>;
  pending: string[];
  errors: Record<string, string>;
  asOf: number;
  freshness: Freshness;
  source: string;
  siSource: string | null;
  catalystSource: string | null;
  loading: boolean;
}

const EMPTY: ScanState = { bases: {}, pending: [], errors: {}, asOf: 0, freshness: 'pending', source: '', siSource: null, catalystSource: null, loading: true };

/** Demo: the real scan engine on generated candles; short interest and catalysts are generated too (badged DEMO). */
function demoScan(universe: string[], demoLast: (s: string) => number): ScanState {
  const nowEnc = encodeInstant(Date.now());
  const bases: Record<string, ScanBase> = {};
  for (const s of new Set(['SPY', ...universe])) {
    const b = computeBase(s, makeCandles(s, 'D', demoLast(s)), nowEnc, DEMO_AT, 'Generated sample candles');
    if (s !== 'SPY' && s !== 'QQQ') {
      const r = rng(s.length * 7919 + s.charCodeAt(0));
      b.si = { shares: Math.round(r() * 4e7), daysToCover: +(r() * 9).toFixed(1), changePct: +((r() - 0.5) * 30).toFixed(1), settlementDate: '—', pctOut: +(r() * 30).toFixed(1) };
      const n = r() < 0.4 ? 1 + Math.floor(r() * 3) : 0;
      b.catalyst = { count: n, latest: n ? `${s}: sample headline (demo)` : undefined };
    }
    bases[s] = b;
  }
  return { bases, pending: [], errors: {}, asOf: DEMO_AT, freshness: 'demo', source: 'Generated sample candles', siSource: 'Demo', catalystSource: 'Demo', loading: false };
}

const CACHE = 'scanCache';
interface ScanCache { at: number; bases: Record<string, ScanBase> }
const lastCloseMs = () => { const d = lastSessionDates(1)[0]; return etToUtc(d.y, d.mo, d.d, 16, 0); };

export function useScan(universe: string[], mode: DataMode, demoLast: (s: string) => number): ScanState {
  const key = universe.join(',');
  const [st, setSt] = useState<ScanState>(EMPTY);

  useEffect(() => {
    if (mode.kind === 'checking') return;
    if (mode.kind === 'demo') { setSt(demoScan(universe, demoLast)); return; }
    if (!key) { setSt({ ...EMPTY, loading: false, freshness: 'nodata' }); return; }
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    // the last results live in this browser: the table is never empty on arrival, and a closed market costs no credits
    const saved = loadLocal<ScanCache | null>(CACHE, null);
    const acc: Record<string, ScanBase> = { ...(saved?.bases ?? {}) };
    let savedAt = saved?.at ?? null; // moves to now once a full pass completes, so a closed market is not refetched every hour
    const inUniverse = Object.keys(acc).filter((s) => universe.includes(s));
    if (inUniverse.length) setSt({ ...EMPTY, bases: Object.fromEntries(inUniverse.map((s) => [s, acc[s]])), asOf: saved!.at, freshness: 'eod', source: 'Saved copy from your last visit, refreshing', loading: true });
    const tick = async () => {
      let next = 10 * 60_000;
      const want = scanNeeds({ universe, have: Object.keys(acc), savedAt, now: Date.now(), closed: clock().session === 'Closed', lastCloseMs: lastCloseMs() });
      if (!want.length) {
        setSt((s) => ({ ...s, loading: false, pending: [], freshness: 'eod', source: 'Saved copy (market closed, nothing new)' }));
        if (!stop) t = setTimeout(tick, 60 * 60_000);
        return;
      }
      try {
        const r = await fetch(`/api/scan?symbols=${want.join(',')}`);
        const j = await r.json();
        if (stop) return;
        if (r.ok) {
          const bases: Record<string, ScanBase> = {};
          for (const b of j.rows as ScanBase[]) bases[b.sym] = b;
          Object.assign(acc, bases);
          if (Object.keys(acc).length) saveLocal(CACHE, { at: Date.now(), bases: acc } satisfies ScanCache);
          setSt((s) => ({
            bases: { ...s.bases, ...bases },
            pending: j.pending,
            errors: j.errors,
            asOf: j.asOf,
            freshness: 'live',
            source: 'Daily bars: Yahoo Finance, Twelve Data as backup',
            siSource: j.siSource,
            catalystSource: j.catalystSource,
            loading: false,
          }));
          // still filling: come back after the per-minute credit window resets
          if (j.pending.length) next = 65_000; else savedAt = Date.now();
        } else setSt((s) => ({ ...s, loading: false, freshness: Object.keys(s.bases).length ? s.freshness : 'nodata' }));
      } catch {
        if (!stop) setSt((s) => ({ ...s, loading: false }));
      }
      if (clock().session === 'Closed' && next > 65_000) next = 60 * 60_000;
      if (!stop) t = setTimeout(tick, next);
    };
    tick();
    return () => { stop = true; clearTimeout(t); };
  }, [key, mode.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  return st;
}

export interface MoversState { movers: Mover[]; lastUpdated: string; error?: string }

export function useMovers(mode: DataMode, enabled: boolean): MoversState | null {
  const [m, setM] = useState<MoversState | null>(null);
  useEffect(() => {
    if (mode.kind !== 'live' || !enabled || !mode.health.providers.alphavantage) { setM(null); return; }
    let stop = false;
    const go = () =>
      fetch('/api/movers').then(async (r) => {
        const j = await r.json();
        if (!stop) setM(r.ok ? { movers: j.movers, lastUpdated: j.lastUpdated } : { movers: [], lastUpdated: '', error: j.error });
      }).catch(() => {});
    go();
    const id = setInterval(go, 30 * 60_000);
    return () => { stop = true; clearInterval(id); };
  }, [mode, enabled]);
  return m;
}

/** Twelve Data credits a day for a universe, given hourly daily-bar refreshes during the session (+1 morning load). */
export const creditsPerDay = (n: number) => n * 8;

export function useUniverse(watch: string[], scanList: string[], movers: Mover[] | undefined, includeMovers: boolean, cap = 40) {
  return useMemo(() => {
    const out: string[] = [];
    const add = (s: string) => { if (!out.includes(s) && out.length < cap && s !== 'SPY') out.push(s); };
    watch.forEach(add);
    scanList.forEach(add);
    if (includeMovers) (movers ?? []).filter((m) => m.list !== 'losers').slice(0, 12).forEach((m) => add(m.sym));
    return out;
  }, [watch.join(), scanList.join(), includeMovers, movers, cap]); // eslint-disable-line react-hooks/exhaustive-deps
}
