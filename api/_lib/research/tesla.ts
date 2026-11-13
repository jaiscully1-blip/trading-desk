// Tesla & Lots routes (through /api/research):
//   fn=teslareg[&months=36]  monthly registrations in the Netherlands by brand (Tesla, BYD and other EV makers) and by Tesla
//                            model, from the official vehicle register (RDW open data). Counts cars by first-admission month.
//   fn=lot&lat=..&lon=..&size=..  monthly "lot fullness" for a square box around a point: Sentinel-2 brightness through the
//                            Copernicus Data Space Statistical API (free account). A proxy for how full a lot is, not a car count.
import { cached, getJson, json, take } from '../core.js';
import { LOT_EVALSCRIPT, boxAround, fullness, parseStats, rdwMonths } from '../../../shared/tesla.js';

const RDW = 'https://opendata.rdw.nl/resource/m9d7-ebf2.json';
export const BRANDS = ['TESLA', 'BYD', 'VOLKSWAGEN', 'KIA', 'VOLVO', 'BMW', 'POLESTAR', 'XPENG'];

export async function teslareg(req: Request): Promise<Response> {
  const months = Math.max(6, Math.min(60, Number(new URL(req.url).searchParams.get('months') ?? 36) || 36));
  const from = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - months + 1, 1)).toISOString().slice(0, 19);
  const q = (select: string, where: string, group: string) => `${RDW}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(where)}&$group=${encodeURIComponent(group)}&$limit=5000`;
  try {
    const { val, stale } = await cached(`teslareg:${months}`, 6 * 3600, async () => {
      if (!take('rdw', 2)) throw new Error('rate limited');
      const [brands, models] = await Promise.all([
        getJson(q('date_trunc_ym(datum_eerste_toelating_dt) as m, merk, count(*) as n', `merk in (${BRANDS.map((b) => `'${b}'`).join(',')}) AND voertuigsoort='Personenauto' AND datum_eerste_toelating_dt >= '${from}'`, 'm, merk'), 'rdw', 25000),
        getJson(q('date_trunc_ym(datum_eerste_toelating_dt) as m, handelsbenaming, count(*) as n', `merk='TESLA' AND voertuigsoort='Personenauto' AND datum_eerste_toelating_dt >= '${from}'`, 'm, handelsbenaming'), 'rdw', 25000),
      ]);
      return { brands: rdwMonths(brands, 'merk'), models: rdwMonths(models, 'handelsbenaming') };
    });
    return json({ ...val, stale, brandsTracked: BRANDS, asOf: Date.now(), source: 'RDW open data (Netherlands vehicle register), official, updated daily. Counted by month of first admission; the current month is partial.' }, { sMaxAge: 3600 });
  } catch (e) { return json({ error: (e as Error).message.slice(0, 160) }, { status: 502 }); }
}

async function cdseToken(): Promise<string> {
  const id = process.env.COPERNICUS_CLIENT_ID ?? '', secret = process.env.COPERNICUS_CLIENT_SECRET ?? '';
  const { val } = await cached('cdse:token', 240, async () => {
    const r = await fetch('https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error(`Copernicus sign-in failed (HTTP ${r.status}). Check COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET.`);
    return String(j.access_token);
  });
  return val;
}

export async function lot(req: Request): Promise<Response> {
  if (!process.env.COPERNICUS_CLIENT_ID || !process.env.COPERNICUS_CLIENT_SECRET) return json({ error: 'needs keys', code: 'no-key' }, { status: 400 });
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get('lat')), lon = Number(u.searchParams.get('lon')), size = Number(u.searchParams.get('size') ?? 800);
  if (!(Math.abs(lat) <= 80) || !(Math.abs(lon) <= 180) || !(size >= 100 && size <= 3000)) return json({ error: 'lat, lon and size (100 to 3000 m) are needed' }, { status: 400 });
  const key = `lot:${lat.toFixed(4)}:${lon.toFixed(4)}:${Math.round(size)}`;
  try {
    const { val, stale } = await cached(key, 24 * 3600, async () => {
      if (!take('copernicus')) throw new Error('rate limited');
      const token = await cdseToken();
      const to = new Date(), from = new Date(Date.UTC(to.getUTCFullYear() - 2, to.getUTCMonth(), 1));
      const px = Math.max(10, Math.min(300, Math.round(size / 10)));
      const body = {
        input: { bounds: { geometry: { type: 'Polygon', coordinates: [boxAround(lat, lon, size)] }, properties: { crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84' } }, data: [{ type: 'sentinel-2-l2a', dataFilter: { maxCloudCoverage: 60 } }] },
        aggregation: { timeRange: { from: from.toISOString(), to: to.toISOString() }, aggregationInterval: { of: 'P1D' }, width: px, height: px, evalscript: LOT_EVALSCRIPT },
        calculations: { default: {} },
      };
      const j = await getJson('https://sh.dataspace.copernicus.eu/api/v1/statistics', 'copernicus', 45000, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const obs = parseStats(j);
      return { obs: obs.length, months: fullness(obs) };
    });
    return json({ ...val, stale, asOf: Date.now(), source: 'Copernicus Sentinel-2 L2A (10 m pixels) via the Copernicus Data Space Statistical API. Clouds masked; at least 80% of the box clear. A brightness proxy, not a car count.' }, { sMaxAge: 3600 });
  } catch (e) { return json({ error: (e as Error).message.replace(/Bearer \S+/g, '').slice(0, 200) }, { status: 502 }); }
}
