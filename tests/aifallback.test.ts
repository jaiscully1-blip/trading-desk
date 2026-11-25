// Free AI fallback: Gemini first, then Groq, then OpenRouter. Network is mocked; no keys or real calls.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SCHEMA = { type: 'object', properties: { summary: { type: 'string' } } };
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const groqAnswer = ok({ choices: [{ message: { content: '{"summary":"from groq"}' } }] });

describe('geminiJson free fallbacks', () => {
  const env = { ...process.env };
  beforeEach(() => { vi.resetModules(); delete process.env.GEMINI_API_KEY; delete process.env.GROQ_API_KEY; delete process.env.OPENROUTER_API_KEY; delete process.env.GEMINI_MODEL; delete process.env.GROQ_MODEL; });
  afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); });

  it('uses Groq when Gemini answers 404, and keeps Google\'s reason', async () => {
    process.env.GEMINI_API_KEY = 'g'; process.env.GROQ_API_KEY = 'q';
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('generativelanguage')) return new Response(JSON.stringify({ error: { message: 'models/x is not found' } }), { status: 404 });
      return groqAnswer.clone();
    }));
    const { geminiJson } = await import('../api/_lib/adapters');
    const r = await geminiJson('hi', SCHEMA);
    expect(r.data.summary).toBe('from groq');
    expect(r.model).toMatch(/^groq /);
    expect(calls.some((u) => u.includes('api.groq.com'))).toBe(true);
  });

  it('works with only a Groq key', async () => {
    process.env.GROQ_API_KEY = 'q';
    vi.stubGlobal('fetch', vi.fn(async () => groqAnswer.clone()));
    const { geminiJson, hasAi } = await import('../api/_lib/adapters');
    expect(hasAi()).toBe(true);
    expect((await geminiJson('hi', SCHEMA)).data.summary).toBe('from groq');
  });

  it('says which keys to add when none are set', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { geminiJson, hasAi } = await import('../api/_lib/adapters');
    expect(hasAi()).toBe(false);
    await expect(geminiJson('hi', SCHEMA)).rejects.toThrow(/GROQ_API_KEY/);
  });

  it('error text includes the source reason on a 404', async () => {
    process.env.GEMINI_API_KEY = 'g';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'models/x is not found for API version v1beta' } }), { status: 404 })));
    const { geminiJson } = await import('../api/_lib/adapters');
    await expect(geminiJson('hi', SCHEMA)).rejects.toThrow(/HTTP 404: models\/x is not found/);
  });
});
