// Small fetch hook for the research pages: loads a URL when live, refreshes on a timer, keeps the last good answer.
import { useEffect, useState } from 'react';
import type { SnapMap } from '../../shared/markets';

export interface ApiState<T> { data: T | null; error?: string; loading: boolean; at?: number }
const memo = new Map<string, { at: number; data: unknown }>();

export function useApi<T>(url: string | null, refreshMs = 0, maxAgeMs = 60_000): ApiState<T> {
  const [st, setSt] = useState<ApiState<T>>(() => {
    const hit = url ? memo.get(url) : undefined;
    return hit ? { data: hit.data as T, loading: false, at: hit.at } : { data: null, loading: !!url };
  });
  useEffect(() => {
    if (!url) { setSt({ data: null, loading: false }); return; }
    let stop = false, t: ReturnType<typeof setTimeout>;
    const hit = memo.get(url);
    setSt(hit ? { data: hit.data as T, loading: false, at: hit.at } : { data: null, loading: true });
    const go = async () => {
      try {
        const r = await fetch(url);
        const j = await r.json();
        if (stop) return;
        if (r.ok && !j.error) { memo.set(url, { at: Date.now(), data: j }); setSt({ data: j, loading: false, at: Date.now() }); }
        else setSt((s) => ({ ...s, loading: false, error: j.error ?? `HTTP ${r.status}`, data: s.data ?? (j.error ? null : j) }));
      } catch (e) { if (!stop) setSt((s) => ({ ...s, loading: false, error: String((e as Error).message ?? e) })); }
      if (!stop && refreshMs) t = setTimeout(go, refreshMs);
    };
    if (hit && Date.now() - hit.at < maxAgeMs) { if (refreshMs) t = setTimeout(go, refreshMs); }
    else go();
    return () => { stop = true; clearTimeout(t); };
  }, [url, refreshMs, maxAgeMs]);
  return st;
}

export interface SnapshotResp { snap: SnapMap; source: string; caps: boolean; count: number; asOf: number }
/** Whole-market snapshot (price, % change, market cap), refreshed every 2 minutes while a page that needs it is open. */
export const useSnapshot = (on: boolean) => useApi<SnapshotResp>(on ? '/api/research?fn=snapshot' : null, 120_000, 90_000);

export const pct = (v: number | null | undefined, dp = 2) => (v == null || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(dp)}%`);
/** Finviz-style red/green for a % move, saturating at ±3%. */
export function moveColor(v: number | null | undefined, sat = 3): string {
  if (v == null || !Number.isFinite(v)) return 'var(--line-2)';
  const a = Math.min(1, Math.abs(v) / sat);
  return `color-mix(in srgb, ${v >= 0 ? 'var(--up)' : 'var(--down)'} ${Math.round(18 + a * 72)}%, #2b3038)`;
}
