// "My links": read an article or YouTube video someone pasted and explain what it means for stocks, the market, money,
// the economy, politics and government. This file holds the pure parts (tested): URL checks, page and caption parsing,
// the prompt and answer schema for Gemini, and the clean-up that keeps the answer inside its rules (no trade instructions).

export type Area = 'stocks' | 'market' | 'money' | 'economy' | 'politics' | 'government' | 'world';
export type Tone = 'positive' | 'negative' | 'mixed' | 'neutral';
export type Dir = 'up' | 'down' | 'mixed' | 'unclear';
export const AREAS: Area[] = ['stocks', 'market', 'money', 'economy', 'politics', 'government', 'world'];
export const AREA_LABEL: Record<Area, string> = { stocks: 'Stocks', market: 'Market', money: 'Money & rates', economy: 'Economy', politics: 'Politics', government: 'Government', world: 'World' };

export interface LinkAnalysis {
  summary: string;
  keyPoints: string[];
  effects: { area: Area; tone: Tone; text: string }[];
  tickers: { sym: string; effect: Dir; why: string }[];
  sectors: { name: string; effect: Dir; why: string }[];
  timeframe: 'hours' | 'days' | 'weeks' | 'months';
  confidence: 'low' | 'medium' | 'high';
  opinion: boolean;
  watch: string[];
  caveats: string;
}

export interface LinkRead {
  url: string; kind: 'article' | 'youtube'; title: string; source: string; published: string | null;
  textChars: number; transcript: 'captions' | 'pasted' | 'none'; needsTranscript: boolean;
  analysis: LinkAnalysis; model: string; at: number;
}

/** http(s) link to a public host only (never the desk's own network, localhost or a raw private address). */
export function publicUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string') return null;
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h.includes('.') || h === 'localhost' || /\.(local|internal|localhost|lan|home|corp)$/.test(h)) return null;
  if (/^(\d+\.){3}\d+$/.test(h) && privateIp(h)) return null;
  if (h.includes(':')) return null; // raw IPv6
  if (u.port && !['80', '443'].includes(u.port)) return null;
  return u;
}

/** Private, loopback, link-local or reserved address (checked again after DNS so a public name can't point inside). */
export function privateIp(ip: string): boolean {
  if (ip.includes(':')) { const v = ip.toLowerCase(); return v === '::1' || v === '::' || /^(fc|fd|fe8|fe9|fea|feb)/.test(v) || v.startsWith('::ffff:') && privateIp(v.slice(7)); }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** YouTube video id from watch, youtu.be, shorts, live and embed links. */
export function youTubeId(u: URL): string | null {
  const h = u.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (h === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (h === 'youtube.com' || h === 'youtube-nocookie.com') id = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})/)?.[1] ?? null;
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…' };
export const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
  return ENT[e.toLowerCase()] ?? m;
});
const strip = (s: string) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const meta = (html: string, name: string) => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  return tag ? decode(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? '').trim() : '';
};

/** Title, source, date and readable text of a news page (paragraphs inside <article> when there is one). */
export function extractArticle(html: string, host: string, max = 14000): { title: string; source: string; published: string | null; text: string } {
  const clean = html.replace(/<(script|style|noscript|svg|nav|footer|header|aside|form)[\s\S]*?<\/\1>/gi, ' ');
  const title = meta(html, 'og:title') || strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '') || host;
  const source = meta(html, 'og:site_name') || host.replace(/^www\./, '');
  const published = meta(html, 'article:published_time') || html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1] || null;
  const scope = clean.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? clean;
  const paras = [...scope.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => strip(m[1])).filter((p) => p.length > 40);
  let text = paras.join('\n');
  const desc = meta(html, 'og:description') || meta(html, 'description');
  if (text.length < 300 && desc) text = `${desc}\n${text}`.trim();
  return { title: title.slice(0, 300), source: source.slice(0, 80), published, text: text.slice(0, max) };
}

/** Pieces of a YouTube watch page: title, channel, description and the caption track to try (English first). */
export function parseWatchPage(html: string): { title: string; channel: string; description: string; captionUrl: string | null } {
  const m = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;\s*(?:var\s|<\/script>)/);
  let j: any = null;
  try { j = m ? JSON.parse(m[1]) : null; } catch { j = null; }
  const vd = j?.videoDetails ?? {};
  const tracks: any[] = j?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const pick = tracks.find((t) => /^en/.test(t?.languageCode) && t?.kind !== 'asr') ?? tracks.find((t) => /^en/.test(t?.languageCode)) ?? tracks[0];
  const captionUrl = typeof pick?.baseUrl === 'string' && /^https:\/\/www\.youtube\.com\/api\/timedtext/.test(pick.baseUrl) ? pick.baseUrl : null;
  return { title: String(vd.title ?? '').slice(0, 300), channel: String(vd.author ?? '').slice(0, 80), description: String(vd.shortDescription ?? '').slice(0, 4000), captionUrl };
}

