// Global trends: what is getting popular, new, funded or launched, country by country, from free public sources (Apple's
// app charts, Wikipedia's most-read pages, Steam, Spotify charts via Kworb, Hugging Face, GitHub, SEC Form D, Product Hunt).
// A nightly job turns each night's lists into one record per thing (first and last seen per country, best rank, last 30
// ranks), so a trend that starts in one country can be seen reaching others. Pure + tested. Research, not advice.

/** stack = the order countries were added in (1 = the first 15; 2 = the next biggest markets and startup hubs; ...). */
export interface Country { cc: string; name: string; wiki: string; spotify: boolean; steam: boolean; stack?: number }
/** Shipped in stacks, best data first: stack 1 = Jai's first 15 (2026-11-27), stack 2 = the next 15, stack 3 = 16 more. wiki = the Wikipedia language most read there (English is shared by several). */
const MAIN: Country[] = [
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
  // stack 2 (2026-11-27): the next biggest consumer markets and startup hubs
  { cc: 'it', name: 'Italy', wiki: 'it', spotify: true, steam: true, stack: 2 },
  { cc: 'es', name: 'Spain', wiki: 'es', spotify: true, steam: true, stack: 2 },
  { cc: 'nl', name: 'Netherlands', wiki: 'nl', spotify: true, steam: true, stack: 2 },
  { cc: 'se', name: 'Sweden', wiki: 'sv', spotify: true, steam: true, stack: 2 },
  { cc: 'ch', name: 'Switzerland', wiki: 'de', spotify: true, steam: true, stack: 2 },
  { cc: 'pl', name: 'Poland', wiki: 'pl', spotify: true, steam: true, stack: 2 },
  { cc: 'tr', name: 'Turkey', wiki: 'tr', spotify: true, steam: true, stack: 2 },
  { cc: 'il', name: 'Israel', wiki: 'he', spotify: true, steam: true, stack: 2 },
  { cc: 'sa', name: 'Saudi Arabia', wiki: 'ar', spotify: true, steam: true, stack: 2 },
  { cc: 'sg', name: 'Singapore', wiki: 'en', spotify: true, steam: true, stack: 2 },
  { cc: 'tw', name: 'Taiwan', wiki: 'zh', spotify: true, steam: true, stack: 2 },
  { cc: 'hk', name: 'Hong Kong', wiki: 'zh', spotify: true, steam: true, stack: 2 },
  { cc: 'vn', name: 'Vietnam', wiki: 'vi', spotify: true, steam: true, stack: 2 },
  { cc: 'th', name: 'Thailand', wiki: 'th', spotify: true, steam: true, stack: 2 },
  { cc: 'ph', name: 'Philippines', wiki: 'en', spotify: true, steam: true, stack: 2 },
  // stack 3 (2026-11-27): emerging markets and smaller rich markets
  { cc: 'ar', name: 'Argentina', wiki: 'es', spotify: true, steam: true, stack: 3 },
  { cc: 'za', name: 'South Africa', wiki: 'en', spotify: true, steam: true, stack: 3 },
  { cc: 'eg', name: 'Egypt', wiki: 'ar', spotify: true, steam: true, stack: 3 },
  { cc: 'ke', name: 'Kenya', wiki: 'en', spotify: false, steam: true, stack: 3 },
  { cc: 'cl', name: 'Chile', wiki: 'es', spotify: true, steam: true, stack: 3 },
  { cc: 'co', name: 'Colombia', wiki: 'es', spotify: true, steam: true, stack: 3 },
  { cc: 'my', name: 'Malaysia', wiki: 'ms', spotify: true, steam: true, stack: 3 },
  { cc: 'pk', name: 'Pakistan', wiki: 'ur', spotify: true, steam: true, stack: 3 },
  { cc: 'ie', name: 'Ireland', wiki: 'en', spotify: true, steam: true, stack: 3 },
  { cc: 'at', name: 'Austria', wiki: 'de', spotify: true, steam: true, stack: 3 },
  { cc: 'be', name: 'Belgium', wiki: 'nl', spotify: true, steam: true, stack: 3 },
  { cc: 'dk', name: 'Denmark', wiki: 'da', spotify: true, steam: true, stack: 3 },
  { cc: 'no', name: 'Norway', wiki: 'no', spotify: true, steam: true, stack: 3 },
  { cc: 'fi', name: 'Finland', wiki: 'fi', spotify: true, steam: true, stack: 3 },
  { cc: 'nz', name: 'New Zealand', wiki: 'en', spotify: true, steam: true, stack: 3 },
  { cc: 'pt', name: 'Portugal', wiki: 'pt', spotify: true, steam: true, stack: 3 },
];
// stack 4 (2026-11-28): every other country with Apple app charts (checked one by one); * = it also has a Spotify chart on
// Kworb. Charts only (no Wikipedia language or ban search): the thinnest data, added last.
const STACK4 = 'af al dz ao ag am az bs bh bb bz bj bm bt bo* bw vg bn bg* bf kh cm cv ky td cg cd cr* ci cz* dm do* ec* sv* ee* sz fj ga gm ge gr* gd gt* gw gy hn* hu* is* iq jm jo kz* xk kw kg la lv* lr ly lt* lu* mo mg mw mv ml mr mu fm md mn me ms ma* mz mm na nr np ne mk om pw pa* pg py* pe* qa ro* ru* rw st sn rs sc sl si sb lk kn lc vc tj to tt tn tm tc ug ua* uy* uz vu ve* ye zm';
const regionName = (cc: string) => { try { return new Intl.DisplayNames('en', { type: 'region' }).of(cc.toUpperCase()) ?? cc.toUpperCase(); } catch { return cc.toUpperCase(); } };
export const COUNTRIES: Country[] = [...MAIN, ...STACK4.split(' ').map((t) => { const cc = t.replace('*', ''); return { cc, name: regionName(cc), wiki: '', spotify: t.endsWith('*'), steam: false, stack: 4 }; })];
export const STACK_LABEL: Record<number, string> = { 1: 'First 15', 2: 'Next 15', 3: '16 more', 4: 'Rest of the world (app charts only)' };
/** Wikipedia languages read (one list per language, stored under `wiki:<lang>`). */
export const WIKI_LANGS = [...new Set(COUNTRIES.map((c) => c.wiki).filter(Boolean))];

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
const WIKI_SKIP = /:|^(Main_Page|Wikipedia|Special|Portal|Pagina_principale|Página_principal|Accueil|Hauptseite|Hoofdpagina|Huvudsida|Laman_Utama|صفحہ_اول|Forside|Hovedside|Etusivu|Strona_główna|Anasayfa|עמוד_ראשי|Trang_Chính|หน้าหลัก|メインページ|大文|首页|मुख्य_पृष्ठ|Halaman_Utama|الصفحة_الرئيسية|-)$/i;
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
/** r = the last 14 nightly ranks (enough for the week-on-week change; keeps the file small with 160+ countries) */
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
    else if (s.last !== date) rec.seen[it.where] = { first: s.first, last: date, days: s.days + 1, best: Math.min(s.best, it.rank), r: [...s.r, [date, it.rank] as [string, number]].slice(-14) };
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
/** The first night each place was collected (its earliest first-seen date): a thing that is "first seen" there on that
 *  night was already popular before collection started, so it is not new there and not a spread. */
