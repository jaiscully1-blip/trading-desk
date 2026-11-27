// Free YouTube live streams for the Messages video player (and its floating window). allDay = the channel runs a 24/7
// stream, so it is always offered: by its live video when the server confirmed one, else through YouTube's own
// "this channel's live stream" embed. Event channels (government, Reuters, CNBC...) show only when the server finds them live.
// Checked 2026-11-26 in a browser: every allDay channel plays, Sky News and both ABC channels only by their known 24/7 video
// (their channel embed says "unavailable"). CNBC and Fox Business have no free 24/7 stream.

export interface Channel { name: string; handle: string; id: string; allDay: boolean; group: 'Markets' | 'World news' | 'Government'; /** a known 24/7 video, for channels whose channel embed shows "unavailable" */ video?: string }
export const CHANNELS: Channel[] = [
  { name: 'Bloomberg TV', handle: 'markets', id: 'UCIALMKvObZNtJ6AmdCLP7Lg', allDay: true, group: 'Markets' },
  { name: 'Yahoo Finance', handle: 'YahooFinance', id: 'UCEAZeUIeJs0IjQiqTCdVSIg', allDay: true, group: 'Markets' },
  { name: 'Schwab Network', handle: 'SchwabNetwork', id: 'UCqoSrYgusd8ZddtMoWhjHYA', allDay: false, group: 'Markets' },
  { name: 'CNBC', handle: 'CNBCtelevision', id: 'UCrp_UI8XtuYfpiqluWLD7Lw', allDay: false, group: 'Markets' },
  { name: 'Fox Business', handle: 'FoxBusiness', id: '', allDay: false, group: 'Markets' },
  { name: 'Reuters', handle: 'Reuters', id: 'UChqUTb7kYRX8-EiaN3XFrSQ', allDay: false, group: 'World news' },
  { name: 'Sky News', handle: 'SkyNews', id: 'UCoMdktPbSTixAyNGwb-UYkQ', allDay: true, group: 'World news', video: '53SxFKpbKDE' }, // its channel embed says unavailable; this 24/7 stream plays (checked 2026-11-26)
  { name: 'Al Jazeera English', handle: 'aljazeeraenglish', id: 'UCNye-wNBqNL5ZzHSJj3l8Bg', allDay: true, group: 'World news' },
  { name: 'DW News', handle: 'dwnews', id: 'UCknLrEdhRCp1aegoMqRaCZg', allDay: true, group: 'World news' },
  { name: 'France 24', handle: 'France24_en', id: 'UCQfwfsi5VrQ8yKZ-UWmAEFg', allDay: true, group: 'World news' },
  { name: 'NBC News NOW', handle: 'NBCNews', id: 'UCeY0bbntWzzVIaj2z3QigXg', allDay: true, group: 'World news' },
  { name: 'ABC News Live', handle: 'ABCNews', id: 'UCBi2mrWuNuyYy4gbM6fU18Q', allDay: true, group: 'World news', video: '0HDN5-2M1VE' },
  { name: 'CBS News 24/7', handle: 'CBSNews', id: 'UC8p1vwvWtl6T73JiExfWs1g', allDay: false, group: 'World news' },
  { name: 'LiveNOW from FOX', handle: 'LiveNOWFOX', id: 'UCJg9wBPyKMNA5sRDnvzmkdg', allDay: false, group: 'World news' }, // runs event streams, no fixed 24/7 one
  { name: 'Euronews', handle: 'euronews', id: 'UCSrZ3UV4jOidv8ppoVuvW9Q', allDay: true, group: 'World news' },
  { name: 'TRT World', handle: 'trtworld', id: 'UC7fWeaHhqgM4Ry-RMpM2YYw', allDay: true, group: 'World news' },
  { name: 'NHK World-Japan', handle: 'NHKWORLDJAPAN', id: 'UCSPEjw8F2nQDtmUKPFNF7_A', allDay: true, group: 'World news' },
  { name: 'ABC News Australia', handle: 'abcnewsaustralia', id: 'UCVgO39Bk5sMo66-6o6Spn6Q', allDay: true, group: 'World news', video: 'vOTiJkg1voo' },
  { name: 'White House', handle: 'WhiteHouse', id: 'UCYxRlFDqcWM4y7FfpiAN3KQ', allDay: false, group: 'Government' },
  { name: 'Federal Reserve', handle: 'federalreserve', id: 'UCAzhpt9DmG6PnHXjmJTvRGQ', allDay: false, group: 'Government' },
  { name: 'C-SPAN', handle: 'cspan', id: 'UCb--64Gl51jIEVE-GLDAVTg', allDay: false, group: 'Government' },
];

export interface Stream { key: string; name: string; src: string; confirmed: boolean; group: Channel['group'] }
const embed = (path: string) => `https://www.youtube-nocookie.com/embed/${path}`;
/** Streams to offer, in channel order: every channel the server found live (by its video), plus every 24/7 channel it
 *  could not confirm (through the channel's live embed). `live` = [{ name, videoId }] from the server feed. */
export function streamList(live: { name: string; videoId: string }[]): Stream[] {
  return CHANNELS.flatMap((c): Stream[] => {
    const l = live.find((x) => x.name === c.name);
    if (l) return [{ key: l.videoId, name: c.name, src: embed(l.videoId), confirmed: true, group: c.group }];
    if (c.allDay && c.video) return [{ key: c.video, name: c.name, src: embed(c.video), confirmed: false, group: c.group }];
    return c.allDay && c.id ? [{ key: `ch:${c.id}`, name: c.name, src: embed(`live_stream?channel=${c.id}`), confirmed: false, group: c.group }] : [];
  });
}

/** Why a channel's live page gave no stream, for Data status: blocked, consent wall, not live, or no video found. */
export function liveDiag(status: number, html: string): string {
  if (status !== 200) return `HTTP ${status}`;
  if (/consent\.youtube\.com|Before you continue to YouTube/i.test(html)) return 'consent page';
  if (/confirm you(?:&#39;|')re not a bot|unusual traffic/i.test(html)) return 'bot check';
  if (!/"isLive(?:Now|Content)"\s*:\s*true/.test(html)) return 'not live';
  return 'no video id';
}
