// POST /api/research?fn=linkread  { url, transcript? } -> what an article or YouTube video says and how it could affect
// stocks, the market, money, the economy, politics and government (Gemini free tier). Answers are cached per link for a day,
// so the same link added by several people costs one call. Pages are fetched only from public hosts, checked again after
// DNS and on every redirect. A best-effort cap per caller keeps one person from using up the shared free quota.
import { lookup } from 'node:dns/promises';
import { geminiJson } from '../adapters.js';
import { cached, hasKey, json, take } from '../core.js';
import { LINK_SCHEMA, cleanAnalysis, extractArticle, linkPrompt, parseCaptions, parseWatchPage, privateIp, publicUrl, youTubeId, type LinkRead } from '../../../shared/linkread.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX_BYTES = 2_500_000;
const PER_CALLER_DAY = 40;
const calls = new Map<string, { day: string; n: number }>();

async function safeFetch(start: URL, timeoutMs = 9000): Promise<{ text: string; url: URL }> {
  let u = start;
  for (let hop = 0; hop < 4; hop++) {
    const addrs = await lookup(u.hostname, { all: true }).catch(() => []);
    if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new Error('That address is not reachable from the desk.');
    const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'en-US,en;q=0.9' } });
    if (r.status >= 300 && r.status < 400) {
      const next = publicUrl(new URL(r.headers.get('location') ?? '', u).toString());
      if (!next) throw new Error('The link redirects somewhere the desk will not follow.');
      u = next; continue;
    }
    if (!r.ok) throw new Error(r.status === 403 || r.status === 401 ? 'The site blocked the desk from reading it (paywall or bot check).' : `The site answered HTTP ${r.status}.`);
    const reader = r.body?.getReader();
    if (!reader) return { text: '', url: u };
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); size += value.length; if (size > MAX_BYTES) { await reader.cancel(); break; } }
    return { text: new TextDecoder().decode(Buffer.concat(chunks)), url: u };
  }
  throw new Error('Too many redirects.');
}

async function readYouTube(id: string, pasted: string) {
  const watch = new URL(`https://www.youtube.com/watch?v=${id}&hl=en`);
  let page = { title: '', channel: '', description: '', captionUrl: null as string | null };
  try { page = parseWatchPage((await safeFetch(watch)).text); } catch { /* fall back to oEmbed below */ }
  if (!page.title) {
    try {
      const o = await (await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch.toString())}`, { signal: AbortSignal.timeout(6000) })).json();
      page.title = String(o?.title ?? '').slice(0, 300); page.channel = String(o?.author_name ?? '').slice(0, 80);
    } catch { /* title stays empty */ }
  }
  let captions = '';
  if (!pasted && page.captionUrl) { try { captions = parseCaptions((await safeFetch(new URL(page.captionUrl), 6000)).text); } catch { /* YouTube often refuses servers */ } }
  const transcript = pasted ? 'pasted' as const : captions ? 'captions' as const : 'none' as const;
  const body = [page.description && `Description: ${page.description}`, (pasted || captions) && `Transcript: ${(pasted || captions).slice(0, 16000)}`].filter(Boolean).join('\n\n');
  return { title: page.title || 'YouTube video', source: page.channel ? `${page.channel} (YouTube)` : 'YouTube', published: null, text: body, transcript, needsTranscript: transcript === 'none' };
}

export async function POST(req: Request): Promise<Response> {
  if (!hasKey('gemini')) return json({ error: 'The link reader needs GEMINI_API_KEY in Vercel (free at aistudio.google.com).', code: 'no-key' }, { status: 400 });
  const body = await req.json().catch(() => null);
  const u = publicUrl(body?.url);
  if (!u) return json({ error: 'Paste a full web link (https://…) to a public page.' }, { status: 400 });
  const pasted = typeof body?.transcript === 'string' ? body.transcript.replace(/\s+/g, ' ').trim().slice(0, 16000) : '';
  const yt = youTubeId(u);
  const key = `link:${yt ? `yt:${yt}` : u.toString()}:${pasted ? pasted.length + ':' + pasted.slice(0, 40) : ''}`;

  // cap per caller per day (best effort: counts live in this server instance)
  const who = (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  const day = new Date().toISOString().slice(0, 10);
  const c = calls.get(who);
  const n = c?.day === day ? c.n : 0;

  try {
    const { val } = await cached<LinkRead>(key, 86400, async () => {
      if (n >= PER_CALLER_DAY) throw Object.assign(new Error(`Daily limit reached (${PER_CALLER_DAY} new links). It resets at midnight UTC.`), { status: 429 });
      if (!take('gemini')) throw Object.assign(new Error('The free AI quota is busy right now. Try again in a minute.'), { status: 429 });
      calls.set(who, { day, n: n + 1 });
      const src = yt ? await readYouTube(yt, pasted) : await (async () => {
        const { text, url } = await safeFetch(u);
        const a = extractArticle(text, url.hostname);
        return { ...a, text: pasted ? `${a.text}\n${pasted}` : a.text, transcript: 'none' as const, needsTranscript: false };
      })();
      const { data, model } = await geminiJson(linkPrompt({ kind: yt ? 'youtube' : 'article', title: src.title, source: src.source, published: src.published, text: src.text, today: day }), LINK_SCHEMA);
      return { url: u.toString(), kind: yt ? 'youtube' : 'article', title: src.title, source: src.source, published: src.published, textChars: src.text.length, transcript: src.transcript, needsTranscript: src.needsTranscript, analysis: cleanAnalysis(data), model, at: Date.now() };
    });
    return json(val);
  } catch (e) {
    const err = e as Error & { status?: number };
    return json({ error: err.message.replace(/https?:\/\/\S+/g, '').slice(0, 300) }, { status: err.status ?? 502 });
  }
}
