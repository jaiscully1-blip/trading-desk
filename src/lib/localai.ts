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
  if (!model) throw new Error('Pick a model for this job in Local AI settings (AI page).');
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

// ---- Everything running on this Mac, for the AI page. Read-only: lists models and what is loaded; nothing is sent to them. ----
export interface OllamaModel { name: string; size: number; family: string; params: string; quant: string; modified: string }
export interface OllamaRun { name: string; size: number; vram: number; expires: string }
export interface OllamaLive { version: string; models: OllamaModel[]; running: OllamaRun[] }
const get = async (url: string, path: string, ms = 4000) => { const r = await fetch(`${url.replace(/\/$/, '')}${path}`, { signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };

/** Ollama's full picture: version, every installed model with its details, and which are loaded in memory right now. */
export async function ollamaLive(url = cfg.url): Promise<OllamaLive | { error: string }> {
  try {
    const [tags, ps, ver] = await Promise.all([get(url, '/api/tags'), get(url, '/api/ps').catch(() => ({ models: [] })), get(url, '/api/version').catch(() => ({}))]);
    return {
      version: String(ver.version ?? ''),
      models: (tags.models ?? []).map((m: any) => ({ name: String(m.name), size: Number(m.size) || 0, family: String(m.details?.family ?? ''), params: String(m.details?.parameter_size ?? ''), quant: String(m.details?.quantization_level ?? ''), modified: String(m.modified_at ?? '') })),
      running: (ps.models ?? []).map((m: any) => ({ name: String(m.name), size: Number(m.size) || 0, vram: Number(m.size_vram) || 0, expires: String(m.expires_at ?? '') })),
    };
  } catch { return { error: 'Not reachable. Open the Ollama app; from the live site also allow this site (OLLAMA_ORIGINS) and use Chrome.' }; }
}

/** Other local apps that speak the common OpenAI-style API. Each is checked on its usual port. */
export const OTHER_LOCAL: { id: string; label: string; url: string; tip: string }[] = [
  { id: 'lmstudio', label: 'LM Studio', url: 'http://localhost:1234', tip: 'Developer tab: start the server and turn on "Enable CORS".' },
  { id: 'jan', label: 'Jan', url: 'http://localhost:1337', tip: 'Settings, Local API Server: start it and allow CORS.' },
  { id: 'llamacpp', label: 'llama.cpp / llamafile', url: 'http://localhost:8080', tip: 'Start llama-server (it allows browser access by default).' },
  { id: 'gpt4all', label: 'GPT4All', url: 'http://localhost:4891', tip: 'Settings: turn on "Enable Local API Server".' },
  { id: 'vllm', label: 'vLLM / LocalAI', url: 'http://localhost:8000', tip: 'Start the server with CORS allowed for this site.' },
];
export async function probeOpenAi(url: string): Promise<{ models: string[] } | { error: string }> {
  try { const j = await get(url, '/v1/models', 1500); return { models: (j.data ?? []).map((m: any) => String(m.id)) }; } catch { return { error: 'not running' }; }
}
