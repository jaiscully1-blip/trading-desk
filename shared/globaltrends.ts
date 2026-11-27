// Global trends: what is getting popular, new, funded or launched, country by country, from free public sources (Apple's
// app charts, Wikipedia's most-read pages, Steam, Spotify charts via Kworb, Hugging Face, GitHub, SEC Form D, Product Hunt).
// A nightly job turns each night's lists into one record per thing (first and last seen per country, best rank, last 30
// ranks), so a trend that starts in one country can be seen reaching others. Pure + tested. Research, not advice.

export interface Country { cc: string; name: string; wiki: string; spotify: boolean; steam: boolean }
/** The first 15 (Jai's list, 2026-11-27). wiki = the Wikipedia language most read there (English is shared by several). */
export const COUNTRIES: Country[] = [
  { cc: 'us', name: 'United States', wiki: 'en', spotify: true, steam: true },
  { cc: 'gb', name: 'United Kingdom', wiki: 'en', spotify: true, steam: true },
  { cc: 'ca', name: 'Canada', wiki: 'en', spotify: true, steam: true },
  { cc: 'de', name: 'Germany', wiki: 'de', spotify: true, steam: true },
  { cc: 'fr', name: 'France', wiki: 'fr', spotify: true, steam: true },
  { cc: 'jp', name: 'Japan', wiki: 'ja', spotify: true, steam: true },
  { cc: 'kr', name: 'South Korea', wiki: 'ko', spotify: true, steam: true },
  { cc: 'cn', name: 'China', wiki: 'zh', spotify: false, steam: true },
  { cc: 'in', name: 'India', wiki: 'hi', spotify: true, steam: true },
  { cc: 'br', name: 'Brazil', wiki: 'pt', spotify: true, steam: true },
  { cc: 'mx', name: 'Mexico', wiki: 'es', spotify: true, steam: true },
  { cc: 'id', name: 'Indonesia', wiki: 'id', spotify: true, steam: true },
  { cc: 'au', name: 'Australia', wiki: 'en', spotify: true, steam: true },
  { cc: 'ae', name: 'UAE', wiki: 'ar', spotify: true, steam: true },
  { cc: 'ng', name: 'Nigeria', wiki: 'en', spotify: true, steam: false },
];
/** Wikipedia languages read (one list per language, stored under `wiki:<lang>`). */
export const WIKI_LANGS = [...new Set(COUNTRIES.map((c) => c.wiki))];

export type Src = 'apps-free' | 'apps-paid' | 'wiki' | 'steam' | 'music' | 'ai-models' | 'github' | 'launches';
export const SRC_LABEL: Record<Src, string> = { 'apps-free': 'Top free apps', 'apps-paid': 'Top paid apps', wiki: 'Most-read Wikipedia pages', steam: 'Top-selling games (Steam)', music: 'Top songs (Spotify, via Kworb)', 'ai-models': 'Trending AI models (Hugging Face)', github: 'Fastest-rising new GitHub projects', launches: 'Product launches (Product Hunt)' };
/** One entry on one night's list. `where` = a country code, `wiki:<lang>`, or `world` for global lists. */
export interface Item { src: Src; where: string; id: string; name: string; rank: number; by?: string; url?: string; note?: string }

const num = (x: unknown) => { const v = Number(String(x ?? '').replace(/,/g, '')); return Number.isFinite(v) ? v : null; };
const unesc = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));

/** Apple's marketing-tools chart feed (rss.marketingtools.apple.com/api/v2/<cc>/apps/top-free/25/apps.json). */
export function appleTop(j: any, cc: string, src: 'apps-free' | 'apps-paid'): Item[] {
  return ((j?.feed?.results ?? []) as any[]).filter((r) => r?.id && r?.name).map((r, i) => ({ src, where: cc, id: `apple:${r.id}`, name: String(r.name), rank: i + 1, by: r.artistName ? String(r.artistName) : undefined, url: r.url ? String(r.url) : undefined }));
}

