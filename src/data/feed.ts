import { useEffect, useState } from 'react';
import type { DataMode } from './live';
import type { FeedItem } from '../../shared/feed';
import { DEMO_AT } from '../lib/demo';

export interface FeedState { items: FeedItem[]; sources: { name: string; ok: boolean; count: number; error?: string }[]; asOf: number; demo?: boolean }

function demoFeed(): FeedState {
  const t = (minAgo: number) => DEMO_AT - minAgo * 60_000;
  const items: FeedItem[] = [
    { id: 'd1', t: t(300), kind: 'earnings', sym: 'NVDA', title: 'NVDA reports today after the close', text: 'EPS est 1.25 · revenue est $54.00B (sample)' },
    { id: 'd2', t: t(240), kind: 'fed', title: 'Governor speech on the economic outlook (sample)', text: 'Fed speeches' },
    { id: 'd3', t: t(150), kind: 'whitehouse', title: 'Statement on trade policy (sample)', text: 'White House' },
    { id: 'd4', t: t(20), kind: 'filing', sym: 'NVDA', title: 'NVDA just filed its earnings results', text: 'NVIDIA CORP filed an 8-K with Item 2.02 (sample).' },
    { id: 'd5', t: t(5), kind: 'result', sym: 'NVDA', tone: 'up', title: 'NVDA beat on EPS', text: 'EPS 1.31 vs 1.25 expected. Revenue $55.10B vs $54.00B est. (sample)' },
  ];
  return { items, sources: [{ name: 'Demo feed', ok: true, count: items.length }], asOf: DEMO_AT, demo: true };
}

export function useFeed(symbols: string[], mode: DataMode, enabled: boolean): FeedState | null {
  const [st, setSt] = useState<FeedState | null>(null);
  const key = [...new Set(symbols)].sort().join(',');
  useEffect(() => {
    if (!enabled) return;
    if (mode.kind === 'demo') { setSt(demoFeed()); return; }
    if (mode.kind !== 'live') return;
    let stop = false, t: ReturnType<typeof setTimeout>;
    const go = async () => {
      try { const r = await fetch(`/api/research?fn=feed&symbols=${key}`); const j = await r.json(); if (!stop && r.ok) setSt(j); } catch { /* keep last */ }
      if (!stop) t = setTimeout(go, 60_000);
    };
    go();
    return () => { stop = true; clearTimeout(t); };
  }, [key, mode.kind, enabled]);
  return st;
}
