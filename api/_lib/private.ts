// Gate for endpoints that return Jai's own data (Webull account, Discord channels) or spend money (Claude).
// The desk is a public URL, so these refuse unless the browser sends the desk password set in Vercel (DESK_PASSWORD).
// Spaces around the password are ignored on both sides. Too many wrong tries from one address lock that address out
// for 15 minutes (best effort: counts live in each server instance), so a short password can't simply be guessed.
import { createHash, timingSafeEqual } from 'node:crypto';
import { json } from './core.js';

const digest = (s: string) => createHash('sha256').update(s).digest();
const MAX_WRONG = 8, LOCK_MS = 15 * 60_000;
const wrong = new Map<string, { n: number; until: number }>();

/** Returns an error Response when the caller may not see private data, or null when it may. */
export function denyPrivate(req: Request): Response | null {
  const want = (process.env.DESK_PASSWORD ?? '').trim();
  if (!want) return json({ error: 'Private panels are locked: add DESK_PASSWORD in Vercel (any long phrase), redeploy, then type it on the desk.', code: 'no-password-set' }, { status: 403 });
  const who = (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  const w = wrong.get(who);
  if (w && w.until > Date.now()) return json({ error: 'Too many wrong desk passwords. Try again in 15 minutes.', code: 'bad-password' }, { status: 429 });
  const got = (req.headers.get('x-desk-key') ?? '').trim();
  // compare hashes so the check takes the same time whatever was typed
  if (!got || !timingSafeEqual(digest(got), digest(want))) {
    if (got) { const n = (w && w.until === 0 ? w.n : 0) + 1; wrong.set(who, n >= MAX_WRONG ? { n: 0, until: Date.now() + LOCK_MS } : { n, until: 0 }); }
    return json({ error: 'Wrong or missing desk password.', code: 'bad-password' }, { status: 401 });
  }
  wrong.delete(who);
  return null;
}
