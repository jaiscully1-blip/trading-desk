// Webull OpenAPI client, READ-ONLY. Mirrors the signing in Webull's official Python SDK
// (github.com/webull-inc/webull-openapi-python-sdk, core/auth/composer/default_signature_composer.py):
//   sign params = x-app-key, x-timestamp, x-signature-version, x-signature-algorithm, x-signature-nonce, host + every query param,
//   sorted by name and joined k=v&...; string = path&params[&UPPER(sha256_hex(compact body))]; percent-encode everything but A-Za-z0-9-._~;
//   signature = base64(HMAC-SHA256(secret + '&', string)).
// This module exposes read calls (plus the token create/check POSTs Webull requires for 2FA). Order calls live only in
// api/_lib/broker/webull-orders.ts behind the desk password, the order PIN and the WEBULL_ORDERS switch (RULES.md R6).
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { ProviderError } from '../../shared/parse.js';

export const WEBULL_HOST = process.env.WEBULL_HOST || 'api.webull.com'; // US production, from the SDK's endpoints.json

/** Python's urllib quote(s, safe='') */
export const pyQuote = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function webullSign(o: { host: string; path: string; query?: Record<string, string>; body?: unknown; appKey: string; secret: string; timestamp: string; nonce: string; algo?: 'sha256' | 'sha1' }): { headers: Record<string, string>; signature: string } {
  const sha1 = o.algo === 'sha1'; // SHA1 + MD5 body = the variant in Webull's docs worked example (used in tests)
  const headers: Record<string, string> = {
    'x-app-key': o.appKey,
    'x-timestamp': o.timestamp,
    'x-signature-version': '1.0',
    'x-signature-algorithm': sha1 ? 'HMAC-SHA1' : 'HMAC-SHA256',
    'x-signature-nonce': o.nonce,
  };
  const params: Record<string, string> = { ...headers, host: o.host };
  for (const [k, v] of Object.entries(o.query ?? {})) params[k] = params[k] != null ? `${params[k]}&${v}` : String(v);
  let s = `${o.path}&${Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&')}`;
  if (o.body !== undefined) s += `&${createHash(sha1 ? 'md5' : 'sha256').update(typeof o.body === 'string' ? o.body : JSON.stringify(o.body)).digest('hex').toUpperCase()}`;
  const signature = createHmac(sha1 ? 'sha1' : 'sha256', `${o.secret}&`).update(pyQuote(s)).digest('base64');
  return { headers: { ...headers, 'x-signature': signature }, signature };
}

const iso = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
export const hasWebull = () => !!(process.env.WEBULL_APP_KEY && process.env.WEBULL_APP_SECRET);

// Webull's own limits: account list 10 / 30 s, positions & balance & orders 2 / 2 s. Keep well under them.
let last = 0;
async function spacing() { const wait = last + 1100 - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); last = Date.now(); }

export async function wbCall(method: 'GET' | 'POST', path: string, query: Record<string, string> = {}, body?: unknown, token?: string, extra: Record<string, string> = {}): Promise<any> {
  const appKey = process.env.WEBULL_APP_KEY, secret = process.env.WEBULL_APP_SECRET;
  if (!appKey || !secret) throw new ProviderError('webull', 'missing WEBULL_APP_KEY / WEBULL_APP_SECRET', false);
  await spacing();
  const { headers } = webullSign({ host: WEBULL_HOST, path, query, body, appKey, secret, timestamp: iso(), nonce: randomUUID().replace(/-/g, '') });
  const qs = new URLSearchParams(query).toString();
  const tok = token ?? process.env.WEBULL_ACCESS_TOKEN;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(`https://${WEBULL_HOST}${path}${qs ? `?${qs}` : ''}`, {
      method, signal: ctl.signal,
      headers: { ...headers, 'x-version': 'v3', accept: 'application/json', 'x-webull-client-source': 'trading-desk', ...extra, ...(tok ? { 'x-access-token': tok } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let j: any = null; try { j = text ? JSON.parse(text) : null; } catch { /* not json */ }
    if (!r.ok) {
      const msg = j?.message || j?.msg || j?.error_msg || text.slice(0, 160) || `HTTP ${r.status}`;
      throw new ProviderError('webull', `HTTP ${r.status} ${j?.error_code ?? j?.code ?? ''} ${msg}`.replace(/\s+/g, ' ').trim(), r.status >= 500 || r.status === 429);
    }
    return j;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError('webull', (e as Error).name === 'AbortError' ? 'timeout' : (e as Error).message, true);
  } finally { clearTimeout(t); }
}

const call = wbCall;
/* ---- read calls ---- */
export const wbConfig = () => call('GET', '/openapi/config');
export const wbTokenCreate = () => call('POST', '/auth/tokens/create', {}, {});
export const wbTokenCheck = (token: string) => call('POST', '/auth/tokens/check', {}, { token }, token);
export const wbAccounts = () => call('GET', '/trading/accounts/list');
export const wbBalance = (accountId: string) => call('GET', '/trading/assets/balances/get', { account_id: accountId, total_asset_currency: 'USD' });
export const wbPositions = (accountId: string) => call('GET', '/trading/assets/positions/list', { account_id: accountId });
export const wbOrders = (accountId: string, startTime: string, endTime: string, paginationKey?: string) =>
  call('GET', '/trading/orders/historical-orders/list', { account_id: accountId, start_time: startTime, end_time: endTime, ...(paginationKey ? { pagination_key: paginationKey } : {}) });
