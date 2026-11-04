import { useEffect, useMemo, useState } from 'react';
import type { Freshness, Headline } from '../types';
import type { DataMode } from './live';
import { keywordSentiment, type NewsItem } from '../../shared/news';
import { FOMC, type Earning, type Ipo, type Odds, type Usual } from '../../shared/calendar';
import { clock } from '../lib/clock';
import { DEMO_AT, rng } from '../lib/demo';

export interface NewsState { items: NewsItem[]; sources: { name: string; ok: boolean; count: number; error?: string }[]; asOf: number; freshness: Freshness }

export function useNews(symbols: string[], mode: DataMode, demo: Headline[]): NewsState {
  const key = symbols.join(',');
  const demoState = useMemo<NewsState>(() => ({
    items: demo.map((h) => ({ id: h.id, t: h.t, title: h.title, src: h.src, url: '', syms: h.syms, macro: h.macro, sentiment: keywordSentiment(h.title) })),
    sources: [{ name: 'Demo feed', ok: true, count: demo.length }], asOf: DEMO_AT, freshness: 'demo',
  }), [demo]);
  const [st, setSt] = useState<NewsState>({ items: [], sources: [], asOf: 0, freshness: 'pending' });
  useEffect(() => {
    if (mode.kind !== 'live') return;
    let stop = false, t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await fetch(`/api/news?symbols=${key}`);
        const j = await r.json();
        if (!stop && r.ok) setSt({ items: j.items, sources: j.sources, asOf: j.asOf, freshness: j.items.length ? 'live' : 'nodata' });
      } catch { /* keep last */ }
      // 24/7: every 2 min in session, 5 min otherwise
      if (!stop) t = setTimeout(tick, clock().session === 'Regular session' ? 120_000 : 300_000);
    };
    tick();
    return () => { stop = true; clearTimeout(t); };
  }, [key, mode.kind]);
  return mode.kind === 'live' ? st : demoState;
}

export interface EconEvent { key: string; label: string; date: string; time: string; impact: 1 | 2 | 3; note: string; usual: Usual | null }
export interface CalendarState {
  asOf: number;
  freshness: Freshness;
  econ: EconEvent[] | null;
  odds: Odds | null;
  earnings: { mine: Earning[]; week: Earning[] } | null;
  ipos: Ipo[] | null;
  errors: Record<string, string>;
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Preview only: sample entries badged DEMO. FOMC dates are real and come from shared/calendar either way. */
function demoCalendar(symbols: string[]): CalendarState {
  const r = rng(77);
  const day = (n: number) => { let t = Date.now() + n * 86400_000; while ([0, 6].includes(new Date(t).getUTCDay())) t += 86400_000; return ymd(t); };
  const econ: EconEvent[] = [
    { key: 'claims', label: 'Jobless claims', date: day(1), time: '08:30', impact: 2, note: 'Sample entry', usual: { n: 50, avgAbsMove: 0.62, baseline: 0.71, upPct: 54 } },
    { key: 'cpi', label: 'CPI', date: day(6), time: '08:30', impact: 3, note: 'Sample entry', usual: { n: 13, avgAbsMove: 1.12, baseline: 0.71, upPct: 46 } },
    { key: 'retail', label: 'Retail sales', date: day(9), time: '08:30', impact: 2, note: 'Sample entry', usual: { n: 12, avgAbsMove: 0.74, baseline: 0.71, upPct: 58 } },
  ];
  const earnings = symbols.slice(0, 6).map((s, i) => ({ sym: s, name: s, date: day(3 + i * 4), when: r() < 0.5 ? 'post-market' : 'pre-market', estimate: +(r() * 3).toFixed(2) }));
  return {
    asOf: DEMO_AT, freshness: 'demo', econ, errors: {},
    odds: { event: 'DEMO', meeting: 'Sample: next FOMC decision', closes: Date.now() + 30 * 86400_000, outcomes: [{ label: 'Hold', prob: 0.81 }, { label: 'Cut 25bp', prob: 0.17 }, { label: 'Hike 25bp', prob: 0.02 }] },
    earnings: { mine: earnings, week: earnings.slice(0, 2) },
    ipos: [{ sym: 'DEMO', name: 'Sample IPO Inc', date: day(5), low: 14, high: 16, exchange: 'NASDAQ' }],
  };
}

export function useCalendar(symbols: string[], mode: DataMode): CalendarState | null {
  const key = symbols.join(',');
  const [st, setSt] = useState<CalendarState | null>(null);
  useEffect(() => {
    if (mode.kind === 'checking') return;
    if (mode.kind === 'demo') { setSt(demoCalendar(symbols)); return; }
    let stop = false;
    const go = () => fetch(`/api/calendar?symbols=${key}`).then(async (r) => {
      const j = await r.json();
      if (!stop && r.ok) setSt({ ...j, freshness: 'live' });
    }).catch(() => {});
    go();
    const id = setInterval(go, 30 * 60_000);
    return () => { stop = true; clearInterval(id); };
  }, [key, mode.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  return st;
}

export const nextFomc = (now = Date.now()) => FOMC.find((m) => Date.parse(`${m.date}T19:00:00Z`) > now - 3600_000) ?? null;
