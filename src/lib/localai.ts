// Local AI through Ollama running on your own computer (http://localhost:11434). Free, private, no per-token cost.
// The browser talks to Ollama directly; nothing goes through the desk's server. Settings stay in this browser.
import { useSyncExternalStore } from 'react';
import { load, save } from './store';

export interface AiCfg { url: string; models: Record<AiRole, string> }
export type AiRole = 'news' | 'math';
export const ROLE_LABEL: Record<AiRole, string> = { news: 'News and filings summaries', math: 'Quick math and risk checks' };
const KEY = 'localAi';
let cfg: AiCfg = load<AiCfg>(KEY, { url: 'http://localhost:11434', models: { news: '', math: '' } });
const subs = new Set<() => void>();
export const setAiCfg = (c: AiCfg) => { cfg = c; save(KEY, c); subs.forEach((f) => f()); };
export const useAiCfg = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => cfg);

/** Installed models, or an error that says what to fix. */
export async function listModels(url = cfg.url): Promise<{ models: { name: string; size: number }[] } | { error: string }> {
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return { error: `Ollama answered HTTP ${r.status}` };
    const j = await r.json();
    return { models: (j.models ?? []).map((m: any) => ({ name: String(m.name), size: Number(m.size) || 0 })) };
  } catch {
    return { error: location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'Ollama is not running (open the Ollama app).' : 'Could not reach Ollama from this site. Allow this site in Ollama (step 3), use Chrome, or open the desk locally.' };
  }
}

/** One chat turn; streams text into onText. Returns the whole answer. */
export async function askLocal(role: AiRole, system: string, user: string, onText?: (t: string) => void, signal?: AbortSignal): Promise<string> {
  const model = cfg.models[role];
  if (!model) throw new Error('Pick a model for this job in Local AI settings (Data status page).');
  const r = await fetch(`${cfg.url.replace(/\/$/, '')}/api/chat`, { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, stream: true, options: { temperature: 0.2 }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
  if (!r.ok || !r.body) throw new Error(`Ollama HTTP ${r.status}`);
  const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', out = '';
  for (;;) {
    const { value, done } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue; try { const j = JSON.parse(line); if (j.message?.content) { out += j.message.content; onText?.(out); } } catch { /* partial line */ } }
  }
  return out;
}