export function placeSince(db: TrendDb): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of Object.values(db.items)) for (const [w, s] of Object.entries(r.seen)) if (!out[w] || s.first < out[w]) out[w] = s.first;
  return out;
}

export function spreading(db: TrendDb, minPlaces = 2): Spread[] {
  const out: Spread[] = [];
  const since = placeSince(db);
  for (const r of Object.values(db.items)) {
    const cs = Object.entries(r.seen).filter(([w]) => !w.startsWith('wiki:') && w !== 'world');
    if (cs.length < minPlaces) continue;
    const sorted = cs.sort((a, b) => a[1].first.localeCompare(b[1].first));
    const [origin, o] = sorted[0];
    const later = sorted.slice(1).filter(([w, s]) => s.first > o.first && s.first > (since[w] ?? '')).map(([where, s]) => ({ where, first: s.first, best: s.best }));
    if (!later.length) continue;
    out.push({ id: r.id, src: r.src, name: r.name, by: r.by, url: r.url, origin, originFirst: o.first, later, places: cs.length });
  }
  return out.sort((a, b) => (b.later.at(-1)!.first.localeCompare(a.later.at(-1)!.first)) || b.places - a.places);
}

// ---------- page summary (computed on the server from the database) ----------
export interface Row { id: string; src: Src; name: string; by?: string; url?: string; note?: string; rank: number; first: string; days: number; best: number; trend: number | null }
export interface CountrySum { cc: string; name: string; stack: number; region: string; now: Partial<Record<Src, Row[]>>; fresh: Row[]; heat: number; heatBy: Partial<Record<Src, number>> }
export interface Wide { id: string; src: Src; name: string; by?: string; url?: string; places: { cc: string; rank: number }[] }
export interface TrendSummary { wideMin: number; updated: string; nights: number; warmingUp: boolean; spreading: (Spread & { originName: string })[]; startups: StartupRadar; bans: { cc: string; name: string; items: News[] }[]; recalls: News[]; wide: Wide[]; local: (Row & { cc: string })[]; countries: CountrySum[]; world: Partial<Record<Src, Row[]>>; wiki: { lang: string; rows: Row[] }[] }

