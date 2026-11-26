// SPVs, SPEs and VIEs for one company, from its SEC filings: (1) the numbers it tags in XBRL for variable interest entities
// (any us-gaap concept whose name contains "VariableInterestEntity", shown with the SEC's own label), (2) the 10-K's own
// sentences about VIEs, special purpose entities, securitization trusts and off-balance-sheet arrangements (quoted word for
// word, no AI), (3) subsidiaries in Exhibit 21 whose names look like financing vehicles. Pure + tested. Facts, not advice.

export interface VieFact { concept: string; label: string; value: number; unit: string; end: string; form: string; prior: number | null; priorEnd: string | null }

/** Latest annual-or-quarterly value of every VIE concept, with the value a year earlier when there is one. Concepts the
 *  company stopped using (latest value older than `staleBefore`, or labelled "Deprecated") are counted, not shown. */
export function vieFacts(j: any, staleBefore = ''): VieFact[] & { hidden?: number } {
  const g = j?.facts?.['us-gaap'] ?? {};
  const out: VieFact[] = [];
  let hidden = 0;
  for (const [concept, c] of Object.entries<any>(g)) {
    if (!/VariableInterestEntit/i.test(concept)) continue;
    const unit = Object.keys(c?.units ?? {})[0];
    const rows = ((c?.units?.[unit] ?? []) as any[]).filter((r) => /^10-[KQ]/.test(String(r.form)) && Number.isFinite(Number(r.val)) && r.end);
    if (!rows.length) continue;
    rows.sort((a, b) => String(a.end).localeCompare(String(b.end)) || String(a.filed ?? '').localeCompare(String(b.filed ?? '')));
    const last = rows.at(-1)!;
    const yearBack = new Date(Date.parse(last.end) - 365 * 86400000).getTime();
    const prior = [...rows].reverse().find((r) => Math.abs(Date.parse(r.end) - yearBack) < 45 * 86400000) ?? null;
    if (/deprecated/i.test(String(c.label)) || (staleBefore && String(last.end) < staleBefore)) { hidden++; continue; }
    out.push({ concept, label: String(c.label ?? concept), value: Number(last.val), unit, end: String(last.end), form: String(last.form), prior: prior ? Number(prior.val) : null, priorEnd: prior ? String(prior.end) : null });
  }
  // newest first, then bigger first
  const res = out.sort((a, b) => b.end.localeCompare(a.end) || Math.abs(b.value) - Math.abs(a.value)).slice(0, 20) as VieFact[] & { hidden?: number };
  res.hidden = hidden;
  return res;
}

const TERMS: [RegExp, string][] = [
  [/variable interest entit(y|ies)|\bVIEs?\b/, 'Variable interest entities (VIEs)'],
  [/special[- ]purpose (entit|vehicle|compan)|\bSP[EV]s?\b/, 'Special purpose entities / vehicles'],
  [/securiti[sz]ation (trust|entit|vehicle|facilit|program)|asset[- ]backed (securit|financ)|warehouse (facilit|line)/, 'Securitizations'],
  [/off[- ]balance[- ]sheet arrangement/, 'Off-balance-sheet arrangements'],
];
// page furniture, cross-references and glossary lines: not worth quoting
const JUNK = /the following table|forward-looking|incorporated (herein )?by reference|see note \d+ for|table of contents|Note \d+\s*[—–-]|for purposes of this report|refers? to|“[^”]{1,40}”[^“]{0,60}“[^”]{1,40}”[^“]{0,60}“/i;
const SUBSTANCE = /\$\s?\d|\d[\d,.]*\s*(million|billion)|consolidat|carrying amount|maximum (loss )?exposure|outstanding|recourse/i;
/** The filing's own sentences on these topics, grouped (at most `per` each): the ones with amounts or "consolidated" first,
 *  then in filing order. Boilerplate, page headers and glossary lines dropped. */
export function spvSentences(text: string, per = 6): { topic: string; sentences: string[] }[] {
  const sents = text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z(])/).filter((s) => s.length >= 60 && s.length <= 700 && !JUNK.test(s));
  return TERMS.map(([re, topic]) => {
    const hits = [...new Set(sents.filter((s) => re.test(s)))];
    const ranked = [...hits.filter((s) => SUBSTANCE.test(s)), ...hits.filter((s) => !SUBSTANCE.test(s))];
    return { topic, sentences: ranked.slice(0, per) };
  }).filter((g) => g.sentences.length);
}

/** Subsidiary names that look like financing vehicles (receivables, funding, trusts, issuers, securitization). */
const VEHICLE = /\b(receivables?|funding|securiti[sz]ation|trust\b|issuer|issuance|lease (trust|titling)|titling trust|SPV|SPE|warehouse|capital (I|II|III|IV|V|\d)\b|depositor|asset[- ]backed|ABS|master trust|note issuer)/i;
const PLACE = /[\s,]+(Delaware|Nevada|New York|California|Texas|Michigan|Illinois|Ohio|Virginia|Maryland|Florida|Georgia|North Carolina|Massachusetts|New Jersey|Pennsylvania|Washington|Minnesota|Colorado|Utah|Ireland|England|United Kingdom|Luxembourg|Netherlands|Cayman Islands|Bermuda|Canada|Germany|Japan|Australia|Singapore|Mexico|Spain|France)(,?\s*(U\.?S\.?A?\.?|United States( of America)?))?\.?$/i;
/** Vehicle-like subsidiary names, with a trailing state or country (from the Exhibit 21 table) removed. */
export const vehicleNames = (subs: string[]) => [...new Set(subs.filter((s) => VEHICLE.test(s)).map((s) => s.replace(PLACE, '').trim()))].slice(0, 40);
