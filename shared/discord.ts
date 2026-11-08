// Discord channel messages -> desk messages with the tickers they mention. Text only comes from the messages themselves.

export const DISCORD_CHANNELS = [
  { id: '1567057446168690849', key: 'before', name: 'read-before-trading' },
  { id: '1567005527068639284', key: 'resp', name: 'trade-responsibility' },
  { id: '1567226864760782908', key: 'review', name: 'after-close-review' },
  // Jai sent this as "tom". It is read as a channel; if Discord says it isn't one, it is treated as Tom the bot's user ID.
  { id: '1567956786181308526', key: 'tom', name: 'tom' },
] as const;
export const TOM_ID = '1567956786181308526';
export type ChannelKey = (typeof DISCORD_CHANNELS)[number]['key'];

export interface DcMessage { id: string; ch: ChannelKey; t: number; author: string; tom?: boolean; bot: boolean; text: string; tickers: string[]; url: string }

/** Content plus any embed titles, descriptions and fields (bots usually post embeds). */
export function messageText(m: any): string {
  const parts: string[] = [];
  if (m?.content) parts.push(String(m.content));
  for (const e of m?.embeds ?? []) {
    if (e.title) parts.push(String(e.title));
    if (e.description) parts.push(String(e.description));
    for (const f of e.fields ?? []) parts.push(`${f.name}: ${f.value}`);
    if (e.footer?.text) parts.push(String(e.footer.text));
  }
  return parts.join('\n').trim();
}

const STOP = new Set(['A', 'I', 'AM', 'PM', 'ET', 'EST', 'EDT', 'CEO', 'CFO', 'USA', 'US', 'IPO', 'ETF', 'EPS', 'GDP', 'CPI', 'PPI', 'FOMC', 'FED', 'SEC', 'ATH', 'ATR', 'RSI', 'EMA', 'SMA', 'VWAP', 'MACD', 'PNL', 'P', 'L', 'R', 'TP', 'SL', 'OK', 'NO', 'YES', 'BUY', 'SELL', 'LONG', 'SHORT', 'CALL', 'CALLS', 'PUT', 'PUTS', 'HOD', 'LOD', 'PDH', 'PDL', 'AI', 'IT', 'ON', 'AT', 'TO', 'BE', 'OR', 'IF', 'IN', 'OF', 'BY', 'UP', 'GO', 'SO', 'DD', 'TA', 'FA', 'NEW', 'ALL', 'NOW', 'DAY', 'THE', 'AND', 'FOR', 'NOT', 'OUT', 'ARE', 'HAS', 'WAS', 'TOP', 'LOW', 'HIGH', 'RISK', 'NOTE', 'NEWS', 'PLAN', 'STOP', 'GAP', 'EOD', 'YTD', 'QTD', 'MTD', 'DTE', 'OTM', 'ITM', 'ATM', 'IV', 'OI', 'API', 'BOT', 'TBD', 'FYI', 'IMO']);

/** $TICKER cashtags always count; bare CAPS words count only when they are real listed tickers. */
export function tickersIn(text: string, known?: Set<string>): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\$([A-Za-z]{1,5}(?:\.[A-Za-z])?)\b/g)) out.add(m[1].toUpperCase());
  if (known) for (const m of text.matchAll(/\b([A-Z]{1,5})\b/g)) if (!STOP.has(m[1]) && known.has(m[1])) out.add(m[1]);
  return [...out];
}

export function toMessages(raw: any[], ch: ChannelKey, guild: string | undefined, channelId: string, known?: Set<string>): DcMessage[] {
  return (Array.isArray(raw) ? raw : []).map((m) => {
    const text = messageText(m);
    return {
      id: String(m.id), ch, t: Date.parse(m.timestamp), author: m.author?.global_name || m.author?.username || 'unknown', ...(m.author?.id === TOM_ID ? { tom: true } : {}), bot: !!m.author?.bot,
      text, tickers: tickersIn(text, known), url: guild ? `https://discord.com/channels/${guild}/${channelId}/${m.id}` : '',
    };
  }).filter((m) => m.text && Number.isFinite(m.t));
}

/** Tickers the bot named today, most-mentioned first: the desk's "bot watchlist". */
export function botWatchlist(msgs: DcMessage[], day: string, etDay: (t: number) => string): { sym: string; n: number; first: number }[] {
  const tally = new Map<string, { sym: string; n: number; first: number }>();
  for (const m of msgs) {
    if (m.ch !== 'before' || etDay(m.t) !== day) continue;
    for (const s of m.tickers) { const v = tally.get(s) ?? { sym: s, n: 0, first: m.t }; v.n++; v.first = Math.min(v.first, m.t); tally.set(s, v); }
  }
  return [...tally.values()].sort((a, b) => b.n - a.n || a.first - b.first);
}

/** Discord markdown for display: drop the ** __ ~~ ` markers, custom emoji / mention tags and divider lines (text stays as written). */
export function cleanDiscord(text: string): string {
  return text
    .replace(/<a?:(\w+):\d+>/g, ':$1:')
    .replace(/<@[!&]?\d+>/g, '@user').replace(/<#\d+>/g, '#channel')
    .replace(/(\*\*|__|~~|`{1,3})/g, '')
    .split('\n').filter((l) => !/^\s*[-_=*]{3,}\s*$/.test(l)).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}
