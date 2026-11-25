// GET /api/research?fn=wmon -> every World Monitor feed (free, no keys), normalized and newest first.
// Each feed is cached on its own and fails on its own; one slow or broken agency never blocks the rest.
import { parseFeed } from '../../../shared/news.js';
import * as P from '../../../shared/wmon.js';
import { getText } from '../adapters.js';
import { cached, getJson, json, take } from '../core.js';

const UA = { 'user-agent': 'trade-desk-research/0.1 (personal project)' };
const day = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
type Job = [id: string, ttlSec: number, run: () => Promise<P.WEvent[]>];
const J = (u: string) => getJson(u, 'agencies', 12000, { headers: UA });
const T = (u: string) => getText(u, 12000);

const JOBS: Job[] = [
  ['usgs', 600, async () => P.usgs(await J('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson'))],
  ['tsunami', 600, async () => P.tsunami(await T('https://www.tsunami.gov/events/xml/PAAQAtom.xml'))],
  ['volcano', 3600, async () => P.volcano(await J('https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes'))],
  ['nhc', 900, async () => P.nhc(await J('https://www.nhc.noaa.gov/CurrentStorms.json'))],
  ['fires', 1800, async () => P.fires(await J('https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query?where=IncidentSize%3E%3D1000&outFields=IncidentName,POOState,IncidentSize,PercentContained,FireDiscoveryDateTime&returnGeometry=true&outSR=4326&f=json&resultRecordCount=40&orderByFields=IncidentSize%20DESC'))],
  ['gdacs', 1800, async () => P.gdacs(await J('https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ;TC;FL;VO;DR;WF&alertlevel=Orange;Red'))],
  ['ifrc', 1800, async () => P.ifrc(await J('https://goadmin.ifrc.org/api/v2/event/?limit=20&ordering=-disaster_start_date'))],
  ['who', 3600, async () => P.who(await J('https://www.who.int/api/news/diseaseoutbreaknews?$top=12&$orderby=PublicationDateAndTime%20desc'))],
  ['cdc', 3600, async () => P.fromRss(parseFeed(await T('https://tools.cdc.gov/api/v2/resources/media/132608.rss?max=12'), 'CDC'), 'cdc', 'health')],
  ['ecdc', 3600, async () => P.fromRss(parseFeed(await T('https://www.ecdc.europa.eu/en/taxonomy/term/1307/feed'), 'ECDC'), 'ecdc', 'health')],
  ['fda', 3600, async () => P.fda(await J(`https://api.fda.gov/food/enforcement.json?limit=12&sort=report_date:desc`))],
  ['cpsc', 3600, async () => P.cpsc(await J(`https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallDateStart=${day(21)}`))],
  ['fedreg', 1800, async () => P.fedreg(await J('https://www.federalregister.gov/api/v1/documents.json?per_page=15&order=newest&conditions[significant]=1'))],
  ['sec', 1800, async () => P.fromRss(parseFeed(await T('https://www.sec.gov/news/pressreleases.rss'), 'SEC'), 'sec', 'policy')],
  ['fed', 1800, async () => P.fromRss(parseFeed(await T('https://www.federalreserve.gov/feeds/press_all.xml'), 'Fed'), 'fed', 'policy')],
  ['state', 3600, async () => P.travel(await J('https://cadataapi.state.gov/api/TravelAdvisories'))],
  ['swpc', 900, async () => P.swpc(await J('https://services.swpc.noaa.gov/products/alerts.json'))],
  ['cisa', 3600, async () => P.cisa(await J('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'))],
  ['faa', 300, async () => P.faa(await T('https://nasstatus.faa.gov/api/airport-status-information'))],
  ['un', 1800, async () => P.fromRss(parseFeed(await T('https://news.un.org/feed/subscribe/en/news/all/rss.xml'), 'UN News'), 'un', 'world')],
];

export async function wmon(): Promise<Response> {
  const status: Record<string, { ok: boolean; n: number; err?: string }> = {};
  const lists = await Promise.all(JOBS.map(([id, ttl, run]) =>
    Promise.race([
      cached(`wmon:${id}`, ttl, async () => { if (!take('agencies')) throw new Error('rate limited'); return run(); }).then((x) => x.val),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('slow: still loading')), 9000)),
    ]).then((xs) => { status[id] = { ok: true, n: xs.length }; return xs; })
      .catch((e) => { status[id] = { ok: false, n: 0, err: String((e as Error).message).slice(0, 100) }; return [] as P.WEvent[]; })));
  const events = lists.flat().filter((e) => e.title).sort((a, b) => b.t - a.t);
  return json({ events, status, asOf: Date.now(), source: 'Free public feeds from US and international agencies (see each item)' }, { sMaxAge: 300 });
}
