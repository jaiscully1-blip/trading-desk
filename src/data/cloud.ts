// Optional Supabase sync for watchlists, playbooks, filters and scan settings.
// Without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY everything stays in this browser only.
// The anon key is public by design; row-level security (supabase/schema.sql) limits rows to the signed-in user.
import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { load, save } from '../lib/store';
import { isOwner } from '../lib/accounts';

export type CloudKey = 'boards' | 'playbooks' | 'filters' | 'scanList' | 'scanPrefs' | 'account' | 'exitRules';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const cloudConfigured = !!(URL_ && ANON) && import.meta.env.MODE !== 'single' && isOwner();

let clientP: Promise<SupabaseClient> | null = null;
function client() {
  if (!cloudConfigured) return null;
  clientP ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(URL_!, ANON!));
  return clientP;
}

const listeners = new Set<(u: User | null) => void>();
let currentUser: User | null = null;
client()?.then((c) => {
  c.auth.getUser().then(({ data }) => { currentUser = data.user; listeners.forEach((f) => f(currentUser)); });
  c.auth.onAuthStateChange((_e, s) => { currentUser = s?.user ?? null; listeners.forEach((f) => f(currentUser)); });
});

export function useCloudUser() {
  const [u, setU] = useState<User | null>(currentUser);
  useEffect(() => { listeners.add(setU); return () => { listeners.delete(setU); }; }, []);
  return u;
}

export async function signIn(email: string) {
  const c = await client();
  if (!c) throw new Error('Supabase not configured');
  const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw error;
}
export async function signOut() { await (await client())?.auth.signOut(); }

const tsKey = (k: CloudKey) => `cloudTs.${k}`;

/**
 * Keep one persisted value in sync. Newest write wins (local timestamp vs. row updated_at).
 * Pulls on sign-in and when the tab regains focus; pushes 800ms after a local change.
 */
export function useCloudSync<T>(key: CloudKey, value: T, setValue: (v: T) => void) {
  const user = useCloudUser();
  const applying = useRef(false);
  const first = useRef(true);

  // pull
  useEffect(() => {
    if (!user) return;
    let stop = false;
    const pull = async () => {
      const c = await client();
      if (!c) return;
      const { data, error } = await c.from('desk_state').select('value, updated_at').eq('key', key).maybeSingle();
      if (stop || error) return;
      const localTs = load<number>(tsKey(key), 0);
      if (data && Date.parse(data.updated_at) > localTs) {
        applying.current = true;
        setValue(data.value as T);
        save(tsKey(key), Date.parse(data.updated_at));
      } else if (!data || localTs > Date.parse(data.updated_at)) {
        await c.from('desk_state').upsert({ key, value, updated_at: new Date(localTs || Date.now()).toISOString() });
      }
    };
    pull();
    const onFocus = () => pull();
    window.addEventListener('focus', onFocus);
    return () => { stop = true; window.removeEventListener('focus', onFocus); };
  }, [user, key]); // eslint-disable-line react-hooks/exhaustive-deps

  // push
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (applying.current) { applying.current = false; return; }
    const now = Date.now();
    save(tsKey(key), now);
    if (!user) return;
    const t = setTimeout(async () => {
      const c = await client();
      await c?.from('desk_state').upsert({ key, value, updated_at: new Date(now).toISOString() });
    }, 800);
    return () => clearTimeout(t);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* ---------------- per-row collections (journal) ---------------- */
export type ItemKind = 'trade' | 'transfer' | 'checkin' | 'recap';
type Item = { updated: number; deleted?: boolean };

/** Merge two versions of a collection by id: the newer `updated` wins (deletions are tombstones). */
export function mergeById<T extends Item>(a: T[], b: T[], id: (x: T) => string): T[] {
  const m = new Map<string, T>();
  for (const x of [...a, ...b]) { const k = id(x); const cur = m.get(k); if (!cur || x.updated > cur.updated) m.set(k, x); }
  return [...m.values()];
}

/** Two-way sync of a local collection with desk_items rows. Pulls on sign-in and focus; pushes changed rows. */
export function useCloudItems<T extends Item>(kind: ItemKind, items: T[], setItems: (f: (x: T[]) => T[]) => void, id: (x: T) => string, loaded: boolean) {
  const user = useCloudUser();
  const pushed = useRef(new Map<string, number>());
  useEffect(() => {
    if (!user || !loaded) return;
    let stop = false;
    const pull = async () => {
      const c = await client();
      if (!c) return;
      const { data, error } = await c.from('desk_items').select('id, data').eq('kind', kind);
      if (stop || error || !data) return;
      const remote = data.map((r) => r.data as T);
      for (const r of remote) pushed.current.set(id(r), r.updated);
      setItems((local) => mergeById(local, remote, id));
    };
    pull();
    const onFocus = () => pull();
    window.addEventListener('focus', onFocus);
    return () => { stop = true; window.removeEventListener('focus', onFocus); };
  }, [user, kind, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || !loaded) return;
    const changed = items.filter((x) => (pushed.current.get(id(x)) ?? -1) < x.updated);
    if (!changed.length) return;
    const t = setTimeout(async () => {
      const c = await client();
      if (!c) return;
      for (let i = 0; i < changed.length; i += 50) {
        const batch = changed.slice(i, i + 50);
        const { error } = await c.from('desk_items').upsert(batch.map((x) => ({ kind, id: id(x), data: x, updated_at: new Date(x.updated).toISOString() })));
        if (!error) for (const x of batch) pushed.current.set(id(x), x.updated);
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [items, user, loaded]); // eslint-disable-line react-hooks/exhaustive-deps
}
