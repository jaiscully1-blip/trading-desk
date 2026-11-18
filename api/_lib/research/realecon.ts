// Real Economy routes (through /api/research):
//   fn=air            aircraft near 8 big US airports and airborne flights per airline right now (OpenSky, anonymous; adsb.fi fallback)
//   fn=jets&icao=..   where specific aircraft are right now (OpenSky), and which public company's HQ city each is near
//   fn=econ           rail carloads and intermodal (BTS via FRED), US gasoline weekly and deep-sea freight prices (FRED CSVs);
//                     with EIA_API_KEY also electricity demand by grid region and gasoline by state (EIA, free key)
//   fn=wx             active severe / extreme weather alerts (NOAA), grouped by event, with the kinds of stocks each touches
import { cached, getJson, json, take } from '../core.js';
import { getText } from '../adapters.js';
import { adsbStates, AIRLINES, AIRPORTS, alertStates, countAirlines, countNear, distKm, fredCsv, sectorsFor } from '../../../shared/realecon.js';
import { COMPANIES } from '../../../shared/data/companies.js';

const UA = { 'user-agent': 'trade-desk-research/0.1 (personal project)' };
const OS = 'https://opensky-network.org/api/states/all';
const AL = 'https://api.adsb.lol/v2';
const FI = 'https://opendata.adsb.fi/api/v2';
// OpenSky turns away many cloud servers (Vercel included), so the live site falls back to adsb.fi: aircraft within
// 22 nautical miles (about 40 km) of each airport. Airline counts then cover only those circles, not the whole country.
async function adsbNearAirports(): Promise<any[][]> {
  const all: any[] = [];
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // adsb.fi answers one request a second: space the 8 lookups out and retry once after a 429
  for (const [i, a] of AIRPORTS.entries()) {
    if (i) await wait(1100);
    if (!take('adsbfi')) throw new Error('rate limited');
    const url = `${FI}/lat/${a.lat}/lon/${a.lon}/dist/22`;
    const j = await getJson(url, 'adsbfi', 10000, { headers: UA }).catch(async (e) => { if (!/429/.test(String(e?.message))) throw e; await wait(2500); return getJson(url, 'adsbfi', 10000, { headers: UA }); });
    all.push(...(j?.aircraft ?? j?.ac ?? []));
  }
  return adsbStates(all);
}

export async function air(): Promise<Response> {
  try {
    const { val, stale } = await cached('air', 600, async () => {
      let states: any[], at = Date.now(), scope: 'us' | 'airports' = 'us', why = '';
      try {
        if (!take('opensky')) throw new Error('rate limited');
        const all = await getJson(OS, 'opensky', 20000);
        states = all?.states ?? []; at = Number(all?.time) * 1000 || at;
      } catch (e) { why = (e as Error).message.slice(0, 80); states = await adsbNearAirports(); scope = 'airports'; }
      const airlines = countAirlines(states);
      const airports = AIRPORTS.map((a) => ({ ...a, ...countNear(states, a.lat, a.lon) }));
      return { airlines: AIRLINES.map((a) => ({ ...a, airborne: airlines[a.prefix] ?? 0 })), airports, at, total: states.length, scope, why };
    });
    const source = val.scope === 'us' ? 'OpenSky Network live ADS-B states (anonymous, free; coverage depends on volunteer receivers)'
      : `adsb.fi open ADS-B data (free, personal use), aircraft near the 8 airports. OpenSky was unavailable${val.why ? ` (${val.why})` : ''}.`;
    return json({ ...val, stale, source }, { sMaxAge: 600 });
  } catch (e) { return json({ error: (e as Error).message.slice(0, 160) }, { status: 502 }); }
}

export async function jets(req: Request): Promise<Response> {
  const icao = (new URL(req.url).searchParams.get('icao') ?? '').toLowerCase().split(',').map((s) => s.trim()).filter((s) => /^[0-9a-f]{6}$/.test(s)).slice(0, 20);
  if (!icao.length) return json({ error: 'icao: 6-character hex codes, comma separated' }, { status: 400 });
  try {
    const { val } = await cached(`jets:${icao.join(',')}`, 300, async () => {
      let states: any[];
      try {
        if (!take('opensky')) throw new Error('rate limited');
        states = (await getJson(`${OS}?${icao.map((x) => `icao24=${x}`).join('&')}`, 'opensky', 12000))?.states ?? [];
      } catch {
        if (!take('adsblol')) throw new Error('rate limited');
        states = adsbStates((await getJson(`${AL}/hex/${icao.join(',')}`, 'adsblol', 12000, { headers: UA }))?.ac ?? []);
      }
      return states.map((s: any[]) => {
        const lat = Number(s[6]), lon = Number(s[5]);
        let near: { sym: string; name: string; city: string; km: number } | null = null;
        if (Number.isFinite(lat) && Number.isFinite(lon)) for (const c of COMPANIES) { const km = distKm(lat, lon, c[5], c[6]); if (km < 30 && (!near || km < near.km)) near = { sym: c[0], name: c[1], city: c[4], km: Math.round(km) }; }
        return { icao: s[0], callsign: String(s[1] ?? '').trim(), lat, lon, alt: s[7], ground: !!s[8], seen: Number(s[4]) * 1000, near };
      });
    });
    return json({ jets: val, asked: icao, source: 'OpenSky Network, or adsb.lol (open data, ODbL) when OpenSky is unavailable. Aircraft whose owners use the FAA privacy program (LADD / PIA) may be hidden.' }, { sMaxAge: 300 });
  } catch (e) { return json({ error: (e as Error).message.slice(0, 160) }, { status: 502 }); }
}