/** Caption XML (<text start=..>line</text>) to plain text. */
export const parseCaptions = (xml: string, max = 16000) => [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => decode(decode(m[1])).replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ').slice(0, max);

export const LINK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    keyPoints: { type: 'ARRAY', items: { type: 'STRING' } },
    effects: { type: 'ARRAY', items: { type: 'OBJECT', properties: { area: { type: 'STRING', enum: AREAS }, tone: { type: 'STRING', enum: ['positive', 'negative', 'mixed', 'neutral'] }, text: { type: 'STRING' } }, required: ['area', 'tone', 'text'] } },
    tickers: { type: 'ARRAY', items: { type: 'OBJECT', properties: { sym: { type: 'STRING' }, effect: { type: 'STRING', enum: ['up', 'down', 'mixed', 'unclear'] }, why: { type: 'STRING' } }, required: ['sym', 'effect', 'why'] } },
    sectors: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, effect: { type: 'STRING', enum: ['up', 'down', 'mixed', 'unclear'] }, why: { type: 'STRING' } }, required: ['name', 'effect', 'why'] } },
    timeframe: { type: 'STRING', enum: ['hours', 'days', 'weeks', 'months'] },
    confidence: { type: 'STRING', enum: ['low', 'medium', 'high'] },
    opinion: { type: 'BOOLEAN' },
    watch: { type: 'ARRAY', items: { type: 'STRING' } },
    caveats: { type: 'STRING' },
  },
  required: ['summary', 'keyPoints', 'effects', 'tickers', 'sectors', 'timeframe', 'confidence', 'opinion', 'watch', 'caveats'],
};

export function linkPrompt(o: { kind: 'article' | 'youtube'; title: string; source: string; published: string | null; text: string; today: string }): string {
  return `You explain news to a retail trader in plain English. Read the ${o.kind === 'youtube' ? 'video (title, description and transcript)' : 'article'} below and say what it is about and how it could affect US stocks, the overall market, money (interest rates, the dollar, bonds, oil, gold, crypto), the economy, politics, government and world affairs.
Rules:
- Use only what the text says plus widely known background. If the text is thin (headline only, no transcript), say so in caveats and set confidence low.
- Include only the areas that this news really touches (effects), 1 to 2 sentences each, tone from the point of view of that area.
- tickers: up to 8 US-listed tickers clearly affected (the companies named, or the obvious ones for the sector), each with effect up / down / mixed / unclear and a short reason. No made-up tickers.
- sectors: up to 6.
- Describe possible effects with words like "could" or "may". Never tell anyone to buy, sell, short, enter or exit anything; no price targets, no position sizes, no trade ideas.
- opinion = true if it is an opinion piece, an ad, or a sponsored video.
- watch: up to 3 things that would confirm or undo the effect (a data release, a vote, a date, a company report).
- summary: 3 to 4 sentences. keyPoints: up to 5 short bullets.
Today is ${o.today}.
Title: ${o.title}
Source: ${o.source}${o.published ? `\nPublished: ${o.published}` : ''}
---
${o.text || '(no readable text: only the title above)'}`;
}

// advice-shaped sentences only: "Microsoft agreed to buy Activision" stays, "investors should buy the dip" goes
const TRADE_TALK = /\b(you should|investors should|traders should|consider (buying|selling|shorting)|time to (buy|sell)|good time to (buy|sell)|buy the dip|sell the rip|price target|stop[- ]loss|take profits?|go (long|short)|load up on|(buy|sell|short) (it|this|now|shares of|calls|puts))\b/i;
const one = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);
const txt = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
/** Keep the model's answer inside the schema and the desk's rules; sentences that read as trade instructions are dropped. */
export function cleanAnalysis(d: any): LinkAnalysis {
  const safe = (s: string) => s.split(/(?<=[.!?])\s+/).filter((x) => !TRADE_TALK.test(x)).join(' ').trim();
  const list = (v: unknown, n: number, len: number) => (Array.isArray(v) ? v.map((x) => safe(txt(x, len))).filter(Boolean).slice(0, n) : []);
  const dirs = ['up', 'down', 'mixed', 'unclear'] as const;
  return {
    summary: safe(txt(d?.summary, 1200)),
    keyPoints: list(d?.keyPoints, 5, 240),
    effects: (Array.isArray(d?.effects) ? d.effects : []).map((e: any) => ({ area: one(e?.area, AREAS, 'market'), tone: one(e?.tone, ['positive', 'negative', 'mixed', 'neutral'] as const, 'neutral'), text: safe(txt(e?.text, 400)) }))
      .filter((e: { text: string }) => e.text).filter((e: { area: Area }, i: number, a: { area: Area }[]) => a.findIndex((x) => x.area === e.area) === i),
    tickers: (Array.isArray(d?.tickers) ? d.tickers : []).map((t: any) => ({ sym: txt(t?.sym, 12).toUpperCase().replace(/^\$/, ''), effect: one(t?.effect, dirs, 'unclear'), why: safe(txt(t?.why, 200)) }))
      .filter((t: { sym: string }) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(t.sym)).slice(0, 8),
    sectors: (Array.isArray(d?.sectors) ? d.sectors : []).map((t: any) => ({ name: txt(t?.name, 50), effect: one(t?.effect, dirs, 'unclear'), why: safe(txt(t?.why, 200)) })).filter((t: { name: string }) => t.name).slice(0, 6),
    timeframe: one(d?.timeframe, ['hours', 'days', 'weeks', 'months'] as const, 'days'),
    confidence: one(d?.confidence, ['low', 'medium', 'high'] as const, 'low'),
    opinion: d?.opinion === true,
    watch: list(d?.watch, 3, 200),
    caveats: safe(txt(d?.caveats, 400)),
  };
}
