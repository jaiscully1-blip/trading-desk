// Global → US: world markets and world news, and how they have tended to carry into US stocks.
// Regions with their main indexes, the US-listed funds and ADRs that trade them during US hours, a history check of how
// each index's day has lined up with SPY (same-day move and the next US open), and world headlines tagged by region and
// by the US tickers they mention. Pure functions (tested). History, not a forecast.

export interface Region { id: string; label: string; indexes: { sym: string; label: string }[]; us: { sym: string; label: string }[]; words: RegExp }
export const REGIONS: Region[] = [
  { id: 'japan', label: 'Japan', indexes: [{ sym: '^N225', label: 'Nikkei 225' }], us: [{ sym: 'EWJ', label: 'Japan ETF' }, { sym: 'TM', label: 'Toyota' }, { sym: 'SONY', label: 'Sony' }, { sym: 'MUFG', label: 'Mitsubishi UFJ' }], words: /\b(japan|japanese|tokyo|nikkei|boj|bank of japan|yen|takaichi|ishiba)\b/i },
  { id: 'china', label: 'China & Hong Kong', indexes: [{ sym: '000001.SS', label: 'Shanghai' }, { sym: '^HSI', label: 'Hang Seng' }], us: [{ sym: 'FXI', label: 'China large-cap ETF' }, { sym: 'KWEB', label: 'China internet ETF' }, { sym: 'BABA', label: 'Alibaba' }, { sym: 'PDD', label: 'PDD' }, { sym: 'BIDU', label: 'Baidu' }], words: /\b(china|chinese|beijing|shanghai|shenzhen|hong kong|yuan|renminbi|pboc|xi jinping|hang seng)\b/i },
  { id: 'taiwan', label: 'Taiwan & Korea', indexes: [{ sym: '^TWII', label: 'Taiwan' }, { sym: '^KS11', label: 'KOSPI' }], us: [{ sym: 'TSM', label: 'TSMC' }, { sym: 'EWT', label: 'Taiwan ETF' }, { sym: 'EWY', label: 'Korea ETF' }], words: /\b(taiwan|taipei|tsmc|korea|korean|seoul|samsung|sk hynix|kospi|won)\b/i },
  { id: 'india', label: 'India', indexes: [{ sym: '^BSESN', label: 'Sensex' }], us: [{ sym: 'INDA', label: 'India ETF' }, { sym: 'INFY', label: 'Infosys' }, { sym: 'HDB', label: 'HDFC Bank' }], words: /\b(india|indian|mumbai|delhi|rupee|rbi|sensex|nifty|modi)\b/i },
  { id: 'europe', label: 'Europe', indexes: [{ sym: '^GDAXI', label: 'DAX' }, { sym: '^STOXX50E', label: 'Euro Stoxx 50' }, { sym: '^FCHI', label: 'CAC 40' }], us: [{ sym: 'EZU', label: 'Eurozone ETF' }, { sym: 'ASML', label: 'ASML' }, { sym: 'SAP', label: 'SAP' }, { sym: 'NVO', label: 'Novo Nordisk' }], words: /\b(europe|european|eurozone|euro|ecb|lagarde|germany|german|france|french|italy|spain|brussels|eu)\b/i },
  { id: 'uk', label: 'United Kingdom', indexes: [{ sym: '^FTSE', label: 'FTSE 100' }], us: [{ sym: 'EWU', label: 'UK ETF' }, { sym: 'SHEL', label: 'Shell' }, { sym: 'AZN', label: 'AstraZeneca' }, { sym: 'HSBC', label: 'HSBC' }], words: /\b(britain|british|uk|u\.k\.|london|england|sterling|pound|bank of england|boe|ftse)\b/i },
  { id: 'americas', label: 'Canada & Latin America', indexes: [{ sym: '^GSPTSE', label: 'Toronto TSX' }, { sym: '^BVSP', label: 'Brazil Bovespa' }, { sym: '^MXX', label: 'Mexico IPC' }], us: [{ sym: 'EWC', label: 'Canada ETF' }, { sym: 'EWZ', label: 'Brazil ETF' }, { sym: 'EWW', label: 'Mexico ETF' }], words: /\b(canada|canadian|ottawa|brazil|brazilian|mexico|mexican|argentina|peso|real|lula|sheinbaum|carney)\b/i },
  { id: 'mideast', label: 'Middle East & oil', indexes: [], us: [{ sym: 'USO', label: 'Oil fund' }, { sym: 'XLE', label: 'Energy sector' }, { sym: 'XOM', label: 'Exxon' }], words: /\b(middle east|iran|israel|saudi|opec|gulf|yemen|houthi|gaza|lebanon|qatar|uae|oil prices?|crude|brent|strait of hormuz)\b/i },
];

/** Asian markets close before the US opens, so their day is compared with SPY's opening gap; Europe overlaps the US morning, so its day is compared with SPY's whole day. */
export const OPEN_BEFORE_US = new Set(['^N225', '000001.SS', '^HSI', '^TWII', '^KS11', '^BSESN']);

export type Bars = { time: number; open: number; close: number }[];
const dayKey = (t: number) => new Date((t > 1e12 ? t : t * 1000)).toISOString().slice(0, 10);

/**
 * How an index's day has lined up with SPY over the bars given: correlation, the fitted SPY move per 1% of the index
 * (beta), and how often SPY moved the same way on the big days (index move beyond ±bigPct).
 * Asian indexes are paired with SPY's open gap on the same date; others with SPY's close-to-close move.
 */
