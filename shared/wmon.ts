// World Monitor: free, no-key government and intergovernmental feeds, normalized into one event list.
// Pure parsers (tested); the route in api/_lib/research/wmon.ts fetches them.

export type Cat = 'quake' | 'tsunami' | 'volcano' | 'storm' | 'fire' | 'disaster' | 'health' | 'recall' | 'policy' | 'travel' | 'space' | 'cyber' | 'aviation' | 'world';
export const CAT_LABEL: Record<Cat, string> = { quake: 'Earthquakes', tsunami: 'Tsunami', volcano: 'Volcanoes', storm: 'Storms', fire: 'Wildfires', disaster: 'Disasters', health: 'Health & outbreaks', recall: 'Recalls', policy: 'Policy & rules', travel: 'Travel advisories', space: 'Space weather', cyber: 'Cyber', aviation: 'Airports', world: 'UN & world' };
/** sev: 1 info, 2 notable, 3 severe */
export interface WEvent { id: string; feed: string; cat: Cat; title: string; url?: string; t: number; sev: 1 | 2 | 3; lat?: number; lon?: number; country?: string; detail?: string }

export interface FeedMeta { id: string; label: string; agency: string; cat: Cat; home: string; /** directory names this feed belongs to */ match: RegExp }
export const FEEDS: FeedMeta[] = [
  { id: 'usgs', label: 'Earthquakes M4.5+ (7 days)', agency: 'USGS', cat: 'quake', home: 'https://earthquake.usgs.gov', match: /geological survey|\busgs\b/i },
  { id: 'tsunami', label: 'Tsunami messages', agency: 'NOAA / NWS Tsunami Warning Centers', cat: 'tsunami', home: 'https://www.tsunami.gov', match: /tsunami|national weather service|\bnoaa\b|oceanic and atmospheric/i },
  { id: 'volcano', label: 'Elevated US volcanoes', agency: 'USGS Volcano Hazards', cat: 'volcano', home: 'https://volcanoes.usgs.gov', match: /geological survey|\busgs\b/i },
  { id: 'nhc', label: 'Active hurricanes and tropical storms', agency: 'NOAA National Hurricane Center', cat: 'storm', home: 'https://www.nhc.noaa.gov', match: /hurricane|\bnoaa\b|oceanic and atmospheric/i },
  { id: 'fires', label: 'Large active wildfires (1,000+ acres)', agency: 'National Interagency Fire Center', cat: 'fire', home: 'https://www.nifc.gov', match: /interagency fire|forest service|land management/i },
  { id: 'gdacs', label: 'Global disaster alerts (orange / red)', agency: 'GDACS (UN OCHA + European Commission)', cat: 'disaster', home: 'https://www.gdacs.org', match: /humanitarian affairs|\bocha\b|european commission|european union/i },
  { id: 'ifrc', label: 'Red Cross / Red Crescent emergencies', agency: 'IFRC (Red Cross)', cat: 'disaster', home: 'https://go.ifrc.org', match: /red cross|red crescent|\bifrc\b/i },
  { id: 'who', label: 'Disease Outbreak News', agency: 'World Health Organization', cat: 'health', home: 'https://www.who.int/emergencies/disease-outbreak-news', match: /world health organization|\bwho\b\)/i },
  { id: 'cdc', label: 'CDC newsroom', agency: 'CDC', cat: 'health', home: 'https://www.cdc.gov', match: /disease control|\bcdc\b/i },
  { id: 'ecdc', label: 'Europe disease threats', agency: 'ECDC (EU)', cat: 'health', home: 'https://www.ecdc.europa.eu', match: /european centre for disease|\becdc\b/i },
  { id: 'fda', label: 'Food recalls', agency: 'FDA (openFDA)', cat: 'recall', home: 'https://open.fda.gov', match: /food and drug administration|\bfda\b/i },
  { id: 'cpsc', label: 'Product recalls', agency: 'Consumer Product Safety Commission', cat: 'recall', home: 'https://www.cpsc.gov/Recalls', match: /consumer product safety/i },
  { id: 'fedreg', label: 'Significant federal rules', agency: 'Office of the Federal Register', cat: 'policy', home: 'https://www.federalregister.gov', match: /federal register|national archives/i },
  { id: 'sec', label: 'SEC press releases', agency: 'SEC', cat: 'policy', home: 'https://www.sec.gov/newsroom', match: /securities and exchange/i },
  { id: 'fed', label: 'Federal Reserve press releases', agency: 'Federal Reserve', cat: 'policy', home: 'https://www.federalreserve.gov', match: /federal reserve/i },
  { id: 'state', label: 'Travel advisories, level 3-4', agency: 'State Department', cat: 'travel', home: 'https://travel.state.gov', match: /department of state|state department|consular/i },
  { id: 'swpc', label: 'Space weather alerts', agency: 'NOAA Space Weather Prediction Center', cat: 'space', home: 'https://www.swpc.noaa.gov', match: /space weather|\bnoaa\b|oceanic and atmospheric/i },
  { id: 'cisa', label: 'Exploited software flaws (KEV)', agency: 'CISA', cat: 'cyber', home: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog', match: /cybersecurity and infrastructure|\bcisa\b/i },
  { id: 'faa', label: 'Airport ground stops and delays', agency: 'FAA', cat: 'aviation', home: 'https://nasstatus.faa.gov', match: /federal aviation/i },
  { id: 'un', label: 'UN News', agency: 'United Nations', cat: 'world', home: 'https://news.un.org', match: /^united nations\b/i },
];
/** Agencies whose feeds block automated requests (listed so nobody wonders where they are). */
export const BLOCKED = ['OFAC sanctions (Treasury) blocks automated requests', 'ReliefWeb (UN OCHA) now needs an approved app name', 'Cboe option chains block automated requests'];

