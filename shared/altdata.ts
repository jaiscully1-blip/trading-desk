// Alt Data: which free source covers which ticker, the daily snapshot file's shape, and series math (pure, tested).
// The snapshot job (scripts/altdata-build.ts, GitHub Action) records one row a day so trends build up over time:
// job openings (Greenhouse / Lever / Ashby public boards), App Store rank (Apple's public top charts), Steam players
// (official Steam API), GitHub activity (public org repos), Reddit mentions (ApeWisdom) and StockTwits watchers.

export type Ats = 'gh' | 'lv' | 'ab';
/** Public job boards: ticker -> applicant-tracking system and board name. */
export const JOB_BOARDS: Record<string, [Ats, string]> = {
  HOOD: ['gh', 'robinhood'], DASH: ['gh', 'doordashusa'], ABNB: ['gh', 'airbnb'], PINS: ['gh', 'pinterest'], RDDT: ['gh', 'reddit'],
  COIN: ['gh', 'coinbase'], LYFT: ['gh', 'lyft'], RBLX: ['gh', 'roblox'], DDOG: ['gh', 'datadog'], NET: ['gh', 'cloudflare'],
  AFRM: ['gh', 'affirm'], SOFI: ['gh', 'sofi'], DUOL: ['gh', 'duolingo'], TWLO: ['gh', 'twilio'], OKTA: ['gh', 'okta'],
  MDB: ['gh', 'mongodb'], GTLB: ['gh', 'gitlab'], IOT: ['gh', 'samsara'], TOST: ['gh', 'toast'], RBRK: ['gh', 'rubrik'],
  DBX: ['gh', 'dropbox'], ZS: ['gh', 'zscaler'], PLTR: ['lv', 'palantir'], SPOT: ['lv', 'spotify'], SNOW: ['ab', 'snowflake'],
};
export const jobsUrl = (a: Ats, slug: string) =>
  a === 'gh' ? `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs` : a === 'lv' ? `https://api.lever.co/v0/postings/${slug}?mode=json` : `https://api.ashbyhq.com/posting-api/job-board/${slug}`;
export const countJobs = (j: any): number | null => (Array.isArray(j) ? j.length : Array.isArray(j?.jobs) ? j.jobs.length : null);

/** App Store publisher names (Apple's "artistName") per ticker. */
export const APP_PUBLISHERS: Record<string, string[]> = {
  UBER: ['Uber Technologies'], DASH: ['DoorDash'], HOOD: ['Robinhood'], ABNB: ['Airbnb'], META: ['Meta Platforms'], SNAP: ['Snap, Inc.', 'Snap Inc'],
  PINS: ['Pinterest'], RDDT: ['reddit inc', 'Reddit'], COIN: ['Coinbase'], SPOT: ['Spotify'], DUOL: ['Duolingo'], LYFT: ['Lyft'], AMZN: ['AMZN Mobile', 'Amazon'],
  GOOGL: ['Google LLC'], NFLX: ['Netflix'], PYPL: ['PayPal'], XYZ: ['Block, Inc.'], SHOP: ['Shopify'], EBAY: ['eBay'], CMG: ['Chipotle'], SBUX: ['Starbucks'],
  MCD: ['McDonald'], WMT: ['Walmart'], TGT: ['Target'], ETSY: ['Etsy'], CART: ['Maplebear', 'Instacart'], BMBL: ['Bumble'], MTCH: ['Match Group', 'Tinder'], SOFI: ['SoFi'],
};

/** Steam games per ticker (official app ids). */
export const STEAM_GAMES: Record<string, { id: number; name: string }[]> = {
  TTWO: [{ id: 3240220, name: 'GTA V Enhanced' }, { id: 271590, name: 'GTA V Legacy' }],
  EA: [{ id: 1172470, name: 'Apex Legends' }, { id: 1222670, name: 'The Sims 4' }],
  NTES: [{ id: 2767030, name: 'Marvel Rivals' }],
  MSFT: [{ id: 2357570, name: 'Overwatch 2' }],
  SONY: [{ id: 553850, name: 'Helldivers 2' }],
};

/** Public GitHub organizations per ticker. */
export const GITHUB_ORGS: Record<string, string> = {
  MSFT: 'microsoft', GOOGL: 'google', META: 'facebook', AMZN: 'aws', NFLX: 'Netflix', UBER: 'uber', SHOP: 'Shopify', DDOG: 'DataDog', NET: 'cloudflare',
  MDB: 'mongodb', CRM: 'salesforce', ORCL: 'oracle', IBM: 'IBM', SNOW: 'snowflakedb', PLTR: 'palantir', TWLO: 'twilio', ABNB: 'airbnb', PINS: 'pinterest',
  HOOD: 'robinhood', COIN: 'coinbase', ESTC: 'elastic', CFLT: 'confluentinc', NVDA: 'NVIDIA', AMD: 'ROCm', INTC: 'intel', ADBE: 'adobe', SPOT: 'spotify',
};

