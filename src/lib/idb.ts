// Tiny IndexedDB key-value store for the journal (screenshots make it too big for localStorage).
import { useEffect, useRef, useState } from 'react';
import { storagePrefix } from './accounts';

const KP = storagePrefix() === 'td.' ? '' : storagePrefix();

let dbP: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  dbP ??= new Promise((res) => {
    try {
      const r = indexedDB.open('trading-desk', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch {
      res(null);
    }
  });
  return dbP;
}
const mem = new Map<string, unknown>();

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const k = KP + key;
  const d = await db();
  if (!d) return mem.get(k) as T | undefined;
  return new Promise((res) => {
    try {
      const q = d.transaction('kv').objectStore('kv').get(k);
      q.onsuccess = () => res(q.result as T | undefined);
      q.onerror = () => res(mem.get(k) as T | undefined);
    } catch { res(mem.get(k) as T | undefined); }
  });
}
export async function idbSet(key: string, v: unknown) {
  const k = KP + key;
  mem.set(k, v);
  const d = await db();
  if (!d) return;
  try { d.transaction('kv', 'readwrite').objectStore('kv').put(v, k); } catch { /* memory only */ }
}

/** Like useState, persisted to IndexedDB. `loaded` turns true once the stored value is in. */
export function useIdbState<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const ready = useRef(false);
  useEffect(() => {
    idbGet<T>(key).then((x) => { if (x !== undefined) setV(x); ready.current = true; setLoaded(true); });
  }, [key]);
  useEffect(() => { if (ready.current) idbSet(key, v); }, [key, v]);
  return [v, setV, loaded] as const;
}
