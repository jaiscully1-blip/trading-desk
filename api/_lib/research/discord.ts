// GET /api/research?fn=discord  (needs the desk password header)
// Reads the three channels of Jai's trading server with his bot's token (DISCORD_BOT_TOKEN). Read-only: never posts.
import { DISCORD_CHANNELS, botWatchlist, toMessages, type DcMessage } from '../../../shared/discord.js';
import { parseSecTickers } from '../../../shared/company.js';
import { etDay } from '../../../shared/webull.js';
import { secJson } from '../adapters.js';
import { cached, hasKey, json } from '../core.js';
import { denyPrivate } from '../private.js';

async function channel(id: string, token: string): Promise<{ guild?: string; msgs: any[] }> {
  const head = { authorization: `Bot ${token}`, 'user-agent': 'DiscordBot (https://github.com/jaiscully1-blip/trading-desk, 1.0)' };
  const get = async (path: string) => {
    const r = await fetch(`https://discord.com/api/v10${path}`, { headers: head, signal: AbortSignal.timeout(8000) });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`Discord ${r.status}: ${j?.message ?? 'error'}${r.status === 403 ? ' (give the bot View Channel + Read Message History on this channel)' : ''}`);
    return j;
  };
  const [info, msgs] = await Promise.all([cached(`dc:ch:${id}`, 86400, () => get(`/channels/${id}`)), get(`/channels/${id}/messages?limit=50`)]);
  return { guild: info.val?.guild_id, msgs };
}

export async function GET(req: Request): Promise<Response> {
  const deny = denyPrivate(req);
  if (deny) return deny;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return json({ error: 'Add DISCORD_BOT_TOKEN in Vercel, then redeploy.', code: 'no-token' }, { status: 400 });
  const known = hasKey('sec')
    ? await cached('sec:tickers', 86400, async () => parseSecTickers(await secJson('https://www.sec.gov/files/company_tickers.json'))).then((r) => new Set(r.val.map((t) => t.ticker))).catch(() => undefined)
    : undefined;
  const errors: Record<string, string> = {};
  const all: DcMessage[] = [];
  const res = await cached('dc:all', 45, async () => Promise.all(DISCORD_CHANNELS.map((c) => channel(c.id, token).then((v) => ({ c, v })).catch((e) => ({ c, e: (e as Error).message })))));
  for (const r of res.val) {
    if ('e' in r) { errors[r.c.name] = r.e; continue; }
    all.push(...toMessages(r.v.msgs, r.c.key, r.v.guild, r.c.id, known));
  }
  // message text is empty when the bot lacks the Message Content intent
  const blank = res.val.some((r) => 'v' in r && r.v.msgs.length > 0 && r.v.msgs.every((m: any) => !m.content && !(m.embeds ?? []).length));
  all.sort((a, b) => b.t - a.t);
  const today = etDay(Date.now());
  return json({ messages: all, watchlist: botWatchlist(all, today, etDay), today, channels: DISCORD_CHANNELS, errors, hint: blank ? 'Messages arrived with no text: turn on “Message Content Intent” for the bot in the Discord Developer Portal → Bot.' : undefined, asOf: Date.now(), stale: res.stale, source: 'Discord API (your bot, read-only)' });
}