// Wikipedia front pages, search pages and other non-article titles: never a trend
const WIKI_SKIP = /:|^(Main_Page|Wikipedia|Special|Portal|Pagina_principale|Página_principal|Accueil|Hauptseite|メインページ|大文|首页|मुख्य_पृष्ठ|Halaman_Utama|الصفحة_الرئيسية|-)$/i;
/** Wikimedia "top" pageviews for one language and day: articles only, front page and search pages dropped. */
export function wikiTop(j: any, lang: string, max = 30): Item[] {
  const arts = ((j?.items?.[0]?.articles ?? []) as any[]).filter((a) => a?.article && !WIKI_SKIP.test(String(a.article)));
  return arts.slice(0, max).map((a, i) => ({ src: 'wiki' as const, where: `wiki:${lang}`, id: `wiki:${lang}:${a.article}`, name: String(a.article).replace(/_/g, ' '), rank: i + 1, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(a.article))}`, note: num(a.views) != null ? `${num(a.views)!.toLocaleString('en-US')} views` : undefined }));
}

/** Steam store "featured categories" for a country: top sellers. */
export function steamTop(j: any, cc: string): Item[] {
  const seen = new Set<number>();
  return ((j?.top_sellers?.items ?? []) as any[]).filter((g) => g?.id && g?.name && !seen.has(g.id) && seen.add(g.id)).map((g, i) => ({ src: 'steam' as const, where: cc, id: `steam:${g.id}`, name: String(g.name), rank: i + 1, url: `https://store.steampowered.com/app/${g.id}` }));
}

/** Kworb's Spotify daily chart page for a country (unofficial page): track id, title, artist. */
export function kworbTop(html: string, cc: string, max = 50): Item[] {
  const out: Item[] = [];
  for (const row of html.match(/<tr>[\s\S]*?<\/tr>/g) ?? []) {
    const track = /href="\.\.\/track\/([\w]+)\.html">([^<]+)<\/a>/.exec(row), artist = /href="\.\.\/artist\/[\w]+\.html">([^<]+)<\/a>/.exec(row);
    if (!track) continue;
    out.push({ src: 'music', where: cc, id: `spotify:${track[1]}`, name: unesc(track[2]), rank: out.length + 1, by: artist ? unesc(artist[1]) : undefined, url: `https://open.spotify.com/track/${track[1]}` });
    if (out.length >= max) break;
  }
  return out;
}

/** Hugging Face models sorted by trending score (global). */
export const hfTrending = (j: any): Item[] => ((Array.isArray(j) ? j : []) as any[]).filter((m) => m?.id).map((m, i) => ({ src: 'ai-models' as const, where: 'world', id: `hf:${m.id}`, name: String(m.id), rank: i + 1, by: String(m.id).split('/')[0], url: `https://huggingface.co/${m.id}`, note: [m.pipeline_tag, num(m.likes) != null ? `${num(m.likes)} likes` : ''].filter(Boolean).join(' · ') || undefined }));

/** GitHub search: repositories created in the last week, most stars first (global). */
export const ghRising = (j: any): Item[] => ((j?.items ?? []) as any[]).filter((r) => r?.full_name).map((r, i) => ({ src: 'github' as const, where: 'world', id: `gh:${r.full_name}`, name: String(r.full_name), rank: i + 1, url: String(r.html_url ?? `https://github.com/${r.full_name}`), note: [r.description ? String(r.description).slice(0, 120) : '', r.language, `${num(r.stargazers_count) ?? 0} stars`].filter(Boolean).join(' · ') }));

/** Product Hunt's public Atom feed (latest launches, global). */
export function phFeed(xml: string): Item[] {
  const out: Item[] = [];
  for (const e of xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []) {
    const id = /<id>[^<]*Post\/(\d+)<\/id>/.exec(e)?.[1], title = /<title>([^<]+)<\/title>/.exec(e)?.[1], link = /<link[^>]+href="([^"]+)"/.exec(e)?.[1];
    if (!id || !title) continue;
    const tag = unesc(/<content[^>]*>([\s\S]*?)<\/content>/.exec(e)?.[1] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' Discussion')[0];
    out.push({ src: 'launches', where: 'world', id: `ph:${id}`, name: unesc(title), rank: out.length + 1, url: link, note: tag.slice(0, 140) || undefined });
  }
  return out;
}

