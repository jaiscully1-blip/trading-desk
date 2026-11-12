// Builds public/data/world-companies.json: publicly listed companies worldwide with their headquarters location, from
// Wikidata (free, community-edited, CC0). Run: node scripts/build-world-companies.mjs   (takes ~30-60 s; re-run to refresh).
// One row per company (its main listing): [name, ticker, exchange, country, lat, lon, yahooSymbol | ""].
import { writeFileSync, mkdirSync } from 'node:fs';

const QUERY = `SELECT ?c ?cLabel ?ticker ?exLabel ?countryLabel ?coord WHERE {
  ?c p:P414 ?st . ?st ps:P414 ?ex ; pq:P249 ?ticker .
  ?c wdt:P159 ?hq . ?hq wdt:P625 ?coord .
  OPTIONAL { ?c wdt:P17 ?country . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

// exchange name (as Wikidata labels it) -> Yahoo Finance suffix, so a row can link to its quote page
const YH = [
  [/new york stock exchange|nasdaq|nyse american|nyse arca|cboe/i, ''], [/london stock exchange/i, '.L'], [/tokyo stock exchange/i, '.T'],
  [/hong kong/i, '.HK'], [/shanghai/i, '.SS'], [/shenzhen/i, '.SZ'], [/national stock exchange of india/i, '.NS'], [/bombay/i, '.BO'],
  [/toronto/i, '.TO'], [/tsx venture/i, '.V'], [/australian securities/i, '.AX'], [/euronext paris/i, '.PA'], [/euronext amsterdam/i, '.AS'],
  [/euronext brussels/i, '.BR'], [/euronext lisbon/i, '.LS'], [/euronext dublin|irish stock/i, '.IR'], [/frankfurt|xetra/i, '.DE'],
  [/six swiss/i, '.SW'], [/korea exchange|kospi/i, '.KS'], [/kosdaq/i, '.KQ'], [/taiwan stock/i, '.TW'], [/borsa italiana|milan/i, '.MI'],
  [/madrid|bolsa de madrid|bme/i, '.MC'], [/stockholm/i, '.ST'], [/oslo/i, '.OL'], [/copenhagen/i, '.CO'], [/helsinki/i, '.HE'],
  [/b3|bovespa|são paulo/i, '.SA'], [/johannesburg/i, '.JO'], [/singapore/i, '.SI'], [/mexican stock|bolsa mexicana/i, '.MX'],
  [/vienna/i, '.VI'], [/warsaw/i, '.WA'], [/tel aviv/i, '.TA'], [/saudi|tadawul/i, '.SR'], [/new zealand/i, '.NZ'], [/indonesia/i, '.JK'],
  [/bursa malaysia/i, '.KL'], [/stock exchange of thailand/i, '.BK'], [/philippine/i, '.PS'], [/istanbul|borsa istanbul/i, '.IS'],
];
// main venues first when a company lists in several places
const RANK = [/new york stock exchange/i, /nasdaq/i, /london/i, /tokyo/i, /hong kong/i, /euronext/i, /frankfurt|xetra/i, /toronto/i, /shanghai/i, /shenzhen/i, /national stock exchange of india/i];
const rankOf = (ex) => { const i = RANK.findIndex((r) => r.test(ex)); return i < 0 ? 99 : i; };

const r = await fetch('https://query.wikidata.org/sparql', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/sparql-results+json', 'user-agent': 'trade-desk-research/0.1 (personal project)' },
  body: new URLSearchParams({ query: QUERY }),
});
if (!r.ok) throw new Error(`Wikidata HTTP ${r.status}`);
const text = await r.text();
let j;
try { j = JSON.parse(text); } catch { throw new Error('Wikidata timed out mid-answer (it caps queries at 60 s). Try again in a few minutes.'); }
const by = new Map();
for (const b of j.results.bindings) {
  const id = b.c.value, ex = b.exLabel?.value ?? '', name = b.cLabel?.value ?? '';
  const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord?.value ?? '');
  if (!m || /^Q\d+$/.test(name)) continue;
  const row = [name, b.ticker.value.trim(), ex, b.countryLabel?.value ?? '', +(+m[2]).toFixed(3), +(+m[1]).toFixed(3)];
  const cur = by.get(id);
  if (!cur || rankOf(ex) < rankOf(cur[2])) by.set(id, row);
}
const rows = [...by.values()].map((row) => {
  const hit = YH.find(([re]) => re.test(row[2]));
  let t = row[1].replace(/^[A-Z]+:\s*/, '');
  if (hit && hit[1] === '.HK' && /^\d+$/.test(t)) t = t.padStart(4, '0');
  return [...row, hit ? `${t}${hit[1]}` : ''];
}).sort((a, b) => a[3].localeCompare(b[3]) || a[0].localeCompare(b[0]));
mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/world-companies.json', JSON.stringify({ asOf: new Date().toISOString().slice(0, 10), source: 'Wikidata (community-edited, CC0): companies with a stock exchange listing and a headquarters location', rows }));
console.log(`world companies: ${rows.length} (from ${j.results.bindings.length} listings)`);