/** Tickers whose StockTwits watcher count is recorded daily (others still show live). */
export const STOCKTWITS_DAILY = ['NVDA', 'TSLA', 'AAPL', 'AMD', 'PLTR', 'HOOD', 'SOFI', 'MSTR', 'COIN', 'GME', 'AMC', 'RKLB', 'SMCI', 'META', 'AMZN', 'SPY', 'QQQ', 'RDDT', 'HIMS', 'IONQ'];

/** BLS average retail prices (FRED series): an inflation basket. */
export const PRICE_BASKET: { id: string; name: string; unit: string }[] = [
  { id: 'APU0000708111', name: 'Eggs, grade A, large', unit: 'per dozen' },
  { id: 'APU0000709112', name: 'Milk, whole', unit: 'per gallon' },
  { id: 'APU0000702111', name: 'Bread, white', unit: 'per lb' },
  { id: 'APU0000703112', name: 'Ground beef', unit: 'per lb' },
  { id: 'APU0000706111', name: 'Chicken, whole', unit: 'per lb' },
  { id: 'APU0000717311', name: 'Coffee, ground', unit: 'per lb' },
  { id: 'APU0000711211', name: 'Bananas', unit: 'per lb' },
  { id: 'APU000074714', name: 'Gasoline, regular', unit: 'per gallon' },
  { id: 'APU000072610', name: 'Electricity', unit: 'per kWh' },
];

/* ---------------- the daily snapshot file ---------------- */
export interface AltDay {
  jobs?: Record<string, number>; apps?: Record<string, number>; steam?: Record<string, number>;
  github?: Record<string, { repos: number; pushed30: number; stars: number }>; reddit?: Record<string, number>; twits?: Record<string, number>;
}
export interface AltFile { version: 1; updated: string; days: Record<string, AltDay> }

/** Best (lowest) App Store rank of any app by one of the ticker's publishers, or null when none is in the chart. */
export function appRank(results: { artistName?: string }[], publishers: string[]): number | null {
  const i = results.findIndex((r) => publishers.some((p) => (r.artistName ?? '').toLowerCase().includes(p.toLowerCase())));
  return i < 0 ? null : i + 1;
}

/** One ticker's series out of the file: [{ date, value }] oldest first, for one field. */
export function series(f: AltFile | null, field: keyof AltDay, key: string): { date: string; value: number }[] {
  if (!f) return [];
  return Object.entries(f.days).sort((a, b) => a[0].localeCompare(b[0])).flatMap(([date, d]) => {
    const v = (d[field] as Record<string, unknown> | undefined)?.[key];
    const n = typeof v === 'number' ? v : (v as { pushed30?: number } | undefined)?.pushed30;
    return typeof n === 'number' && Number.isFinite(n) ? [{ date, value: n }] : [];
  });
}

/** Latest value and changes vs ~30 and ~365 days earlier (closest day on or before), as % (or rank places for ranks). */
export function trend(s: { date: string; value: number }[], mode: 'pct' | 'diff' = 'pct'): { last: number | null; date: string | null; d30: number | null; d365: number | null } {
  if (!s.length) return { last: null, date: null, d30: null, d365: null };
  const last = s[s.length - 1], t = Date.parse(last.date);
  const back = (days: number) => [...s].reverse().find((x) => Date.parse(x.date) <= t - days * 86400_000 && Date.parse(x.date) >= t - (days + 10) * 86400_000);
  const ch = (p?: { value: number }) => (!p ? null : mode === 'diff' ? last.value - p.value : p.value ? (last.value / p.value - 1) * 100 : null);
  return { last: last.value, date: last.date, d30: ch(back(30)), d365: ch(back(365)) };
}

/** Spike: today vs the average of the 7 days before it (Reddit mentions). */
export function spike(s: { date: string; value: number }[]): number | null {
  if (s.length < 4) return null;
  const prev = s.slice(-8, -1), avg = prev.reduce((a, x) => a + x.value, 0) / prev.length;
  return avg ? s[s.length - 1].value / avg : null;
}

/** Keep the file from growing forever: drop days older than `keep` days. */
export function prune(f: AltFile, today: string, keep = 800): AltFile {
  const cut = new Date(Date.parse(today) - keep * 86400_000).toISOString().slice(0, 10);
  return { ...f, days: Object.fromEntries(Object.entries(f.days).filter(([d]) => d >= cut)) };
}