const num = (x: any) => (Number.isFinite(Number(x)) ? Number(x) : undefined);
const ms = (x: any) => { const t = typeof x === 'number' ? x : Date.parse(String(x ?? '')); return Number.isFinite(t) ? t : 0; };
const strip = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export function usgs(j: any): WEvent[] {
  return (j?.features ?? []).map((f: any) => { const p = f.properties ?? {}, [lon, lat] = f.geometry?.coordinates ?? []; const m = Number(p.mag) || 0;
    return { id: `usgs:${f.id}`, feed: 'usgs', cat: 'quake', title: `M${m.toFixed(1)} earthquake, ${p.place ?? 'unknown place'}`, url: p.url, t: ms(p.time), sev: m >= 7 || p.alert === 'red' ? 3 : m >= 6 || p.alert === 'orange' || p.tsunami ? 2 : 1, lat: num(lat), lon: num(lon), detail: p.tsunami ? 'tsunami flag set' : undefined } as WEvent; });
}
export function gdacs(j: any, now = Date.now()): WEvent[] {
  const T: Record<string, string> = { EQ: 'Earthquake', TC: 'Tropical cyclone', FL: 'Flood', VO: 'Volcano', DR: 'Drought', WF: 'Wildfire' };
  // keep events still running in the last 10 days (GDACS returns a long history)
  return (j?.features ?? []).filter((f: any) => now - ms(f.properties?.todate ?? f.properties?.fromdate) < 10 * 86400_000).map((f: any) => { const p = f.properties ?? {}, [lon, lat] = f.geometry?.coordinates ?? [];
    const name = String(p.name ?? '').replace(/,\s*$/, '');
    return { id: `gdacs:${p.eventtype}${p.eventid}`, feed: 'gdacs', cat: p.eventtype === 'EQ' ? 'quake' : p.eventtype === 'TC' ? 'storm' : p.eventtype === 'WF' ? 'fire' : p.eventtype === 'VO' ? 'volcano' : 'disaster', title: `${p.alertlevel} alert: ${name.length > 110 ? name.slice(0, 110) + '…' : name || T[p.eventtype] || 'Event'}`, url: p.url?.report, t: ms(p.fromdate), sev: p.alertlevel === 'Red' ? 3 : 2, lat: num(lat), lon: num(lon), detail: p.severitydata?.severitytext } as WEvent; });
}
export function ifrc(j: any): WEvent[] {
  return (j?.results ?? []).map((e: any) => ({ id: `ifrc:${e.id}`, feed: 'ifrc', cat: 'disaster', title: String(e.name ?? 'Emergency'), url: `https://go.ifrc.org/emergencies/${e.id}`, t: ms(e.disaster_start_date), sev: 2, country: e.countries?.[0]?.name, detail: e.dtype?.name }) as WEvent);
}
export function who(j: any): WEvent[] {
  return (j?.value ?? []).map((v: any) => { const title = String(v.Title ?? ''); return { id: `who:${v.UrlName}`, feed: 'who', cat: 'health', title, url: `https://www.who.int/emergencies/disease-outbreak-news/item/${v.UrlName}`, t: ms(v.PublicationDateAndTime), sev: 2, country: title.split(' - ').slice(1).join(' - ') || undefined } as WEvent; });
}
export function nhc(j: any): WEvent[] {
  return (j?.activeStorms ?? []).map((s: any) => ({ id: `nhc:${s.id}`, feed: 'nhc', cat: 'storm', title: `${s.classification ?? ''} ${s.name ?? ''}: ${s.intensity ?? '?'} kt`.trim(), url: s.publicAdvisory?.url ?? 'https://www.nhc.noaa.gov', t: ms(s.lastUpdate), sev: Number(s.intensity) >= 64 ? 3 : 2, lat: num(s.latitudeNumeric), lon: num(s.longitudeNumeric) }) as WEvent);
}
export function fires(j: any): WEvent[] {
  return (j?.features ?? []).map((f: any) => { const a = f.attributes ?? {}; const acres = Number(a.IncidentSize) || 0;
    return { id: `fire:${a.IncidentName}:${a.FireDiscoveryDateTime}`, feed: 'fires', cat: 'fire', title: `${a.IncidentName} fire, ${String(a.POOState ?? '').replace('US-', '')}: ${Math.round(acres).toLocaleString('en-US')} acres${a.PercentContained != null ? `, ${a.PercentContained}% contained` : ''}`, url: 'https://www.nifc.gov/fire-information/nfn', t: ms(a.FireDiscoveryDateTime), sev: acres >= 50000 ? 3 : acres >= 10000 ? 2 : 1, lat: num(f.geometry?.y), lon: num(f.geometry?.x) } as WEvent; });
}
export function volcano(j: any): WEvent[] {
  return (Array.isArray(j) ? j : []).map((v: any) => ({ id: `volc:${v.vnum}`, feed: 'volcano', cat: 'volcano', title: `${v.volcano_name}: ${v.color_code} / ${v.alert_level}`, url: v.notice_url, t: ms(Number(v.sent_unixtime) * 1000), sev: v.alert_level === 'WARNING' || v.color_code === 'RED' ? 3 : v.alert_level === 'WATCH' ? 2 : 1, detail: v.obs_fullname }) as WEvent);
}
export function fda(j: any): WEvent[] {
  return (j?.results ?? []).map((r: any) => { const d = String(r.report_date ?? ''); return { id: `fda:${r.recall_number}`, feed: 'fda', cat: 'recall', title: `${r.classification ?? ''} recall: ${r.recalling_firm ?? ''}, ${String(r.product_description ?? '').slice(0, 90)}`, url: 'https://www.accessdata.fda.gov/scripts/ires/index.cfm', t: ms(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`), sev: r.classification === 'Class I' ? 2 : 1, detail: r.reason_for_recall } as WEvent; });
}
export function cpsc(j: any): WEvent[] {
  return (Array.isArray(j) ? j : []).slice(0, 15).map((r: any) => ({ id: `cpsc:${r.RecallID}`, feed: 'cpsc', cat: 'recall', title: String(r.Title ?? ''), url: r.URL, t: ms(r.RecallDate), sev: 1 }) as WEvent);
}
export function fedreg(j: any): WEvent[] {
  return (j?.results ?? []).map((r: any) => ({ id: `fr:${r.document_number}`, feed: 'fedreg', cat: 'policy', title: `${r.type}: ${r.title}`, url: r.html_url, t: ms(r.publication_date), sev: 1, detail: (r.agencies ?? []).map((a: any) => a.name).filter(Boolean).join(', ') }) as WEvent);
}
export function travel(j: any, now = Date.now()): WEvent[] {
  return (Array.isArray(j) ? j : []).filter((a: any) => /Level [34]/.test(a.Title) && now - ms(a.Updated) < 30 * 86400_000).map((a: any) => ({ id: `state:${a.id}:${a.Updated}`, feed: 'state', cat: 'travel', title: String(a.Title), url: a.Link, t: ms(a.Updated), sev: /Level 4/.test(a.Title) ? 2 : 1, country: String(a.Title).split(' - ')[0] }) as WEvent);
}
export function swpc(j: any, now = Date.now()): WEvent[] {
  return (Array.isArray(j) ? j : []).filter((a: any) => now - ms(String(a.issue_datetime).replace(' ', 'T') + 'Z') < 3 * 86400_000).slice(0, 10).map((a: any) => {
    const msg = String(a.message ?? ''), head = (msg.match(/\n(WATCH|WARNING|ALERT|SUMMARY|EXTENDED WARNING|CANCEL[^:]*):\s*([^\r\n]+)/) ?? [])[0]?.trim() ?? a.product_id;
    return { id: `swpc:${a.product_id}:${a.issue_datetime}`, feed: 'swpc', cat: 'space', title: head, url: 'https://www.swpc.noaa.gov/products/alerts-watches-and-warnings', t: ms(String(a.issue_datetime).replace(' ', 'T') + 'Z'), sev: /G[345]|S[345]|R[345]/.test(head) ? 3 : /G2|S2|R2/.test(head) ? 2 : 1 } as WEvent; });
}
export function cisa(j: any): WEvent[] {
  return [...(j?.vulnerabilities ?? [])].sort((a: any, b: any) => String(b.dateAdded).localeCompare(String(a.dateAdded))).slice(0, 12).map((v: any) => ({ id: `cisa:${v.cveID}`, feed: 'cisa', cat: 'cyber', title: `${v.vendorProject} ${v.product}: ${v.vulnerabilityName}`, url: `https://nvd.nist.gov/vuln/detail/${v.cveID}`, t: ms(v.dateAdded), sev: v.knownRansomwareCampaignUse === 'Known' ? 2 : 1, detail: v.cveID }) as WEvent);
}
export function faa(xml: string, now = Date.now()): WEvent[] {
  const out: WEvent[] = [];
  const blocks = xml.match(/<(Ground_Delay|Ground_Stop|Delay|Program)>[\s\S]*?<\/\1>/g) ?? [];
  for (const b of blocks) {
    const ap = (b.match(/<ARPT>([^<]+)<\/ARPT>/) ?? [])[1]; if (!ap) continue;
    const kind = b.startsWith('<Ground_Stop') ? 'Ground stop' : b.startsWith('<Ground_Delay') ? 'Ground delay' : 'Delays';
    const why = (b.match(/<Reason>([^<]+)<\/Reason>/) ?? [])[1] ?? '', avg = (b.match(/<Avg>([^<]+)<\/Avg>/) ?? [])[1];
    out.push({ id: `faa:${kind}:${ap}`, feed: 'faa', cat: 'aviation', title: `${kind} at ${ap}${avg ? `, avg ${avg}` : ''}`, url: 'https://nasstatus.faa.gov', t: now, sev: kind === 'Ground stop' ? 2 : 1, detail: why });
  }
  return out;
}
export function tsunami(xml: string): WEvent[] {
  return (xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []).map((e, i) => {
    const title = strip((e.match(/<title>([\s\S]*?)<\/title>/) ?? [])[1] ?? 'Tsunami message'), upd = (e.match(/<updated>([^<]+)<\/updated>/) ?? [])[1];
    const body = strip((e.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) ?? [])[1] ?? '');
    const kind = `${(xml.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? ''} ${body}`;
    const lvl = /information (statement|bulletin)|no tsunami (warning|threat)|not expected|no (destructive )?tsunami/i.test(kind) ? 1 : /tsunami warning/i.test(kind) ? 3 : /advisory|watch/i.test(kind) ? 2 : 1;
    return { id: `tsu:${upd}:${i}`, feed: 'tsunami', cat: 'tsunami', title: `${lvl === 1 ? 'Information statement' : lvl === 2 ? 'Advisory / watch' : 'Warning'}: ${title}`, url: 'https://www.tsunami.gov', t: ms(upd), sev: lvl as 1 | 2 | 3, lat: num((e.match(/<geo:lat>([^<]+)/) ?? [])[1]), lon: num((e.match(/<geo:long>([^<]+)/) ?? [])[1]), detail: body.slice(0, 200) };
  });
}
/** generic RSS items -> events */
export const fromRss = (items: { title: string; url: string; t: number; summary?: string }[], feed: string, cat: Cat, max = 10): WEvent[] =>
  items.slice(0, max).map((x) => ({ id: `${feed}:${x.url || x.title}`, feed, cat, title: x.title, url: x.url, t: x.t, sev: 1, detail: x.summary ? strip(x.summary).slice(0, 200) : undefined }));
