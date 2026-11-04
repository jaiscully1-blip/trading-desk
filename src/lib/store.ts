import { useEffect, useState } from 'react';

// Browser storage is a per-device convenience for Milestone 1.
// Watchlists, playbooks and the journal move to Supabase in Milestones 3-4.
const PREFIX = 'td.';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable: keep in memory only */
  }
}

export function usePersisted<T>(key: string, fallback: T | (() => T)) {
  const [v, setV] = useState<T>(() =>
    load<T>(key, typeof fallback === 'function' ? (fallback as () => T)() : fallback),
  );
  useEffect(() => save(key, v), [key, v]);
  return [v, setV] as const;
}
