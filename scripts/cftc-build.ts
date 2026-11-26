// Weekly CFTC credit-swaps snapshot: gross notional outstanding and transaction tickets (by high yield / investment grade),
// added to published/cftc-cds.json (the CFTC pages only show the current week, so the history builds week by week).
// Run by .github/workflows/cftc.yml, or by hand: npx --yes tsx@4.19.2 scripts/cftc-build.ts
// Free public data, no key. Information only; nothing here can trade.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mergeWeeks, parseGross, parseTickets, type CftcWeek } from '../shared/cftc.js';

const OUT = 'published/cftc-cds.json';
const UA = 'Mozilla/5.0 (compatible; trading-desk weekly swaps snapshot)';
const page = async (p: string) => { const r = await fetch(`https://www.cftc.gov/MarketReports/SwapsReports/${p}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`); return r.text(); };

const gross = parseGross(await page('L2CDSGrossExp.html'));
const tickets = parseTickets(await page('L2CDSAct.html'));
if (!gross && !tickets) { console.error('Neither CFTC table could be read: the page format may have changed. Not writing.'); process.exit(1); }
const week = gross?.week ?? tickets!.week;
const cur: CftcWeek = { week, gross: gross && gross.week === week ? { total: gross.total, hy: gross.hy, ig: gross.ig } : null, tickets: tickets && tickets.week === week ? { total: tickets.total, hy: tickets.hy, ig: tickets.ig } : null };
const prev: CftcWeek[] = existsSync(OUT) ? (() => { try { return JSON.parse(readFileSync(OUT, 'utf8')).weeks ?? []; } catch { return []; } })() : [];
const weeks = mergeWeeks(prev, cur);
mkdirSync('published', { recursive: true });
writeFileSync(OUT, JSON.stringify({ schema: 1, source: 'CFTC Weekly Swaps Report (credit): gross notional outstanding ($M) and transaction tickets', weeks }));
console.log(`cftc-cds.json: ${weeks.length} weeks, latest ${week}`, cur);