// ---------- US startups raising money (SEC Form D) ----------
export interface Raise { adsh: string; cik: string; name: string; industry: string; state: string; offering: number | null; sold: number | null; yearInc: string; date: string; fund: boolean }
/** EDGAR full-text search hits for form D: new filings only (amendments D/A dropped). */
export const formdHits = (j: any): { adsh: string; cik: string; date: string }[] => ((j?.hits?.hits ?? []) as any[])
  .filter((h) => h?._source?.form === 'D' && h._source.ciks?.[0]).map((h) => ({ adsh: String(h._id).split(':')[0], cik: String(h._source.ciks[0]).replace(/^0+/, ''), date: String(h._source.file_date ?? '') }));
/** One Form D's primary_doc.xml: who, what industry, where, how much offered and sold so far. Funds flagged (not startups). */
/** Names of investment vehicles rather than operating companies (fund feeders, REIT subsidiaries, SPV series...). */
const VEHICLE = /\b(fund|funds|reit|spv|feeder|series [a-z0-9]+|sub \d+|co-?invest\w*|l\.?p\.?|partners [ivx]+|capital partners|investors?( llc)?|member llc|sponsor( llc)?|propco|acquisition( co)?)\b/i;
export function formdDoc(xml: string, meta: { adsh: string; cik: string; date: string }): Raise | null {
  const tag = (t: string) => unesc(new RegExp(`<${t}>([^<]*)</${t}>`).exec(xml)?.[1]?.trim() ?? '');
  const name = tag('entityName'); if (!name) return null;
  const industry = tag('industryGroupType');
  // only inside <yearOfInc> (companies older than five years give no year there; never take a <value> from elsewhere)
  const year = /<value>([^<]*)<\/value>/.exec(/<yearOfInc>([\s\S]*?)<\/yearOfInc>/.exec(xml)?.[1] ?? '')?.[1] ?? '';
  const money = (t: string) => { const v = tag(t); return /^\d+(\.\d+)?$/.test(v) ? Number(v) : null; }; // "Indefinite" -> null
  return { ...meta, name, industry, state: tag('stateOrCountry'), offering: money('totalOfferingAmount'), sold: money('totalAmountSold'), yearInc: /^\d{4}$/.test(year) ? year : '', fund: /pooled investment fund/i.test(industry) || /<investmentFundType>/.test(xml) || VEHICLE.test(name) };
}

// ---------- the database: one record per thing ----------
export interface Seen { first: string; last: string; days: number; best: number; r: [string, number][] }
export interface Rec { src: Src; id: string; name: string; by?: string; url?: string; note?: string; seen: Record<string, Seen> }
export interface News { id: string; cc: string; title: string; url: string; source: string; date: string; kind: 'ban' | 'recall' }
export interface TrendDb { v: 1; updated: string; nights: string[]; items: Record<string, Rec>; raises: Raise[]; errors: string[]; news?: News[] }
export const emptyDb = (): TrendDb => ({ v: 1, updated: '', nights: [], items: {}, raises: [], errors: [] });

/** Add one night's lists. A thing seen again on a new night extends its record; its last 30 ranks are kept per place. */
export function mergeNight(db: TrendDb, items: Item[], date: string): TrendDb {
  const out: TrendDb = { ...db, updated: date, nights: [...new Set([...db.nights, date])].sort().slice(-120), items: { ...db.items } };
  for (const it of items) {
    const rec: Rec = out.items[it.id] ? { ...out.items[it.id], seen: { ...out.items[it.id].seen } } : { src: it.src, id: it.id, name: it.name, seen: {} };
    rec.name = it.name; if (it.by) rec.by = it.by; if (it.url) rec.url = it.url; if (it.note) rec.note = it.note;
    const s = rec.seen[it.where];
    if (!s) rec.seen[it.where] = { first: date, last: date, days: 1, best: it.rank, r: [[date, it.rank]] };
    else if (s.last !== date) rec.seen[it.where] = { first: s.first, last: date, days: s.days + 1, best: Math.min(s.best, it.rank), r: [...s.r, [date, it.rank] as [string, number]].slice(-30) };
    else rec.seen[it.where] = { ...s, best: Math.min(s.best, it.rank), r: s.r.map((x) => (x[0] === date ? [date, Math.min(x[1], it.rank)] : x)) as [string, number][] };
    out.items[it.id] = rec;
  }
  return out;
}

