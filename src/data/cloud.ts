// Optional Supabase sync for watchlists, playbooks, filters and scan settings.
// Without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY everything stays in this browser only.
// The anon key is public by design; row-level security (supabase/schema.sql) limits rows to the signed-in user.
import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { load, save } from '../lib/store';

export type CloudKey = 'boards' | 'playbooks' | 'filters' | 'scanList' | 'scanPrefs';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const cloudConfigured = !!(URL_ && ANON) && import.meta.env.MODE !== 'single';

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
