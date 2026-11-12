// Desk accounts on this device: a name, a color and a 4-6 digit PIN. No email, no server login.
// Each account keeps its own copy of everything the desk saves (layout, watchlists, journal, alerts) under its own
// storage prefix, so a friend's account starts as a fresh default desk. The first account made in a browser that already
// has a desk adopts that data (prefix "td.", as before). Only the owner's account shows the private panels (Webull account,
// order ticket, Discord bots); the server still checks the desk password on every private call.
// The PIN keeps accounts apart on a shared device. It is not strong security: anyone with the device can read browser storage.

export interface Account { id: string; name: string; color: string; salt: string; hash: string; owner: boolean; legacy: boolean; createdAt: number }

const ACC = 'td.accounts', SES = 'td.session', NEXT = 'td.gateNext';
export const PIN_RE = /^\d{4,6}$/;
export const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#ec4899', '#64748b'];
const MAX_TRIES = 5, LOCK_MS = 60_000;

function read<T>(k: string, fb: T): T { try { const r = localStorage.getItem(k); return r == null ? fb : (JSON.parse(r) as T); } catch { return fb; } }
function write(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } }
function drop(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } }

export const listAccounts = (): Account[] => read<Account[]>(ACC, []);

/** Storage prefix for an account: the adopted desk keeps "td.", every other account gets its own. */
export const prefixFor = (a: Pick<Account, 'id' | 'legacy'>) => (a.legacy ? 'td.' : `td.u.${a.id}.`);

// Read once per page load: switching account reloads the page, so every module sees one account.
const session: Account | null = (() => { const id = read<string | null>(SES, null); return listAccounts().find((a) => a.id === id) ?? null; })();
export const currentAccount = () => session;
export const isOwner = () => session?.owner === true;
/** Prefix for the signed-in account. Before anyone signs in nothing should be saved, but "td." keeps old behaviour. */
export const storagePrefix = () => (session ? prefixFor(session) : 'td.');

/** True when this browser already holds a desk from before accounts existed (it becomes the first account's data). */
export function hasLegacyDesk(): boolean {
  if (listAccounts().some((a) => a.legacy)) return false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? '';
      if (k.startsWith('td.') && !k.startsWith('td.u.') && ![ACC, SES, NEXT].includes(k) && !k.startsWith('td.pinFails.')) return true;
    }
  } catch { /* ignore */ }
  return false;
}
/** The adopted desk had the desk password saved, so it is the owner's browser. */
const legacyHasDeskKey = () => { const k = read<string>('td.deskKey', ''); return typeof k === 'string' && k.length > 0; };

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
export async function hashPin(pin: string, salt: string): Promise<string> {
  // many rounds of SHA-256 so a stolen hash is slower to brute force (still only 1M PINs: this is a lock, not a vault)
  let h: ArrayBuffer = new TextEncoder().encode(`${salt}:${pin}`).slice().buffer;
  for (let i = 0; i < 2000; i++) h = await crypto.subtle.digest('SHA-256', h);
  return hex(h);
}
const randId = (n = 8) => hex(crypto.getRandomValues(new Uint8Array(n)).buffer as ArrayBuffer);

export function validName(name: string, except?: string): string | null {
  const n = name.trim();
  if (!n) return 'Type a name.';
  if (n.length > 24) return 'Keep the name to 24 characters.';
  if (listAccounts().some((a) => a.id !== except && a.name.toLowerCase() === n.toLowerCase())) return 'That name is taken on this device.';
  return null;
}

export async function createAccount(o: { name: string; color: string; pin: string; owner?: boolean }): Promise<Account> {
  if (!PIN_RE.test(o.pin)) throw new Error('The PIN must be 4 to 6 digits.');
  const bad = validName(o.name);
  if (bad) throw new Error(bad);
  const legacy = hasLegacyDesk();
  const salt = randId(16);
  const a: Account = { id: randId(), name: o.name.trim(), color: o.color, salt, hash: await hashPin(o.pin, salt), owner: !!o.owner || (legacy && legacyHasDeskKey()), legacy, createdAt: Date.now() };
  write(ACC, [...listAccounts(), a]);
  return a;
}

interface Fails { n: number; until: number }
export const lockedFor = (id: string): number => Math.max(0, read<Fails>(`td.pinFails.${id}`, { n: 0, until: 0 }).until - Date.now());

/** Check a PIN. Five wrong tries lock the account for a minute. */
export async function checkPin(id: string, pin: string): Promise<'ok' | 'wrong' | 'locked'> {
  const a = listAccounts().find((x) => x.id === id);
  if (!a) return 'wrong';
  if (lockedFor(id) > 0) return 'locked';
  if ((await hashPin(pin, a.salt)) === a.hash) { drop(`td.pinFails.${id}`); return 'ok'; }
  const f = read<Fails>(`td.pinFails.${id}`, { n: 0, until: 0 });
  const n = f.n + 1;
  write(`td.pinFails.${id}`, n >= MAX_TRIES ? { n: 0, until: Date.now() + LOCK_MS } : { n, until: 0 });
  return n >= MAX_TRIES ? 'locked' : 'wrong';
}

/** Stay signed in on this device until the person switches or makes a new account. */
export function enter(id: string) { write(SES, id); drop(NEXT); location.reload(); }
/** Leave this account: back to the account page, or straight to the new-account page. */
export function leave(next: 'pick' | 'new' = 'pick') { drop(SES); write(NEXT, next); location.reload(); }
export const gateNext = (): 'pick' | 'new' => (read<string>(NEXT, 'pick') === 'new' ? 'new' : 'pick');

/** Mark an account as the owner after the server accepted the desk password, and keep the password in that account. */
export function makeOwner(a: Account, deskKey: string) {
  write(ACC, listAccounts().map((x) => (x.id === a.id ? { ...x, owner: true } : x)));
  write(`${prefixFor(a)}deskKey`, deskKey);
}

/** Ask the desk whether a desk password is right (it never leaves this browser except as a header to the desk itself). */
export async function verifyDeskPassword(pw: string): Promise<boolean> {
  try { const r = await fetch('/api/research?fn=deskcheck', { headers: { 'x-desk-key': pw }, cache: 'no-store' }); return r.ok; } catch { return false; }
}

export const initials = (name: string) => name.trim().split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?';
