// Desk health: what went wrong or slow in this browser (failed or slow /api calls, script errors, long freezes), kept
// in memory for this tab. "Reload all data" uses it: it reloads with every cache skipped, then shows a health report
// you can copy for Claude. Nothing leaves the browser unless you copy it.
export interface ApiHit { path: string; status: number; ms: number; t: number }
export interface HealthState { api: ApiHit[]; errors: { msg: string; t: number }[]; longTasks: number; worstTask: number; since: number }
const st: HealthState = { api: [], errors: [], longTasks: 0, worstTask: 0, since: Date.now() };
export const health = () => st;

export const FRESH_KEY = 'td.fresh';
/** True for a minute after "Reload all data": requests skip every cache. */
export function freshMode(): number | null {
  try { const t = Number(sessionStorage.getItem(FRESH_KEY)); return t && Date.now() - t < 60_000 ? t : null; } catch { return null; }
}
export function reloadAll() {
  try { sessionStorage.setItem(FRESH_KEY, String(Date.now())); sessionStorage.setItem('td.healthAfter', '1'); } catch { /* private mode */ }
  location.reload();
}

export function recordApi(url: string, status: number, ms: number) {
  const u = new URL(url, location.origin), fn = u.searchParams.get('fn');
  st.api.push({ path: `${u.pathname}${fn ? `?fn=${fn}` : ''}`, status, ms: Math.round(ms), t: Date.now() });
  if (st.api.length > 400) st.api.splice(0, st.api.length - 400);
}

export function startHealth() {
  addEventListener('error', (e) => { st.errors.push({ msg: String(e.message || e.error || 'error').slice(0, 200), t: Date.now() }); });
  addEventListener('unhandledrejection', (e) => { st.errors.push({ msg: `Unhandled: ${String((e.reason as Error)?.message ?? e.reason).slice(0, 200)}`, t: Date.now() }); });
  try { new PerformanceObserver((l) => l.getEntries().forEach((x) => { st.longTasks++; st.worstTask = Math.max(st.worstTask, Math.round(x.duration)); })).observe({ type: 'longtask', buffered: true }); } catch { /* not supported */ }
}

export interface Summary { calls: number; failed: { path: string; status: number; n: number }[]; slow: { path: string; ms: number; n: number }[]; errors: string[]; longTasks: number; worstTask: number; avgMs: number }
export function summarize(h: HealthState = st): Summary {
  const by = new Map<string, ApiHit[]>(); for (const a of h.api) by.set(a.path, [...(by.get(a.path) ?? []), a]);
  const failed = [...by].map(([path, xs]) => ({ path, status: xs.filter((x) => x.status >= 400)[0]?.status ?? 0, n: xs.filter((x) => x.status >= 400).length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
  const slow = [...by].map(([path, xs]) => ({ path, ms: Math.max(...xs.map((x) => x.ms)), n: xs.filter((x) => x.ms > 3000).length })).filter((x) => x.n).sort((a, b) => b.ms - a.ms);
  return { calls: h.api.length, failed, slow, errors: [...new Set(h.errors.map((e) => e.msg))].slice(0, 10), longTasks: h.longTasks, worstTask: h.worstTask, avgMs: h.api.length ? Math.round(h.api.reduce((a, b) => a + b.ms, 0) / h.api.length) : 0 };
}
/** A plain-text report to paste into a Claude session or the vault. */
export function reportText(s: Summary, providers: { name: string; state: string; note?: string }[] = []): string {
  const lines = [`# Desk health ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`, `- ${s.calls} data calls, average ${s.avgMs} ms`, `- ${s.longTasks} freezes over 50 ms (worst ${s.worstTask} ms)`];
  if (s.failed.length) lines.push('', '## Failed calls', ...s.failed.map((f) => `- ${f.path}: HTTP ${f.status} (${f.n}x)`));
  if (s.slow.length) lines.push('', '## Slow calls (over 3 s)', ...s.slow.map((f) => `- ${f.path}: up to ${(f.ms / 1000).toFixed(1)} s (${f.n}x)`));
  if (s.errors.length) lines.push('', '## Errors in the page', ...s.errors.map((e) => `- ${e}`));
  const bad = providers.filter((p) => p.state !== 'ok' && p.state !== 'idle');
  if (bad.length) lines.push('', '## Data sources not OK', ...bad.map((p) => `- ${p.name}: ${p.state}${p.note ? ` (${p.note})` : ''}`));
  if (!s.failed.length && !s.slow.length && !s.errors.length && !bad.length) lines.push('', 'Everything looked healthy.');
  return lines.join('\n');
}
