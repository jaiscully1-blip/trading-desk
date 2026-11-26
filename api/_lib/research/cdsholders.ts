// GET /api/research?fn=cdsholders -> who holds credit protection (CDS), by counterparty sector, every half-year since 2010:
// outstanding, bought, sold, share of all CDS, changes, quiet notes. Source: BIS OTC derivatives statistics (stats.bis.org,
// free, no key), published twice a year. Official statistics, not advice.
import { holderNotes, latestHolders, parseHolders, periodLabel } from '../../../shared/cdsHolders.js';
import { cached, json, noteError, noteOk, take } from '../core.js';

const KEY = 'H.A+S+T.U.T.5J.A+B+C+K+L+M+N+O+P+U.5J.A.TO1.TO1.A.A.3.A+C';

export async function cdsholders(): Promise<Response> {
  try {
    const d = (await cached('bis:cdsholders', 7 * 86400, async () => {
      if (!take('bis')) throw new Error('BIS budget used up for now');
      const r = await fetch(`https://stats.bis.org/api/v2/data/dataflow/BIS/WS_OTC_DERIV2/1.0/${KEY}?startPeriod=2010&format=csv`, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) { noteError('bis', `HTTP ${r.status}`); throw new Error(`BIS HTTP ${r.status}`); }
      noteOk('bis');
      return parseHolders(await r.text());
    })).val;
    if (!d.periods.length) return json({ error: 'The BIS returned no CDS data.' });
    const latest = d.periods.at(-1)!;
    const rows = latestHolders(d);
    return json({ period: latest, label: periodLabel(latest), total: d.total.at(-1), rows, history: d, notes: holderNotes(rows, latest), asOf: Date.now(),
      source: 'BIS OTC derivatives statistics (credit default swaps by counterparty sector), half-yearly, reported by the main dealers' }, { sMaxAge: 86400 });
  } catch (e) { return json({ error: String((e as Error).message).slice(0, 200) }); }
}
