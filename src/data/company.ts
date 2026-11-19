// Company names, earnings, news history and the company page. Live via /api; demo mode returns labeled sample data.
import { useEffect, useMemo, useState } from 'react';
import type { DataMode } from './live';
import type { CompanyFacts } from '../../shared/company';
import type { Profile } from '../../shared/parse';
import { keywordSentiment } from '../../shared/news';
import { DEMO_AT, rng } from '../lib/demo';
import { load, save } from '../lib/store';
import { idbGet, idbSet } from '../lib/idb';

/* ---------------- names (cached in this browser; names rarely change) ---------------- */
const nameCache: Record<string, string> = load('names', {});
export function useNames(symbols: string[], mode: DataMode, fallback: Record<string, string>): Record<string, string> {
  const [, bump] = useState(0);
  const key = [...new Set(symbols)].sort().join(',');
  useEffect(() => {
    if (mode.kind !== 'live') return;
    const missing = key.split(',').filter((s) => s && !nameCache[s]);
    if (!missing.length) return;
    let stop = false;
    (async () => {
      for (let i = 0; i < missing.length && !stop; i += 30) {
        try {
          const r = await fetch(`/api/research?fn=names&symbols=${missing.slice(i, i + 30).join(',')}`);
          const j = await r.json();
          if (r.ok) { Object.assign(nameCache, j.names); save('names', nameCache); bump((x) => x + 1); }
        } catch { /* keep fallbacks */ }
      }
    })();
    return () => { stop = true; };
  }, [key, mode.kind]);
  return useMemo(() => ({ ...fallback, ...nameCache }), [fallback, key, nameCache, Object.keys(nameCache).length]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* ---------------- earnings (for pings) ---------------- */
export interface EarnRow { sym: string; date: string; hour: string; epsEst: number | null; epsAct: number | null; revEst: number | null; revAct: number | null }
export function useEarnings(symbols: string[], mode: DataMode): EarnRow[] {
  const [rows, setRows] = useState<EarnRow[]>([]);
  const key = [...new Set(symbols)].sort().join(',');
  useEffect(() => {
    if (!key) { setRows([]); return; }
    if (mode.kind === 'demo') {
      const r = rng(7), today = new Date(DEMO_AT).toISOString().slice(0, 10);
      setRows(key.split(',').slice(0, 2).map((s, i) => ({ sym: s, date: today, hour: i ? 'amc' : 'bmo', epsEst: +(r() * 2).toFixed(2), epsAct: i ? null : +(r() * 2.4).toFixed(2), revEst: null, revAct: null })));
      return;
    }
    if (mode.kind !== 'live') return;
    let stop = false, t: ReturnType<typeof setTimeout>;
    const go = async () => {
      try { const r = await fetch(`/api/research?fn=earnings&symbols=${key}`); const j = await r.json(); if (!stop && r.ok) setRows(j.rows); } catch { /* keep */ }
      if (!stop) t = setTimeout(go, 15 * 60_000);
    };
    go();
    return () => { stop = true; clearTimeout(t); };
  }, [key, mode.kind]);
  return rows;
}

/* ---------------- news history for the chart's news buttons ---------------- */
export interface HistNews { t: number; title: string; src: string; url: string; sentiment: -1 | 0 | 1 }
export interface HistNewsState { items: HistNews[]; loading: boolean; error?: string; source: string; from?: string }
const DEMO_HEAD = ['beats estimates and raises guidance', 'shares slide after analyst downgrade', 'announces new product line', 'wins large contract', 'faces regulatory probe', 'reports record quarterly revenue', 'cuts outlook on weak demand', 'expands buyback program', 'CEO comments on demand at conference', 'shares rally on upgrade'];
export function useHistNews(sym: string, fromMs: number, toMs: number, mode: DataMode, enabled: boolean): HistNewsState {
  const [st, setSt] = useState<HistNewsState>({ items: [], loading: false, source: '' });
  const from = new Date(Math.max(fromMs, toMs - 365 * 86400_000)).toISOString().slice(0, 10);
  const to = new Date(toMs).toISOString().slice(0, 10);
  useEffect(() => {
    if (!enabled || !sym) return;
    if (mode.kind === 'demo') {
      const r = rng(sym.length * 97 + 3);
      const items: HistNews[] = [];
      for (let t = Date.parse(from); t < Date.parse(to) + 86400_000; t += 86400_000) {
        if (r() < 0.22) { const title = `${sym} ${DEMO_HEAD[Math.floor(r() * DEMO_HEAD.length)]} (sample)`; items.push({ t: t + 14 * 3600_000, title, src: 'Demo feed', url: '', sentiment: keywordSentiment(title) }); }
      }
      setSt({ items, loading: false, source: 'Sample headlines', from });
      return;
    }
    if (mode.kind !== 'live') return;
    let stop = false;
    setSt((s) => ({ ...s, loading: true }));
    fetch(`/api/research?fn=company-news&symbol=${encodeURIComponent(sym)}&from=${from}&to=${to}`).then(async (r) => {
      const j = await r.json();
      if (stop) return;
      setSt(r.ok ? { items: j.items, loading: false, source: j.source, from: j.from } : { items: [], loading: false, error: j.error ?? `HTTP ${r.status}`, source: '' });
    }).catch((e) => !stop && setSt({ items: [], loading: false, error: String(e), source: '' }));
    return () => { stop = true; };
  }, [sym, from, to, mode.kind, enabled]);
  return st;
}

/* ---------------- company page ---------------- */
export interface CompanyData {
  sym: string; name: string; profile: Profile | null; peers: { sym: string; name: string }[];
  filing: { form: string; date: string; url: string } | null; facts: CompanyFacts | null; model: string | null;
  wiki: { title: string; extract: string; url: string } | null; gemini: boolean; errors: Record<string, string>; asOf: number; demo?: boolean;
  about?: { sector: string | null; industry: string | null; exchange: string | null; hq: string | null; marketCap: number | null; capNote: string | null; web: string | null; fiscalYearEnd: string | null; incorporated: string | null; sic: string | null };
  /** true while the 10-K is still being read (the quick answer came first) */
  pending?: boolean;
  /** sentences quoted from the filing about customers and suppliers (keyword match, no AI) */
  quotes?: { customers: string[]; suppliers: string[] } | null;
}
const companyCache = new Map<string, CompanyData>();
// A finished company read (10-K map included) is also kept on this device for 30 days: 10-Ks change once a year, so
// opening a company again is instant. The quick part (price, market cap, peers) still refreshes in the background.
const KEEP_MS = 30 * 86400_000;
const good = (d: CompanyData) => !d.errors?.gemini && !d.errors?.filing && !d.pending;
const keep = (sym: string, d: CompanyData) => { companyCache.set(sym, d); if (good(d) && d.facts) void idbSet(`company:${sym}`, { at: Date.now(), d }).catch(() => {}); };
async function stored(sym: string): Promise<CompanyData | null> {
  try { const x = await idbGet<{ at: number; d: CompanyData }>(`company:${sym}`); return x && Date.now() - x.at < KEEP_MS ? x.d : null; } catch { return null; }
}
const fetchCo = async (sym: string, quick: boolean): Promise<CompanyData> => {
  const r = await fetch(`/api/research?fn=company&symbol=${encodeURIComponent(sym)}${quick ? '&quick=1' : ''}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j as CompanyData;
};
/** Start reading a company in the background (hovering a ticker, opening the peek) so its page is ready on click. */
const warming = new Set<string>();
export async function prefetchCompany(sym: string) {
  if (!sym || companyCache.has(sym) || warming.has(sym) || warming.size >= 2) return;
  warming.add(sym);
  try {
    const s0 = await stored(sym); if (s0) { companyCache.set(sym, s0); return; }
    const q = await fetchCo(sym, true);
    if (good(q)) { keep(sym, q); return; }
    const full = await fetchCo(sym, false); // the server reads the 10-K now and keeps it, the page then opens from cache
    if (good(full)) keep(sym, full);
  } catch { /* a click will try again */ } finally { warming.delete(sym); }
}

function demoCompany(sym: string, name: string): CompanyData {
  const pick = (xs: string[], n: number, seed: number) => { const r = rng(seed); return [...xs].sort(() => r() - 0.5).slice(0, n); };
  const pool = ['NVDA', 'AMD', 'TSM', 'MU', 'AVGO', 'MSFT', 'AMZN', 'GOOGL', 'META', 'AAPL', 'ANET', 'INTC', 'QCOM', 'ORCL'].filter((s) => s !== sym);
  const seed = [...sym].reduce((a, c) => a + c.charCodeAt(0), 0);
  return {
    sym, name, demo: true, model: null, gemini: false, errors: {}, asOf: DEMO_AT, wiki: null,
    profile: { name, sharesOut: null, industry: 'Sample industry', exchange: 'NASDAQ', marketCap: 1.2e11 },
    peers: pick(pool, 5, seed + 1).map((s) => ({ sym: s, name: s })),
    filing: { form: '10-K', date: '2026-02-26', url: '' },
    facts: {
      summary: `${name} is shown with SAMPLE data. On the live desk this summary comes from the company's latest 10-K, read by the free Gemini model.`,
      fiscalYear: 'sample',
      products: [{ name: 'Product line A', share: '55%' }, { name: 'Product line B', share: '30%' }, { name: 'Services', share: '15%' }],
      suppliers: [...pick(pool, 3, seed + 2).map((s) => ({ name: s, sym: s, what: 'components (sample)' })), { name: 'Private Supplier Co. (sample)', what: 'assembly' }],
      customers: [...pick(pool, 3, seed + 3).map((s, i) => ({ name: s, sym: s, share: i === 0 ? '12%' : undefined })), { name: 'Customer A (sample)', share: '10%' }],
      competitors: pick(pool, 4, seed + 4).map((s) => ({ name: s, sym: s })),
    },
  };
}

export function useCompany(sym: string, name: string, mode: DataMode): { data: CompanyData | null; loading: boolean; error?: string; reading: boolean; retry: () => void } {
  const [st, setSt] = useState<{ data: CompanyData | null; loading: boolean; error?: string }>({ data: companyCache.get(sym) ?? null, loading: false });
  const [reading, setReading] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!sym) return;
    if (mode.kind === 'demo') { setSt({ data: demoCompany(sym, name), loading: false }); return; }
    if (mode.kind !== 'live') return;
    const hit = companyCache.get(sym);
    if (hit) { setSt({ data: hit, loading: false }); return; }
    let stop = false;
    setSt({ data: null, loading: true });
    const get = (quick: boolean) => fetchCo(sym, quick);
    // quick answer first (profile, SEC facts, peers), then the 10-K read if it isn't cached yet
    (async () => {
      try {
        // saved copy on this device: show it at once, then refresh the quick numbers behind it (the map stays)
        const saved = await stored(sym);
        if (stop) return;
        if (saved) {
          setSt({ data: saved, loading: false }); companyCache.set(sym, saved);
          const q = await get(true).catch(() => null);
          if (!stop && q) { const merged = { ...saved, ...q, facts: q.pending || !q.facts ? saved.facts : q.facts, pending: false }; keep(sym, merged); setSt({ data: merged, loading: false }); }
          return;
        }
        const q = await get(true);
        if (stop) return;
        if (good(q)) { keep(sym, q); setSt({ data: q, loading: false }); return; }
        setSt({ data: q, loading: false });
        setReading(true);
        let full = await get(false);
        // the free AI is often briefly overloaded: one automatic second try after 20 seconds
        if (!stop && !good(full) && n === 0) { await new Promise((r) => setTimeout(r, 20_000)); if (!stop) full = await get(false); }
        if (stop) return;
        if (good(full)) keep(sym, full);
        setSt({ data: full, loading: false });
      } catch (e) { if (!stop) setSt((s) => ({ data: s.data, loading: false, error: (e as Error).message })); }
      if (!stop) setReading(false);
    })();
    return () => { stop = true; setReading(false); };
  }, [sym, mode.kind, n]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...st, reading, retry: () => { companyCache.delete(sym); void idbSet(`company:${sym}`, null).catch(() => {}); setN((x) => x + 1); } };
}
