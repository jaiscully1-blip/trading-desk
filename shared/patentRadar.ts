// Patent theme radar (Patents & Tech page): US utility patents made public and granted in the last 90 days vs the same
// 90 days a year earlier, per theme, plus who files most. Themes are CPC classification prefixes. Pure + tested.

export interface Theme { id: string; label: string; group: string; cpc: string[] }
export const RADAR_GROUPS = ['AI and chips', 'Biotech and drugs', 'Energy and EVs', 'Robotics and space', 'All sectors'] as const;
export const RADAR: Theme[] = [
  { id: 'ai', label: 'AI and machine learning', group: 'AI and chips', cpc: ['G06N'] },
  { id: 'semis', label: 'Semiconductors and chips', group: 'AI and chips', cpc: ['H01L', 'H10'] },
  { id: 'computing', label: 'Computing and data', group: 'AI and chips', cpc: ['G06F'] },
  { id: 'quantum', label: 'Quantum computing', group: 'AI and chips', cpc: ['G06N10', 'H10N60'] },
  { id: 'drugs', label: 'Drugs and treatments', group: 'Biotech and drugs', cpc: ['A61K', 'A61P'] },
  { id: 'genes', label: 'Gene editing, mRNA, biotech', group: 'Biotech and drugs', cpc: ['C12N'] },
  { id: 'antibodies', label: 'Antibodies and proteins', group: 'Biotech and drugs', cpc: ['C07K'] },
  { id: 'meddev', label: 'Medical devices and diagnostics', group: 'Biotech and drugs', cpc: ['A61B', 'A61F', 'A61M'] },
  { id: 'batteries', label: 'Batteries', group: 'Energy and EVs', cpc: ['H01M'] },
  { id: 'ev', label: 'Electric vehicles and charging', group: 'Energy and EVs', cpc: ['B60L'] },
  { id: 'grid', label: 'Power grid and solar', group: 'Energy and EVs', cpc: ['H02J', 'H02S'] },
  { id: 'nuclear', label: 'Nuclear', group: 'Energy and EVs', cpc: ['G21'] },
  { id: 'robots', label: 'Robots', group: 'Robotics and space', cpc: ['B25J'] },
  { id: 'autonomy', label: 'Self-driving and autonomy', group: 'Robotics and space', cpc: ['B60W', 'G05D'] },
  { id: 'drones', label: 'Drones and aircraft', group: 'Robotics and space', cpc: ['B64C', 'B64D', 'B64U'] },
  { id: 'space', label: 'Space and satellites', group: 'Robotics and space', cpc: ['B64G'] },
  { id: 'A', label: 'Health, food, everyday life', group: 'All sectors', cpc: ['A'] },
  { id: 'B', label: 'Manufacturing and transport', group: 'All sectors', cpc: ['B'] },
  { id: 'C', label: 'Chemistry and materials', group: 'All sectors', cpc: ['C'] },
  { id: 'D', label: 'Textiles and paper', group: 'All sectors', cpc: ['D'] },
  { id: 'E', label: 'Construction and mining', group: 'All sectors', cpc: ['E'] },
  { id: 'F', label: 'Mechanical, engines, heating', group: 'All sectors', cpc: ['F'] },
  { id: 'G', label: 'Computing, physics, measuring', group: 'All sectors', cpc: ['G'] },
  { id: 'H', label: 'Electricity and electronics', group: 'All sectors', cpc: ['H'] },
  { id: 'Y', label: 'Emerging cross-sector tech', group: 'All sectors', cpc: ['Y'] },
];

/** How a CPC prefix is written in the query. The USPTO's exact syntax is not documented for prefixes, so the server tries
 *  these in order on the first theme and remembers the first form that returns results. */
export const CPC_FORMS = ['wild', 'quoted-wild'] as const;
export type CpcForm = typeof CPC_FORMS[number];
const FIELD = 'applicationMetaData.cpcClassificationBag';
export function themeQ(cpc: string[], form: CpcForm): string {
  const one = (p: string) => (form === 'wild' ? `${FIELD}:${p}*` : `${FIELD}:"${p}*"`);
  return cpc.length === 1 ? one(cpc[0]) : `(${cpc.map(one).join(' OR ')})`;
}

