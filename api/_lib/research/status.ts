// GET /api/research?fn=status -> every data provider: key present, requests used this minute / today, last success and last error, what it feeds and what backs it up.
// Counts and errors are per serverless instance (Vercel may run several), so they show what this instance has seen recently, not an account-wide total.
import { PROVIDER_INFO, stateOf } from '../../../shared/providers.js';
import { KEY_ENV, allProviders, hasKey, healthOf, json, usageOf, type Provider } from '../core.js';

export async function GET(): Promise<Response> {
  const now = Date.now();
  const rows = allProviders().map((p: Provider) => {
    const info = PROVIDER_INFO[p] ?? { label: p, feeds: '', fallback: '' };
    const u = usageOf(p, now), h = healthOf(p);
    const keyed = !!KEY_ENV[p];
    const state = stateOf({ keyed, hasKey: hasKey(p), min: u.min, day: u.day, health: h, now });
    return { id: p, label: info.label, feeds: info.feeds, fallback: info.fallback, unofficial: !!info.unofficial, keyed, hasKey: hasKey(p), state, min: u.min, day: { used: u.day.used, limit: Number.isFinite(u.day.limit) ? u.day.limit : null }, lastOk: h.lastOk ?? null, lastError: h.lastError ?? null, lastErrorAt: h.lastErrorAt ?? null };
  });
  return json({ asOf: now, rows }, { sMaxAge: 0 });
}