/** Forget things not seen for `keepDays`, and raises older than that, so the file stays small. */
export function prune(db: TrendDb, today: string, keepDays = 120): TrendDb {
  const cut = new Date(Date.parse(`${today}T00:00:00Z`) - keepDays * 86400_000).toISOString().slice(0, 10);
  const items: Record<string, Rec> = {};
  for (const [k, r] of Object.entries(db.items)) if (Object.values(r.seen).some((s) => s.last >= cut)) items[k] = r;
  return { ...db, items, raises: db.raises.filter((x) => x.date >= cut) };
}

/** Add new Form D raises (one row per filing, newest first). */
export const addRaises = (db: TrendDb, raises: Raise[]): TrendDb => {
  const have = new Set(db.raises.map((r) => r.adsh));
  return { ...db, raises: [...raises.filter((r) => !have.has(r.adsh)), ...db.raises].sort((a, b) => b.date.localeCompare(a.date)) };
};

export interface Spread { id: string; src: Src; name: string; by?: string; url?: string; origin: string; originFirst: string; later: { where: string; first: string; best: number }[]; places: number }
/** Things on charts in more than one country where at least one country picked it up later than the first: the first
 *  country and the ones that followed, most recent spread first. `wiki:` and `world` lists are left out (not one country). */
export function spreading(db: TrendDb, minPlaces = 2): Spread[] {
  const out: Spread[] = [];
  for (const r of Object.values(db.items)) {
    const cs = Object.entries(r.seen).filter(([w]) => !w.startsWith('wiki:') && w !== 'world');
    if (cs.length < minPlaces) continue;
    const sorted = cs.sort((a, b) => a[1].first.localeCompare(b[1].first));
    const [origin, o] = sorted[0];
    const later = sorted.slice(1).filter(([, s]) => s.first > o.first).map(([where, s]) => ({ where, first: s.first, best: s.best }));
    if (!later.length) continue;
    out.push({ id: r.id, src: r.src, name: r.name, by: r.by, url: r.url, origin, originFirst: o.first, later, places: cs.length });
  }
  return out.sort((a, b) => (b.later.at(-1)!.first.localeCompare(a.later.at(-1)!.first)) || b.places - a.places);
}

// ---------- page summary (computed on the server from the database) ----------
export interface Row { id: string; src: Src; name: string; by?: string; url?: string; note?: string; rank: number; first: string; days: number; best: number; trend: number | null }
export interface CountrySum { cc: string; name: string; now: Partial<Record<Src, Row[]>>; fresh: Row[]; heat: number; heatBy: Partial<Record<Src, number>> }
export interface Wide { id: string; src: Src; name: string; by?: string; url?: string; places: { cc: string; rank: number }[] }
export interface TrendSummary { updated: string; nights: number; warmingUp: boolean; spreading: (Spread & { originName: string })[]; startups: StartupRadar; bans: { cc: string; name: string; items: News[] }[]; recalls: News[]; wide: Wide[]; local: (Row & { cc: string })[]; countries: CountrySum[]; world: Partial<Record<Src, Row[]>>; wiki: { lang: string; rows: Row[] }[] }

const NAME: Record<string, string> = Object.fromEntries(COUNTRIES.map((c) => [c.cc, c.name]));
export const placeName = (w: string) => NAME[w] ?? (w.startsWith('wiki:') ? `Wikipedia (${w.slice(5)})` : w === 'world' ? 'Worldwide' : w);