export function linkStats(sym: string, idx: Bars, spy: Bars, bigPct = 1) {
  const gap = OPEN_BEFORE_US.has(sym);
  const ib = new Map<string, number>();
  for (let i = 1; i < idx.length; i++) if (idx[i - 1].close > 0) ib.set(dayKey(idx[i].time), (idx[i].close / idx[i - 1].close - 1) * 100);
  const pairs: [number, number][] = [];
  for (let i = 1; i < spy.length; i++) {
    const x = ib.get(dayKey(spy[i].time));
    if (x == null || !(spy[i - 1].close > 0)) continue;
    const y = gap ? (spy[i].open / spy[i - 1].close - 1) * 100 : (spy[i].close / spy[i - 1].close - 1) * 100;
    if (Number.isFinite(y)) pairs.push([x, y]);
  }
  if (pairs.length < 60) return null;
  const n = pairs.length, mx = pairs.reduce((a, p) => a + p[0], 0) / n, my = pairs.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  const big = pairs.filter(([x]) => Math.abs(x) >= bigPct);
  const same = big.filter(([x, y]) => Math.sign(x) === Math.sign(y)).length;
  return { sym, versus: gap ? 'SPY open gap' as const : 'SPY day' as const, n, corr: sxy / Math.sqrt(sxx * syy), beta: sxy / sxx, bigDays: big.length, sameWayPct: big.length ? (same / big.length) * 100 : null };
}

/** What the history fit says for today's index move (the expected SPY move it has lined up with, not a forecast). */
export const impliedSpy = (move: number | null, s: { beta: number; corr: number } | null) => (move == null || !s || Math.abs(s.corr) < 0.15 ? null : move * s.beta);

/* ---------------- world headlines ---------------- */
export const WORLD_FEEDS = [
  { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
  { name: 'CNBC World', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100727362' },
  { name: 'Bloomberg Markets', url: 'https://feeds.bloomberg.com/markets/news.rss' },
  { name: 'FT World', url: 'https://www.ft.com/world?format=rss' },
  { name: 'Nikkei Asia', url: 'https://asia.nikkei.com/rss/feed/nar' },
  { name: 'South China Morning Post', url: 'https://www.scmp.com/rss/92/feed' },
  { name: 'Economic Times Markets', url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms' },
  { name: 'DW Business', url: 'https://rss.dw.com/rdf/rss-en-bus' },
  { name: 'Euronews Business', url: 'https://www.euronews.com/rss?level=vertical&name=business' },
  { name: 'Guardian Business', url: 'https://www.theguardian.com/business/rss' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'CNA Business', url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6936' },
];
export interface WorldNews { id: string; title: string; url: string; t: number; src: string; regions: string[]; syms: string[]; summary?: string }
/** Headlines -> deduped, tagged with the regions they name and the US-listed tickers linked to those regions. Market-relevant ones only. */
/** companies: US big caps whose names or tickers in a headline add them to its tickers (e.g. "Nvidia" -> NVDA). */
export function tagWorldNews(items: { title: string; url: string; t: number; src: string; summary?: string }[], max = 150, companies?: (title: string) => string[]): WorldNews[] {
  const MARKET = /\b(stock|share|market|index|bond|yield|rate|central bank|inflation|gdp|growth|trade|tariff|export|import|oil|gas|currency|bank|earnings|profit|chip|semiconductor|deal|merger|economy|economic|investor|price|sanction|default|debt|budget|stimulus|recession|jobs|ipo)s?\b/i;
  const seen = new Set<string>();
  const out: WorldNews[] = [];
  for (const x of [...items].sort((a, b) => b.t - a.t)) {
    const key = x.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 70);
    if (!x.title || seen.has(key)) continue;
    seen.add(key);
    const text = `${x.title} ${x.summary ?? ''}`;
    if (!MARKET.test(text)) continue; // world news that's not about markets or the economy is left out
    const regions = REGIONS.filter((r) => r.words.test(text)).map((r) => r.id);
    const syms = [...new Set([...(companies ? companies(x.title) : []), ...REGIONS.filter((r) => regions.includes(r.id)).flatMap((r) => r.us.slice(0, 2).map((u) => u.sym))])];
    out.push({ id: x.url || key, title: x.title, url: x.url, t: x.t, src: x.src, regions, syms, summary: x.summary?.slice(0, 280) });
    if (out.length >= max) break;
  }
  return out;
}

/** One plain sentence for the overnight session: how Asia closed, how Europe is trading, where US futures are. */
export function overnightLine(moves: Record<string, number | null>, futures: number | null): string {
  const fmt = (label: string, v: number | null | undefined) => (v == null ? null : `${label} ${v >= 0 ? '+' : ''}${v.toFixed(1)}%`);
  const mood = (xs: (number | null | undefined)[]) => { const v = xs.filter((x): x is number => x != null); if (!v.length) return null; const up = v.filter((x) => x > 0.2).length, dn = v.filter((x) => x < -0.2).length; return up && !dn ? 'higher' : dn && !up ? 'lower' : up || dn ? 'mixed' : 'flat'; };
  const asia = ['^N225', '^HSI', '000001.SS', '^KS11', '^TWII'], eu = ['^GDAXI', '^STOXX50E', '^FTSE'];
  const a = mood(asia.map((s) => moves[s])), e = mood(eu.map((s) => moves[s]));
  const parts: string[] = [];
  if (a) parts.push(`Asia ${a} (${[fmt('Nikkei', moves['^N225']), fmt('Hang Seng', moves['^HSI']), fmt('KOSPI', moves['^KS11'])].filter(Boolean).join(', ')})`);
  if (e) parts.push(`Europe ${e} (${[fmt('DAX', moves['^GDAXI']), fmt('FTSE', moves['^FTSE'])].filter(Boolean).join(', ')})`);
  if (futures != null) parts.push(`S&P 500 futures ${futures >= 0 ? '+' : ''}${futures.toFixed(2)}%`);
  return parts.length ? `${parts.join('; ')}.` : '';
}