const FRED = (id: string) => `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`;
const EIA_REGIONS: Record<string, string> = { ERCO: 'Texas (ERCOT)', PJM: 'Mid-Atlantic (PJM, data-center alley)', MISO: 'Midwest (MISO)', CISO: 'California (CAISO)', NYIS: 'New York (NYISO)', ISNE: 'New England', SWPP: 'Southwest Power Pool', SOCO: 'Southeast (Southern Co.)' };
const GAS_AREAS: Record<string, string> = { NUS: 'United States', SCA: 'California', STX: 'Texas', SFL: 'Florida', SNY: 'New York', SWA: 'Washington', SCO: 'Colorado', SOH: 'Ohio', SMN: 'Minnesota', SMA: 'Massachusetts' };

export async function econ(): Promise<Response> {
  const errors: Record<string, string> = {};
  const series = async (id: string, n: number) => { try { return fredCsv((await cached(`fredcsv:${id}`, 12 * 3600, () => getText(FRED(id), 15000))).val).slice(-n); } catch (e) { errors[id] = (e as Error).message.slice(0, 80); return []; } };
  const [carloads, intermodal, gas, freight] = await Promise.all([series('RAILFRTCARLOADSD11', 40), series('RAILFRTINTERMODALD11', 40), series('GASREGW', 110), series('PCU483111483111', 40)]);
  let power: { region: string; name: string; s: { date: string; value: number }[] }[] | null = null, gasStates: { area: string; name: string; s: { date: string; value: number }[] }[] | null = null;
  const key = process.env.EIA_API_KEY;
  if (key) {
    try {
      const start = new Date(Date.now() - 400 * 86400_000).toISOString().slice(0, 10);
      const { val } = await cached('eia:power', 6 * 3600, async () => {
        if (!take('eia')) throw new Error('rate limited');
        const facets = Object.keys(EIA_REGIONS).map((r) => `facets[respondent][]=${r}`).join('&');
        return getJson(`https://api.eia.gov/v2/electricity/rto/daily-region-data/data/?api_key=${key}&frequency=daily&data[0]=value&facets[type][]=D&facets[timezone][]=Eastern&${facets}&start=${start}&sort[0][column]=period&sort[0][direction]=asc&length=5000`, 'eia', 20000);
      });
      const rows: any[] = val?.response?.data ?? [];
      power = Object.entries(EIA_REGIONS).map(([region, name]) => ({ region, name, s: rows.filter((r) => r.respondent === region).map((r) => ({ date: String(r.period), value: Number(r.value) })).filter((x) => Number.isFinite(x.value)) }));
    } catch (e) { errors.eiaPower = (e as Error).message.replace(/api_key=[^&\s]+/g, 'api_key=…').slice(0, 120); }
    try {
      const start = new Date(Date.now() - 430 * 86400_000).toISOString().slice(0, 10);
      const { val } = await cached('eia:gas', 6 * 3600, async () => {
        if (!take('eia')) throw new Error('rate limited');
        const facets = Object.keys(GAS_AREAS).map((a) => `facets[duoarea][]=${a}`).join('&');
        return getJson(`https://api.eia.gov/v2/petroleum/pri/gnd/data/?api_key=${key}&frequency=weekly&data[0]=value&facets[product][]=EPMR&${facets}&start=${start}&sort[0][column]=period&sort[0][direction]=asc&length=5000`, 'eia', 20000);
      });
      const rows: any[] = val?.response?.data ?? [];
      gasStates = Object.entries(GAS_AREAS).map(([area, name]) => ({ area, name, s: rows.filter((r) => r.duoarea === area).map((r) => ({ date: String(r.period), value: Number(r.value) })).filter((x) => Number.isFinite(x.value)) }));
    } catch (e) { errors.eiaGas = (e as Error).message.replace(/api_key=[^&\s]+/g, 'api_key=…').slice(0, 120); }
  }
  return json({ carloads, intermodal, gas, freight, power, gasStates, eiaKey: !!key, errors, source: 'FRED (BTS rail freight, EIA weekly gasoline, BLS deep-sea freight producer prices); EIA Open Data with a free key' }, { sMaxAge: 3600 });
}

export async function wx(): Promise<Response> {
  try {
    const { val } = await cached('wx', 900, async () => {
      if (!take('noaa')) throw new Error('rate limited');
      const j = await getJson('https://api.weather.gov/alerts/active?status=actual&severity=Severe,Extreme', 'noaa', 15000, { headers: UA });
      const by = new Map<string, { event: string; n: number; states: Set<string>; until: string | null; headline: string }>();
      for (const f of j?.features ?? []) {
        const p = f?.properties ?? {}, ev = String(p.event ?? 'Alert');
        const v = by.get(ev) ?? { event: ev, n: 0, states: new Set<string>(), until: null, headline: String(p.headline ?? '') };
        v.n++; for (const s of alertStates(p)) v.states.add(s);
        if (p.ends && (!v.until || p.ends > v.until)) v.until = p.ends;
        by.set(ev, v);
      }
      return [...by.values()].map((v) => ({ event: v.event, n: v.n, states: [...v.states].sort(), until: v.until, sectors: sectorsFor(v.event, [...v.states]) })).sort((a, b) => b.n - a.n);
    });
    return json({ alerts: val, asOf: Date.now(), source: 'NOAA National Weather Service active alerts (severe and extreme only)' }, { sMaxAge: 900 });
  } catch (e) { return json({ error: (e as Error).message.slice(0, 160) }, { status: 502 }); }
}