/** A place's row for a thing on the latest night: rank now, and the change vs about a week earlier (positive = climbing). */
function rowAt(r: Rec, where: string, updated: string): Row | null {
  const s = r.seen[where]; if (!s || s.last !== updated) return null;
  const now = s.r.at(-1)![1];
  const weekAgo = new Date(Date.parse(`${updated}T00:00:00Z`) - 7 * 86400_000).toISOString().slice(0, 10);
  const then = [...s.r].reverse().find(([d]) => d <= weekAgo)?.[1];
  return { id: r.id, src: r.src, name: r.name, by: r.by, url: r.url, note: r.note, rank: now, first: s.first, days: s.days, best: s.best, trend: then != null ? then - now : null };
}

/** Everything the Global trends page shows. "New" = first seen in the last 7 days, but only once the database is a few
 *  nights old (on the first nights everything is "new", so the page shows the charts instead and says it is warming up). */
export function summarize(db: TrendDb, perList = 10): TrendSummary {
  const updated = db.updated, start = db.nights[0] ?? updated;
  const warmingUp = db.nights.length < 4;
  const weekAgo = new Date(Date.parse(`${updated}T00:00:00Z`) - 7 * 86400_000).toISOString().slice(0, 10);
  const recs = Object.values(db.items);
  const countries: CountrySum[] = COUNTRIES.map((c) => {
    const now: Partial<Record<Src, Row[]>> = {}, heatBy: Partial<Record<Src, number>> = {}, fresh: Row[] = [];
    for (const r of recs) {
      const row = rowAt(r, c.cc, updated); if (!row) continue;
      (now[r.src] ??= []).push(row);
      if (!warmingUp && row.first > start && row.first >= weekAgo) { fresh.push(row); heatBy[r.src] = (heatBy[r.src] ?? 0) + 1; }
    }
    for (const k of Object.keys(now) as Src[]) now[k] = now[k]!.sort((a, b) => a.rank - b.rank).slice(0, perList);
    return { cc: c.cc, name: c.name, now, fresh: fresh.sort((a, b) => a.rank - b.rank).slice(0, 20), heat: fresh.length, heatBy };
  });
  const world: Partial<Record<Src, Row[]>> = {};
  for (const r of recs) { const row = rowAt(r, 'world', updated); if (row) (world[r.src] ??= []).push(row); }
  for (const k of Object.keys(world) as Src[]) world[k] = world[k]!.sort((a, b) => a.rank - b.rank).slice(0, 20);
  const wiki = WIKI_LANGS.map((lang) => ({ lang, rows: recs.map((r) => rowAt(r, `wiki:${lang}`, updated)).filter((x): x is Row => !!x).sort((a, b) => a.rank - b.rank).slice(0, perList) }));
  // on the charts in many countries now, and big in only one (top 10 there, on no other country's chart: a copycat lead)
  const CHART: Src[] = ['apps-free', 'apps-paid', 'steam', 'music'];
  const wide: Wide[] = [], local: (Row & { cc: string })[] = [];
  for (const r of recs) {
    if (!CHART.includes(r.src)) continue;
    const places = COUNTRIES.flatMap((c) => { const x = rowAt(r, c.cc, updated); return x ? [{ cc: c.cc, rank: x.rank }] : []; });
    if (places.length >= 5) wide.push({ id: r.id, src: r.src, name: r.name, by: r.by, url: r.url, places: places.sort((a, b) => a.rank - b.rank) });
    if (places.length === 1 && places[0].rank <= 10 && Object.keys(r.seen).filter((w) => NAME[w]).length === 1) { const x = rowAt(r, places[0].cc, updated)!; local.push({ ...x, cc: places[0].cc }); }
  }
  wide.sort((a, b) => b.places.length - a.places.length || a.places[0].rank - b.places[0].rank);
  local.sort((a, b) => a.rank - b.rank || a.cc.localeCompare(b.cc));
  const recentNews = (db.news ?? []).filter((n) => n.date >= new Date(Date.parse(`${updated}T00:00:00Z`) - 14 * 86400_000).toISOString().slice(0, 10));
  const bans = BAN_FEEDS.map((f) => ({ cc: f.cc, name: NAME[f.cc] ?? f.cc, items: recentNews.filter((n) => n.kind === 'ban' && n.cc === f.cc).slice(0, 15) }));
  return { updated, nights: db.nights.length, warmingUp, startups: startupRadar(db.raises, updated), bans, recalls: recentNews.filter((n) => n.kind === 'recall').slice(0, 30), wide: wide.slice(0, 40), local: local.slice(0, 120), spreading: spreading(db).slice(0, 80).map((s) => ({ ...s, originName: placeName(s.origin) })), countries, world, wiki };
}