/** Sub-category codes (e.g. G06N10 = quantum computing) are stored as "G06N  10/40" (padded with spaces), which a plain prefix
 *  does not reach. These are the spellings tried, in order, for a prefix with a group number; the first that finds
 *  anything is kept. Class-level prefixes (G06N, H01M) need no variants. */
export function prefixVariants(p: string): string[] {
  const m = /^([A-HY]\d{2}[A-Z])(\d+)$/.exec(p);
  if (!m) return [`${FIELD}:${p}*`];
  // stored like "G06N   3/0455": the group number right-aligned in 4 characters, so quantum (G06N10) is "G06N  10/..."
  const pad = ' '.repeat(Math.max(0, 4 - m[2].length));
  return [`${FIELD}:${m[1]}${pad.replace(/ /g, '\\ ')}${m[2]}/*`, `${FIELD}:"${m[1]}${pad}${m[2]}/*"`, `${FIELD}:${p}*`, `${FIELD}:${m[1]}\\ ${m[2]}*`];
}
/** A sub-category count is believable only if it is above zero and below its parent class (G06N10 is part of G06N).
 *  This rejects a spelling the search reads as "match anything". */
export const plausibleSub = (n: number, parent: number) => n > 0 && parent > 0 && n < parent;
export const hasGroup = (t: Theme) => t.cpc.some((p) => /^[A-HY]\d{2}[A-Z]\d+$/.test(p));
/** Query for a theme with one chosen spelling per prefix. */
export const orQ = (parts: string[]) => (parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`);

/** Baseline: every US utility patent (the Utility filter is applied to every radar query anyway). */
export const BASELINE_Q = 'applicationMetaData.applicationTypeLabelName:"Utility"';
/** A theme's change minus the overall change, in percentage points: positive = gaining share of all patenting. */
export const relChange = (theme: number | null, base: number | null): number | null => (theme == null || base == null ? null : theme - base);

export interface Window { from: string; to: string }
const day = (d: Date) => d.toISOString().slice(0, 10);
/** Last 90 days ending yesterday, and the same 90 days one year earlier. */
export function radarWindows(now: Date): { cur: Window; prev: Window } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const start = new Date(end.getTime() - 89 * 86400000);
  const back = (d: Date) => new Date(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), d.getUTCDate()));
  return { cur: { from: day(start), to: day(end) }, prev: { from: day(back(start)), to: day(back(end)) } };
}

export type RadarKind = 'published' | 'granted';
export function radarBody(q: string, kind: RadarKind, w: Window, facet = false) {
  return {
    q,
    filters: [{ name: 'applicationMetaData.applicationTypeLabelName', value: ['Utility'] }],
    rangeFilters: [{ field: kind === 'published' ? 'applicationMetaData.earliestPublicationDate' : 'applicationMetaData.grantDate', valueFrom: w.from, valueTo: w.to }],
    pagination: { offset: 0, limit: 1 },
    fields: ['applicationNumberText'],
    ...(facet ? { facets: ['applicationMetaData.firstApplicantName'] } : {}),
  };
}

/** Top values from a facets answer. The response shape is not documented, so this accepts the common forms:
 *  facets: [{ field, values|buckets|facetValues: [{ value|key, count|docCount }] }] or { field: [{...}] }. */
export function topFacet(j: any, n = 5): { name: string; n: number }[] {
  const f = j?.facets;
  const lists: any[] = Array.isArray(f) ? f.map((x: any) => x?.values ?? x?.buckets ?? x?.facetValues ?? x?.counts ?? []) : f && typeof f === 'object' ? Object.values(f) : [];
  const rows = lists.flat().map((v: any) => ({ name: String(v?.value ?? v?.key ?? v?.name ?? ''), n: Number(v?.count ?? v?.docCount ?? v?.doc_count ?? 0) }));
  return rows.filter((r) => r.name && r.n > 0).sort((a, b) => b.n - a.n).slice(0, n);
}

export const change = (cur: number | null, prev: number | null): number | null => (cur == null || prev == null || prev === 0 ? null : ((cur - prev) / prev) * 100);