const NAME: Record<string, string> = Object.fromEntries(COUNTRIES.map((c) => [c.cc, c.name]));
export const placeName = (w: string) => NAME[w] ?? (w.startsWith('wiki:') ? `Wikipedia (${w.slice(5)})` : w === 'world' ? 'Worldwide' : w);

/** A place's row for a thing on the latest night: rank now, and the change vs about a week earlier (positive = climbing). */
/** A place's row on the latest collection: rank now, and the change since the collection before (positive = climbing). */
function rowAt(r: Rec, where: string, updated: string, prev?: string): Row | null {
  const s = r.seen[where]; if (!s || s.last !== updated) return null;
  const now = s.r.at(-1)![1];
  const then = prev ? [...s.r].reverse().find(([d]) => d <= prev)?.[1] : undefined;
  return { id: r.id, src: r.src, name: r.name, by: r.by, url: r.url, note: r.note, rank: now, first: s.first, days: s.days, best: s.best, trend: then != null ? then - now : null };
}

/** Everything the Global trends page shows. "New" = first seen on the latest collection (collected every 2 weeks), once
 *  there is an earlier collection to compare with; before that the page shows the charts and says it is warming up. */
/** `lists(cc)` says which countries get their chart lists (the page loads one country's lists when it is opened). */
export function summarize(db: TrendDb, perList = 10, lists: (cc: string) => boolean = () => true): TrendSummary {
  const updated = db.updated, since = placeSince(db);
  // collected every 2 weeks (Jai, 2026-11-28): "new" = first seen on the latest collection; needs one earlier collection
  const warmingUp = db.nights.length < 2;
  const prev = db.nights.at(-2);
  // a country added in a later stack warms up on its own: no "new" there until it has been collected once before
  const nightsSince = (cc: string) => db.nights.filter((n) => n > (since[cc] ?? updated)).length;
  const recs = Object.values(db.items);
  const countries: CountrySum[] = COUNTRIES.map((c) => {
    const now: Partial<Record<Src, Row[]>> = {}, heatBy: Partial<Record<Src, number>> = {}, fresh: Row[] = [];
    for (const r of recs) {
      const row = rowAt(r, c.cc, updated, prev); if (!row) continue;
      if (lists(c.cc)) (now[r.src] ??= []).push(row);
      if (!warmingUp && nightsSince(c.cc) >= 1 && row.first > (since[c.cc] ?? updated) && (!prev || row.first > prev)) { fresh.push(row); heatBy[r.src] = (heatBy[r.src] ?? 0) + 1; }
    }
    for (const k of Object.keys(now) as Src[]) now[k] = now[k]!.sort((a, b) => a.rank - b.rank).slice(0, perList);
    return { cc: c.cc, name: c.name, stack: c.stack ?? 1, region: regionOf(c.cc), now, fresh: lists(c.cc) ? fresh.sort((a, b) => a.rank - b.rank).slice(0, 20) : [], heat: fresh.length, heatBy };
  });
  const world: Partial<Record<Src, Row[]>> = {};
  for (const r of recs) { const row = rowAt(r, 'world', updated, prev); if (row) (world[r.src] ??= []).push(row); }
  for (const k of Object.keys(world) as Src[]) world[k] = world[k]!.sort((a, b) => a.rank - b.rank).slice(0, 20);
  const wiki = WIKI_LANGS.map((lang) => ({ lang, rows: recs.map((r) => rowAt(r, `wiki:${lang}`, updated, prev)).filter((x): x is Row => !!x).sort((a, b) => a.rank - b.rank).slice(0, perList) }));
  // on the charts in many countries now, and big in only one (top 10 there, on no other country's chart: a copycat lead)
  const CHART: Src[] = ['apps-free', 'apps-paid', 'steam', 'music'];
  const WIDE = Math.max(5, Math.round(COUNTRIES.length / 4)); // "everywhere" = a quarter of the countries or more
  const wide: Wide[] = [], local: (Row & { cc: string })[] = [];
  for (const r of recs) {
    if (!CHART.includes(r.src)) continue;
    const places = COUNTRIES.flatMap((c) => { const x = rowAt(r, c.cc, updated, prev); return x ? [{ cc: c.cc, rank: x.rank }] : []; });
    if (places.length >= WIDE) wide.push({ id: r.id, src: r.src, name: r.name, by: r.by, url: r.url, places: places.sort((a, b) => a.rank - b.rank) });
    if (places.length === 1 && places[0].rank <= 10 && Object.keys(r.seen).filter((w) => NAME[w]).length === 1) { const x = rowAt(r, places[0].cc, updated, prev)!; local.push({ ...x, cc: places[0].cc }); }
  }
  wide.sort((a, b) => b.places.length - a.places.length || a.places[0].rank - b.places[0].rank);
  local.sort((a, b) => a.rank - b.rank || a.cc.localeCompare(b.cc));
  const recentNews = (db.news ?? []).filter((n) => n.date >= new Date(Date.parse(`${updated}T00:00:00Z`) - 14 * 86400_000).toISOString().slice(0, 10));
  const bans = BAN_FEEDS.map((f) => ({ cc: f.cc, name: NAME[f.cc] ?? f.cc, items: recentNews.filter((n) => n.kind === 'ban' && n.cc === f.cc).slice(0, 15) }));
  return { wideMin: WIDE, updated, nights: db.nights.length, warmingUp, startups: startupRadar(db.raises, updated), bans, recalls: recentNews.filter((n) => n.kind === 'recall').slice(0, 30), wide: wide.slice(0, 40), local: local.slice(0, 120), spreading: spreading(db).slice(0, 80).map((s) => ({ ...s, originName: placeName(s.origin) })), countries, world, wiki };
}