// ---------- ban watch: news of bans per country (Google News search, local language) and US recalls ----------
/** One Google News RSS search per country, in its own language: bans on apps, products, sales or imports in the last week.
 *  Google News has no mainland China edition. Headlines only; unofficial feed. */
export const BAN_FEEDS: { cc: string; hl: string; gl: string; q: string }[] = [
  ...['us', 'gb', 'ca', 'au', 'in', 'ng'].map((cc) => ({ cc, hl: cc === 'us' ? 'en-US' : `en-${cc.toUpperCase()}`, gl: cc.toUpperCase(), q: '(banned OR "ban on" OR "bans") (app OR product OR sale OR import OR platform) when:7d' })),
  { cc: 'de', hl: 'de', gl: 'DE', q: '(Verbot OR verboten OR Verkaufsverbot) (App OR Produkt OR Verkauf OR Import) when:7d' },
  { cc: 'fr', hl: 'fr', gl: 'FR', q: '(interdiction OR interdit) (application OR produit OR vente OR importation) when:7d' },
  { cc: 'jp', hl: 'ja', gl: 'JP', q: '禁止 (アプリ OR 製品 OR 販売 OR 輸入) when:7d' },
  { cc: 'kr', hl: 'ko', gl: 'KR', q: '금지 (앱 OR 제품 OR 판매 OR 수입) when:7d' },
  { cc: 'br', hl: 'pt-BR', gl: 'BR', q: '(proibição OR proibido OR proíbe) (aplicativo OR produto OR venda OR importação) when:7d' },
  { cc: 'mx', hl: 'es-419', gl: 'MX', q: '(prohibición OR prohíbe OR prohibido) (aplicación OR producto OR venta OR importación) when:7d' },
  { cc: 'id', hl: 'id', gl: 'ID', q: '(larangan OR dilarang) (aplikasi OR produk OR penjualan OR impor) when:7d' },
  { cc: 'ae', hl: 'ar', gl: 'AE', q: 'حظر (تطبيق OR منتج OR بيع OR استيراد) when:7d' },
];
export const banUrl = (f: (typeof BAN_FEEDS)[number]) => `https://news.google.com/rss/search?q=${encodeURIComponent(f.q)}&hl=${f.hl}&gl=${f.gl}&ceid=${f.gl}:${f.hl.split('-')[0]}`;
// crime and court stories that only mention "ban" in passing
const NOT_A_BAN = /arrest|逮捕|書類送検|murder|殺|police|경찰|체포|Polizei|Mord|burn ban|fire ban|travel ban|ban(ned)? from (the )?(game|match|league|driving)/i;
/** Google News RSS items: headline (the " - Source" tail split off), link, date. */
export function gnewsItems(xml: string, cc: string): News[] {
  const out: News[] = [];
  for (const it of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const raw = unesc(/<title>([\s\S]*?)<\/title>/.exec(it)?.[1] ?? '').trim(), url = /<link>([^<]+)<\/link>/.exec(it)?.[1] ?? '';
    const source = unesc(/<source[^>]*>([^<]+)<\/source>/.exec(it)?.[1] ?? '');
    const title = source && raw.endsWith(` - ${source}`) ? raw.slice(0, -source.length - 3) : raw;
    const t = Date.parse(/<pubDate>([^<]+)<\/pubDate>/.exec(it)?.[1] ?? '');
    if (!title || !url || NOT_A_BAN.test(title)) continue;
    out.push({ id: `ban:${cc}:${title.slice(0, 80)}`, cc, title, url, source, date: Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '', kind: 'ban' });
  }
  return out;
}
/** Merge tonight's headlines in (deduped by headline): 30 days at most, the newest 30 per country (and 30 recalls). */
export function addNews(db: TrendDb, items: News[], today: string): TrendDb {
  const cut = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86400_000).toISOString().slice(0, 10);
  const map = new Map((db.news ?? []).map((n) => [n.id, n]));
  for (const n of items) if (!map.has(n.id)) map.set(n.id, n);
  const kept = new Map<string, number>();
  const news = [...map.values()].filter((n) => n.date >= cut).sort((a, b) => b.date.localeCompare(a.date)).filter((n) => { const k = `${n.kind}:${n.cc}`, c = (kept.get(k) ?? 0) + 1; kept.set(k, c); return c <= 30; });
  return { ...db, news };
}

