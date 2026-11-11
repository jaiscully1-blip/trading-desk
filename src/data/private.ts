// Calls to the desk's private endpoints (Webull account, Discord channels). The desk password is kept in this browser only
// and sent as a header; the server compares it with DESK_PASSWORD. API keys themselves never reach the browser.
import { useCallback, useEffect, useState } from 'react';
import type { DataMode } from './live';
import { load, save } from '../lib/store';

let deskKey: string = load('deskKey', '');
const listeners = new Set<() => void>();
export const getDeskKey = () => deskKey;
export function setDeskKey(k: string) { deskKey = k; save('deskKey', k); listeners.forEach((f) => f()); }

export async function privateFetch(params: Record<string, string>): Promise<{ ok: boolean; status: number; j: any }> {
  const r = await fetch(`/api/research?${new URLSearchParams(params)}`, { headers: { 'x-desk-key': deskKey } });
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  return { ok: r.ok, status: r.status, j };
}

/** POST to a private endpoint (order ticket). extra headers carry the order PIN, which is never stored. */
export async function privatePost(params: Record<string, string>, body: unknown, extra: Record<string, string> = {}): Promise<{ ok: boolean; status: number; j: any }> {
  const r = await fetch(`/api/research?${new URLSearchParams(params)}`, { method: 'POST', headers: { 'x-desk-key': deskKey, 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  return { ok: r.ok, status: r.status, j };
}

export interface PrivState<T> { data: T | null; error?: string; code?: string; loading: boolean; at?: number }

/** Live-only fetch with auto refresh. Returns code 'bad-password' / 'no-password-set' when the lock should show. */
export function usePrivate<T>(params: Record<string, string> | null, mode: DataMode, refreshMs: number): PrivState<T> & { reload: () => void } {
  const [st, setSt] = useState<PrivState<T>>({ data: null, loading: false });
  const [n, setN] = useState(0);
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((x) => x + 1); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  const key = params ? JSON.stringify(params) : '';
  useEffect(() => {
    if (!key || mode.kind !== 'live') return;
    let stop = false, t: ReturnType<typeof setTimeout>, fails = 0;
    // a failed refresh used to end the polling for good; now it retries, waiting longer each time (up to 5 minutes).
    // A missing or wrong desk password is the exception: that needs the user, so it stops until they type it.
    const again = () => { if (!stop && refreshMs) t = setTimeout(go, Math.min(300_000, refreshMs * 2 ** Math.min(fails, 4))); };
    const go = async () => {
      setSt((s) => ({ ...s, loading: true }));
      try {
        const { ok, j } = await privateFetch(JSON.parse(key));
        if (stop) return;
        setSt((s) => ok ? { data: j, loading: false, at: Date.now() } : { data: j.code === 'bad-password' || j.code === 'no-password-set' ? null : s.data, loading: false, error: j.error, code: j.code, at: s.at });
        if (ok) { fails = 0; again(); } else if (j.code !== 'bad-password' && j.code !== 'no-password-set') { fails++; again(); }
      } catch (e) { if (!stop) { setSt((s) => ({ ...s, loading: false, error: String(e) })); fails++; again(); } }
    };
    go();
    return () => { stop = true; clearTimeout(t); };
  }, [key, mode.kind, n, deskKey, refreshMs]); // eslint-disable-line react-hooks/exhaustive-deps
  const reload = useCallback(() => setN((x) => x + 1), []);
  return { ...st, reload };
}
