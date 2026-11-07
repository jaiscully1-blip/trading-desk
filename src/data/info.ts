// "What is this ticker?" lookups for the info popover. Funds and S&P 500 basics are known offline; the rest comes from /api.
import { useEffect, useState } from 'react';
import type { DataMode } from './live';
import { ETFS } from '../../shared/etfs';
import { COMPANIES } from '../../shared/data/companies';

export interface TickerInfoData {
  sym: string; type: 'fund' | 'company' | 'unknown'; name: string; what: string | null; fundKind?: string;
  sector?: string | null; industry?: string | null; hq?: string | null; marketCap?: number | null; exchange?: string | null; web?: string | null;
  index?: string | null; wiki?: { title: string; url: string } | null; source?: string; offline?: boolean;
}
const cache = new Map<string, TickerInfoData>();

export function offlineInfo(sym: string): TickerInfoData | null {
  const f = ETFS[sym];
  if (f) return { sym, type: 'fund', name: f.name, what: f.what, fundKind: f.kind, source: 'Fund’s stated objective (issuer)', offline: true };
  const c = COMPANIES.find((r) => r[0] === sym);
  if (c) return { sym, type: 'company', name: c[1], what: null, sector: c[2], industry: c[3], hq: c[4], index: c[7] === 'spx' ? 'S&P 500' : 'Nasdaq-100', offline: true };
  return null;
}

/** Names for every fund and index member we know offline, used wherever a ticker shows its name. */
export const OFFLINE_NAMES: Record<string, string> = Object.fromEntries([...COMPANIES.map((c) => [c[0], c[1]]), ...Object.entries(ETFS).map(([k, v]) => [k, v.name])]);

export function useTickerInfo(sym: string | null, mode: DataMode): { data: TickerInfoData | null; loading: boolean; error?: string } {
  const [st, setSt] = useState<{ data: TickerInfoData | null; loading: boolean; error?: string }>({ data: null, loading: false });
  useEffect(() => {
    if (!sym) return;
    const off = offlineInfo(sym);
    const hit = cache.get(sym);
    if (hit) { setSt({ data: hit, loading: false }); return; }
    if (mode.kind !== 'live' || off?.type === 'fund') { setSt({ data: off, loading: false, error: off ? undefined : 'No offline description for this ticker.' }); return; }
    let stop = false;
    setSt({ data: off, loading: true });
    fetch(`/api/research?fn=info&symbol=${encodeURIComponent(sym)}`).then(async (r) => {
      const j = await r.json();
      if (stop) return;
      if (r.ok) { const d = { ...off, ...Object.fromEntries(Object.entries(j).filter(([, v]) => v != null)) } as TickerInfoData; cache.set(sym, d); setSt({ data: d, loading: false }); }
      else setSt({ data: off, loading: false, error: j.error });
    }).catch((e) => !stop && setSt({ data: off, loading: false, error: String(e) }));
    return () => { stop = true; };
  }, [sym, mode.kind]);
  return st;
}