// ---------- ban watch: news of bans per country (Google News search, local language) and US recalls ----------
/** One Google News RSS search per country, in its own language: bans on apps, products, sales or imports in the last week.
 *  Google News has no mainland China edition. Headlines only; unofficial feed. */
export const BAN_FEEDS: { cc: string; hl: string; gl: string; q: string; ceid?: string }[] = [
  ...['us', 'gb', 'ca', 'au', 'in', 'ng'].map((cc) => ({ cc, hl: cc === 'us' ? 'en-US' : `en-${cc.toUpperCase()}`, gl: cc.toUpperCase(), q: '(banned OR "ban on" OR "bans") (app OR product OR sale OR import OR platform) when:14d' })),
  { cc: 'de', hl: 'de', gl: 'DE', q: '(Verbot OR verboten OR Verkaufsverbot) (App OR Produkt OR Verkauf OR Import) when:14d' },
  { cc: 'fr', hl: 'fr', gl: 'FR', q: '(interdiction OR interdit) (application OR produit OR vente OR importation) when:14d' },
  { cc: 'jp', hl: 'ja', gl: 'JP', q: '禁止 (アプリ OR 製品 OR 販売 OR 輸入) when:14d' },
  { cc: 'kr', hl: 'ko', gl: 'KR', q: '금지 (앱 OR 제품 OR 판매 OR 수입) when:14d' },
  { cc: 'br', hl: 'pt-BR', gl: 'BR', q: '(proibição OR proibido OR proíbe) (aplicativo OR produto OR venda OR importação) when:14d' },
  { cc: 'mx', hl: 'es-419', gl: 'MX', q: '(prohibición OR prohíbe OR prohibido) (aplicación OR producto OR venta OR importación) when:14d' },
  { cc: 'id', hl: 'id', gl: 'ID', q: '(larangan OR dilarang) (aplikasi OR produk OR penjualan OR impor) when:14d' },
  { cc: 'ae', hl: 'ar', gl: 'AE', q: 'حظر (تطبيق OR منتج OR بيع OR استيراد) when:14d' },
  // stack 2
  { cc: 'it', hl: 'it', gl: 'IT', q: '(divieto OR vietato OR vieta) (app OR prodotto OR vendita OR importazione) when:14d' },
  { cc: 'es', hl: 'es', gl: 'ES', q: '(prohibición OR prohíbe OR prohibido) (aplicación OR producto OR venta OR importación) when:14d' },
  { cc: 'nl', hl: 'nl', gl: 'NL', q: '(verbod OR verboden OR verbiedt) (app OR product OR verkoop OR import) when:14d' },
  { cc: 'se', hl: 'sv', gl: 'SE', q: '(förbud OR förbjuder OR förbjuds) (app OR produkt OR försäljning OR import) when:14d' },
  { cc: 'ch', hl: 'de', gl: 'CH', q: '(Verbot OR verboten OR Verkaufsverbot) (App OR Produkt OR Verkauf OR Import) when:14d' },
  { cc: 'pl', hl: 'pl', gl: 'PL', q: '(zakaz OR zakazuje OR zakazany) (aplikacja OR produkt OR sprzedaż OR import) when:14d' },
  { cc: 'tr', hl: 'tr', gl: 'TR', q: '(yasak OR yasaklandı OR yasakladı) (uygulama OR ürün OR satış OR ithalat) when:14d' },
  { cc: 'il', hl: 'he', gl: 'IL', q: '(איסור OR אסר OR נאסר) (אפליקציה OR מוצר OR מכירה OR יבוא) when:14d' },
  { cc: 'sa', hl: 'ar', gl: 'SA', q: 'حظر (تطبيق OR منتج OR بيع OR استيراد) when:14d' },
  { cc: 'sg', hl: 'en-SG', gl: 'SG', q: '(banned OR "ban on" OR "bans") (app OR product OR sale OR import OR platform) when:14d' },
  { cc: 'tw', hl: 'zh-TW', gl: 'TW', ceid: 'TW:zh-Hant', q: '(禁止 OR 禁令 OR 禁售) (App OR 產品 OR 販售 OR 進口) when:14d' },
  { cc: 'hk', hl: 'zh-HK', gl: 'HK', ceid: 'HK:zh-Hant', q: '(禁止 OR 禁令 OR 禁售) (App OR 產品 OR 銷售 OR 進口) when:14d' },
  { cc: 'vn', hl: 'vi', gl: 'VN', q: 'cấm (ứng dụng OR sản phẩm OR bán OR nhập khẩu) when:14d' },
  { cc: 'th', hl: 'th', gl: 'TH', q: '(ห้าม OR แบน) (แอป OR สินค้า OR จำหน่าย OR นำเข้า) when:14d' },
  { cc: 'ph', hl: 'en-PH', gl: 'PH', q: '(banned OR "ban on" OR "bans") (app OR product OR sale OR import OR platform) when:14d' },
  // stack 3
  { cc: 'ar', hl: 'es-419', gl: 'AR', ceid: 'AR:es-419', q: '(prohibición OR prohíbe OR prohibido) (aplicación OR producto OR venta OR importación) when:14d' },
  { cc: 'za', hl: 'en-ZA', gl: 'ZA', q: '(banned OR "ban on" OR "bans") (app OR product OR sale OR import OR platform) when:14d' },
  { cc: 'eg', hl: 'ar', gl: 'EG', q: 'حظر (تطبيق OR منتج OR بيع OR استيراد) when:14d' },
  { cc: 'ke', hl: 'en-KE', gl: 'KE', q: '(banned OR "ban on" OR "bans") (app OR product OR sale OR import OR platform) when:14d' },
  { cc: 'cl', hl: 'es-419', gl: 'CL', ceid: 'CL:es-419', q: '(prohibición OR prohíbe OR prohibido) (aplicación OR producto OR venta OR importación) when:14d' },
  { cc: 'co', hl: 'es-419', gl: 'CO', ceid: 'CO:es-419', q: '(prohibición OR prohíbe OR prohibido) (aplicación OR producto OR venta OR importación) when:14d' },
  { cc: 'my', hl: 'ms', gl: 'MY', q: '(larangan OR diharamkan OR dilarang) (aplikasi OR produk OR jualan OR import) when:14d' },
  { cc: 'pk', hl: 'en-PK', gl: 'PK', q: '(banned OR "ban on" OR "bans") (app OR product OR sale OR import OR platform) when:14d' },
  { cc: 'ie', hl: 'en-IE', gl: 'IE', q: '(banned OR "ban on" OR "bans") (app OR product OR sale OR import OR platform) when:14d' },
  { cc: 'at', hl: 'de', gl: 'AT', q: '(Verbot OR verboten OR Verkaufsverbot) (App OR Produkt OR Verkauf OR Import) when:14d' },
  { cc: 'be', hl: 'nl', gl: 'BE', q: '(verbod OR verboden OR verbiedt) (app OR product OR verkoop OR import) when:14d' },
  { cc: 'dk', hl: 'da', gl: 'DK', q: '(forbud OR forbyder OR forbudt) (app OR produkt OR salg OR import) when:14d' },
  { cc: 'no', hl: 'no', gl: 'NO', q: '(forbud OR forbyr OR forbudt) (app OR produkt OR salg OR import) when:14d' },
  { cc: 'fi', hl: 'fi', gl: 'FI', q: '(kielto OR kieltää OR kielletty) (sovellus OR tuote OR myynti OR tuonti) when:14d' },
  { cc: 'nz', hl: 'en-NZ', gl: 'NZ', q: '(banned OR "ban on" OR "bans") (app OR product OR sale OR import OR platform) when:14d' },
  { cc: 'pt', hl: 'pt-PT', gl: 'PT', ceid: 'PT:pt-150', q: '(proibição OR proibido OR proíbe) (aplicação OR produto OR venda OR importação) when:14d' },
];
export const banUrl = (f: (typeof BAN_FEEDS)[number]) => `https://news.google.com/rss/search?q=${encodeURIComponent(f.q)}&hl=${f.hl}&gl=${f.gl}&ceid=${f.ceid ?? `${f.gl}:${f.hl.split('-')[0]}`}`;
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
/** Merge tonight's headlines in (deduped by headline): 30 days at most, the newest 20 per country (and 20 recalls). */
export function addNews(db: TrendDb, items: News[], today: string): TrendDb {
  const cut = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86400_000).toISOString().slice(0, 10);
  const map = new Map((db.news ?? []).map((n) => [n.id, n]));
  for (const n of items) if (!map.has(n.id)) map.set(n.id, n);
  const kept = new Map<string, number>();
  const news = [...map.values()].filter((n) => n.date >= cut).sort((a, b) => b.date.localeCompare(a.date)).filter((n) => { const k = `${n.kind}:${n.cc}`, c = (kept.get(k) ?? 0) + 1; kept.set(k, c); return c <= 20; });
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

