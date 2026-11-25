// GET /api/research?fn=cmap -> per-state layers for the Commodity map: US Drought Monitor (weekly), NWS severe / extreme
// alerts (live), FEMA disaster declarations (last 60 days). All free, no keys. Each layer fails on its own.
import { FIPS, femaByState, latestDrought } from '../../../shared/cmap.js';
import { alertStates } from '../../../shared/realecon.js';
import { cached, getJson, json, take } from '../core.js';

const UA = { 'user-agent': 'trade-desk-research/0.1 (personal project)' };
const mdy = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;

export async function cmap(): Promise<Response> {
  const errors: Record<string, string> = {};
  const now = new Date();
  const [drought, alerts, fema] = await Promise.all([
    cached('cmap:usdm', 6 * 3600, async () => {
      if (!take('usdm')) throw new Error('rate limited');
      const from = new Date(now.getTime() - 16 * 86400_000);
      return latestDrought(await getJson(`https://usdmdataservices.unl.edu/api/StateStatistics/GetDroughtSeverityStatisticsByAreaPercent?aoi=${Object.values(FIPS).join(',')}&startdate=${mdy(from)}&enddate=${mdy(now)}&statisticsType=1`, 'usdm', 20000, { headers: { accept: 'application/json' } }));
    }).then((x) => x.val).catch((e) => { errors.drought = String(e.message).slice(0, 120); return null; }),
    cached('cmap:nws', 900, async () => {
      if (!take('noaa')) throw new Error('rate limited');
      const j = await getJson('https://api.weather.gov/alerts/active?status=actual&severity=Severe,Extreme', 'noaa', 15000, { headers: UA });
      const by: Record<string, { event: string; until: string | null }[]> = {};
      for (const f of j?.features ?? []) {
        const p = f?.properties ?? {};
        for (const s of alertStates(p)) { const xs = (by[s] ??= []); if (!xs.some((x) => x.event === p.event)) xs.push({ event: String(p.event ?? 'Alert'), until: p.ends ?? p.expires ?? null }); }
      }
      return by;
    }).then((x) => x.val).catch((e) => { errors.alerts = String(e.message).slice(0, 120); return null; }),
    cached('cmap:fema', 6 * 3600, async () => {
      if (!take('fema')) throw new Error('rate limited');
      const since = new Date(now.getTime() - 60 * 86400_000).toISOString().slice(0, 10);
      const j = await getJson(`https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$filter=declarationDate%20ge%20'${since}'&$select=state,incidentType,declarationTitle,declarationDate&$top=1000`, 'fema', 20000);
      return femaByState(j?.DisasterDeclarationsSummaries ?? []);
    }).then((x) => x.val).catch((e) => { errors.fema = String(e.message).slice(0, 120); return null; }),
  ]);
  return json({ drought, alerts, fema, errors, asOf: Date.now(), source: 'US Drought Monitor (weekly, UNL/USDA/NOAA), NWS active severe and extreme alerts, FEMA disaster declarations (last 60 days)' }, { sMaxAge: 900 });
}
