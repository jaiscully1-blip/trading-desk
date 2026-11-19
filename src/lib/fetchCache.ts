// One shared request layer for the desk's own API (GET /api/...): identical requests made at the same moment by
// different widgets share one network call, and an answer is reused for a short while, so opening a page or
// switching workspace doesn't re-download what another panel just fetched. Orders, account and anything that isn't a
// plain GET always go straight to the network.
import { freshMode, recordApi } from './health';
const FRESH_MS = 8_000; // shorter than any polling interval on the desk, so live refreshes still get new data
const NEVER = /\/api\/(webull|notify|deskcheck|research\?fn=(webull|webull-orders|discord|notify|agents))/;
type Hit = { t: number; status: number; headers: [string, string][]; body: string };
const done = new Map<string, Hit>();
const inflight = new Map<string, Promise<Hit>>();
const make = (h: Hit) => new Response(h.body, { status: h.status, headers: h.headers });

export function sharedKey(input: RequestInfo | URL, init?: RequestInit): string | null {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (method !== 'GET' || init?.body || init?.cache === 'no-store') return null;
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const u = new URL(url, location.origin);
  if (u.origin !== location.origin || !u.pathname.startsWith('/api/') || NEVER.test(u.pathname + u.search)) return null;
  return u.pathname + u.search;
}

export function installFetchCache() {
  if (typeof window === 'undefined' || (window as any).__tdFetch) return;
  const raw = window.fetch.bind(window);
  (window as any).__tdFetch = raw;
  const timed = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, t0 = performance.now();
    const isApi = /^\/api\/|\/\/[^/]+\/api\//.test(url) && new URL(url, location.origin).origin === location.origin;
    // right after "Reload all data": tag desk API calls so the CDN and the server skip their saved copies
    const fresh = isApi ? freshMode() : null;
    const go = fresh ? raw(`${url}${url.includes('?') ? '&' : '?'}_fresh=${fresh}`, init) : raw(input, init);
    if (isApi) go.then((r) => recordApi(url, r.status, performance.now() - t0), () => recordApi(url, 0, performance.now() - t0));
    return go;
  };
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const k = sharedKey(input, init);
    if (!k) return timed(input, init);
    const hit = done.get(k);
    if (hit && Date.now() - hit.t < FRESH_MS && !freshMode()) return Promise.resolve(make(hit));
    let p = inflight.get(k);
    if (!p) {
      const { signal: _ignored, ...rest } = init ?? {}; // one caller giving up must not cancel the request for the others
      p = timed(input, rest).then(async (r) => {
        const h: Hit = { t: Date.now(), status: r.status, headers: [...r.headers.entries()], body: await r.text() };
        if (r.ok) { done.set(k, h); if (done.size > 300) done.delete(done.keys().next().value!); }
        return h;
      }).finally(() => inflight.delete(k));
      inflight.set(k, p);
    }
    const sig = init?.signal;
    if (!sig) return p.then(make);
    if (sig.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    return new Promise<Response>((res, rej) => { sig.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError')), { once: true }); p!.then((h) => res(make(h)), rej); });
  };
}
