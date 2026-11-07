// Gate for endpoints that return Jai's own data (Webull account, Discord channels) or spend money (Claude).
// The desk is a public URL, so these refuse unless the browser sends the desk password set in Vercel (DESK_PASSWORD).
import { createHash, timingSafeEqual } from 'node:crypto';
import { json } from './core.js';

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Returns an error Response when the caller may not see private data, or null when it may. */
export function denyPrivate(req: Request): Response | null {
  const want = process.env.DESK_PASSWORD ?? '';
  if (!want) return json({ error: 'Private panels are locked: add DESK_PASSWORD in Vercel (any long phrase), redeploy, then type it on the desk.', code: 'no-password-set' }, { status: 403 });
  const got = req.headers.get('x-desk-key') ?? '';
  // compare hashes so the check takes the same time whatever was typed
  if (!got || !timingSafeEqual(digest(got), digest(want))) return json({ error: 'Wrong or missing desk password.', code: 'bad-password' }, { status: 401 });
  return null;
}