// ---------- regions (Jai's list, 2026-11-28): how the country tiles are grouped ----------
export const REGIONS = ['North America', 'Central America & Caribbean', 'South America', 'Europe', 'Middle East & North Africa', 'Sub-Saharan Africa', 'Central & South Asia', 'East & Southeast Asia', 'Australia & Pacific Islands'] as const;
export type Region = (typeof REGIONS)[number];
const R: Record<Region, string> = {
  'North America': 'us ca bm',
  'Central America & Caribbean': 'mx ag bs bb bz vg ky cr dm do sv gd gt hn jm ms pa kn lc vc tt tc',
  'South America': 'br ar cl co bo ec gy py pe uy ve',
  'Europe': 'gb de fr it es nl se ch pl ie at be dk no fi pt al am az bg cz ee ge gr hu is xk lv lt lu md me mk ro ru rs si ua tr',
  'Middle East & North Africa': 'ae il sa eg dz bh iq jo kw ly ma om qa tn ye',
  'Sub-Saharan Africa': 'ng za ke ao bj bw bf cm cv td cg cd ci sz ga gm gw lr mg mw ml mr mu mz na ne rw st sn sc sl ug zm',
  'Central & South Asia': 'in pk af bt kz kg mv np lk tj tm uz',
  'East & Southeast Asia': 'jp kr cn tw hk sg vn th ph my id bn kh la mo mn mm',
  'Australia & Pacific Islands': 'au nz fj fm nr pw pg sb to vu',
};
const REGION_OF: Record<string, Region> = Object.fromEntries(Object.entries(R).flatMap(([reg, ccs]) => ccs.split(' ').map((cc) => [cc, reg as Region])));
export const regionOf = (cc: string): Region | 'Other' => REGION_OF[cc] ?? 'Other';
