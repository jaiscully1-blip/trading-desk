// News: RSS/Atom parsing, de-duplication, ticker/macro tagging and a rough keyword sentiment.
// Sentiment here is keyword-based and labeled as such; the AI headline scorer replaces it in Milestone 10.

export interface NewsItem {
  id: string;
  t: number; // ms epoch
  title: string;
  src: string;
  url: string;
  syms: string[];
  macro: boolean;
  sentiment: -1 | 0 | 1;
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#8217': '’', '#8216': '‘', '#8220': '“', '#8221': '”', '#8212': '—', '#8211': '–' };
export const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#?\w+);/g, (m, e: string) => ENT[e] ?? (e.startsWith('#x') ? String.fromCodePoint(parseInt(e.slice(2), 16)) : e.startsWith('#') ? String.fromCodePoint(+e.slice(1)) : m))
    .replace(/\s+/g, ' ')
    .trim();

const tag = (block: string, name: string) => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return m ? decode(m[1]) : '';
};

/** Parse RSS 2.0 <item> or Atom <entry> blocks without a DOM (runs in serverless functions). */
export function parseFeed(xml: string, src: string): { title: string; url: string; t: number; src: string }[] {
  const out: { title: string; url: string; t: number; src: string }[] = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  for (const b of blocks) {
    const title = tag(b, 'title');
    let url = tag(b, 'link');
    if (!url) url = /<link[^>]*href="([^"]+)"/i.exec(b)?.[1] ?? '';
    const when = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
    const t = Date.parse(when);
    if (title && Number.isFinite(t)) out.push({ title, url, t, src });
  }
  return out;
}

const POS = /\b(beats?|tops|raises?d?|upgraded?|surges?|soars?|jumps?|record high|approv(al|ed|es)|wins?|awarded|buyback|repurchase|strong(er)?|rall(y|ies)|gains?|outperform|bullish|expands?|partnership|accelerat\w+|boosts?|lifts?|climbs?|beats estimates)\b/gi;
const NEG = /\b(miss(es|ed)?|cuts? (guidance|outlook|forecast)|lowers?|downgraded?|plunges?|falls?|drops?|slumps?|sinks?|tumbles?|probe|investigation|lawsuit|sued|recall|warns?|weak(er|ness)?|layoffs?|halts?|delays?|bearish|offering|dilut\w+|shelf registration|bankrupt\w*|fraud|charges|slashes|default|downturn|recession|selloff|sell-off|crash\w*)\b/gi;

export function keywordSentiment(title: string): -1 | 0 | 1 {
  const p = title.match(POS)?.length ?? 0;
  const n = title.match(NEG)?.length ?? 0;
  return p > n ? 1 : n > p ? -1 : 0;
}

const MACRO = /\b(Fed|FOMC|Powell|Federal Reserve|inflation|CPI|PPI|PCE|jobs report|payrolls|nonfarm|unemployment|jobless|Treasur(y|ies)|yields?|GDP|recession|tariffs?|rate (cut|hike)s?|interest rates?|economy|economic|oil prices?|OPEC|dollar|ECB|BOJ|central bank)\b/i;
export const isMacro = (title: string, src: string) => /federal reserve|bls|bureau of labor/i.test(src) || MACRO.test(title);

// Tickers that are also common English words: only match them with a $ prefix.
const AMBIGUOUS = new Set(['A', 'ALL', 'ARE', 'AI', 'IT', 'ON', 'OR', 'BE', 'CAN', 'GO', 'NOW', 'ONE', 'SO', 'HAS', 'SEE', 'TWO', 'KEY', 'NEW', 'BIG', 'OPEN', 'CASH', 'LOW', 'HIGH', 'RUN', 'FUN', 'CAR', 'EAT', 'PLAY', 'TRUE', 'REAL', 'MAIN', 'BEST', 'WELL', 'U', 'F', 'T', 'C', 'X', 'V', 'D', 'O', 'K', 'GDP', 'CPI', 'PPI', 'PCE', 'ECB', 'BOJ', 'FED']);

/** Tag a headline with tickers: explicit symbols, $TICKER, a plain ticker word, or the company's first name word. */
export function tagSymbols(title: string, symbols: string[], names: Record<string, string> = {}, explicit: string[] = []): string[] {
  const out = new Set(explicit.filter((s) => symbols.includes(s)));
  for (const s of symbols) {
    const esc = s.replace(/[.\-]/g, '\\$&');
    if (new RegExp(`\\$${esc}\\b`).test(title)) { out.add(s); continue; }
    if (!AMBIGUOUS.has(s) && s.length >= 2 && new RegExp(`(^|[^A-Za-z$])${esc}([^A-Za-z]|$)`).test(title)) { out.add(s); continue; }
    const word = (names[s] ?? '').split(/[\s,.]+/).find((w) => w.length >= 4 && !/^(the|corp|inc|holdings|group|company|technologies|platforms)$/i.test(w));
    if (word && new RegExp(`\\b${word.replace(/[^A-Za-z0-9]/g, '')}\\b`, 'i').test(title)) out.add(s);
  }
  return [...out];
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90);

/** Merge sources, drop duplicate headlines (same text from two feeds), newest first. */
export function mergeNews(items: NewsItem[], max = 250): NewsItem[] {
  const seen = new Map<string, NewsItem>();
  for (const it of items.sort((a, b) => b.t - a.t)) {
    const k = norm(it.title);
    const prev = seen.get(k);
    if (!prev) seen.set(k, it);
    else prev.syms = [...new Set([...prev.syms, ...it.syms])];
  }
  return [...seen.values()].slice(0, max);
}

/** Bar index a headline "hit": the bar containing it, or the next bar after a closed session. -1 if outside the series. */
export function barIndexFor(barTimes: number[], period: number, enc: number): number {
  if (!barTimes.length || enc < barTimes[0]) return -1;
  let lo = 0, hi = barTimes.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (barTimes[mid] + period > enc) { ans = mid; hi = mid - 1; } else lo = mid + 1;
  }
  return ans;
}