// ---------- startup radar: Form D raises by industry ----------
export interface IndustryRow { industry: string; n7: number; sold7: number; perWeek: number; surge: boolean; young7: number }
export interface StartupRadar { from: string; to: string; weeks: number; warmingUp: boolean; industries: IndustryRow[]; biggest: Raise[]; young: Raise[]; states: { state: string; n: number; sold: number }[] }
/** US companies (not investment funds) raising money: by industry this week vs their weekly average before, the biggest
 *  raises, the youngest companies (founded this year or last), and states. "Surge" = 3+ raises this week and at least
 *  twice the earlier weekly average (only once there are 3+ earlier weeks to compare). */
export function startupRadar(raises: Raise[], today: string): StartupRadar {
  const cos = raises.filter((r) => !r.fund && !VEHICLE.test(r.name) && r.date); // vehicles saved before the name check too
  const wk = new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86400_000).toISOString().slice(0, 10);
  const from = cos.reduce((m, r) => (r.date < m ? r.date : m), today);
  const priorDays = Math.max(0, (Date.parse(`${wk}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400_000);
  const weeks = priorDays / 7, warmingUp = weeks < 3;
  const yr = Number(today.slice(0, 4));
  const by = new Map<string, IndustryRow>();
  for (const r of cos) {
    const k = r.industry || 'Not stated';
    const row = by.get(k) ?? { industry: k, n7: 0, sold7: 0, perWeek: 0, surge: false, young7: 0 };
    if (r.date > wk) { row.n7++; row.sold7 += r.sold ?? 0; if (Number(r.yearInc) >= yr - 1) row.young7++; } else row.perWeek += 1;
    by.set(k, row);
  }
  const industries = [...by.values()].map((r) => { const perWeek = weeks > 0 ? Math.round((r.perWeek / weeks) * 10) / 10 : 0; return { ...r, perWeek, surge: !warmingUp && r.n7 >= 3 && r.n7 >= 2 * Math.max(perWeek, 0.5) }; })
    .filter((r) => r.n7 > 0).sort((a, b) => Number(b.surge) - Number(a.surge) || b.n7 - a.n7 || b.sold7 - a.sold7);
  const recent = cos.filter((r) => r.date > wk);
  const st = new Map<string, { state: string; n: number; sold: number }>();
  for (const r of recent) { const k = r.state || '—'; const x = st.get(k) ?? { state: k, n: 0, sold: 0 }; x.n++; x.sold += r.sold ?? 0; st.set(k, x); }
  return { from, to: today, weeks: Math.round(weeks * 10) / 10, warmingUp, industries,
    biggest: [...recent].sort((a, b) => (b.sold ?? 0) - (a.sold ?? 0)).slice(0, 25),
    young: recent.filter((r) => Number(r.yearInc) >= yr - 1).sort((a, b) => (b.sold ?? 0) - (a.sold ?? 0)).slice(0, 40),
    states: [...st.values()].sort((a, b) => b.n - a.n).slice(0, 15) };
}
