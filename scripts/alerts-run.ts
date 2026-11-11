// Market-hours phone alerts (run by .github/workflows/alerts.yml every ~10 minutes, or by hand):
//   NTFY_TOPIC=your-long-random-topic npx --yes tsx@4.19.2 scripts/alerts-run.ts
// Reads alerts/tickers.txt (falls back to agents/tickers.txt), checks each ticker's price against yesterday's close, high and low
// (Yahoo, unofficial, delayed), and pushes new alerts to ntfy. ALERT_MOVE_PCT (default 4) sets the move size. Each alert fires once a
// day; what was sent is kept in ALERT_STATE (default .alerts-state.json, carried between runs by the Action's cache). Nothing here can trade.
import { readFileSync, writeFileSync } from 'node:fs';
import { marketOpen, parseDayBars, priceAlerts, readTickers, type Alert } from '../shared/alerts.js';
import { sendAlert } from '../api/_lib/notify.js';

const now = Date.now();
const DRY = !!process.env.DRY; // DRY=1 prints alerts instead of sending (for a test)
if (!process.env.NTFY_TOPIC && !DRY) { console.log('NTFY_TOPIC not set: nothing to send.'); process.exit(0); }
if (!marketOpen(now) && !process.env.FORCE) { console.log('Market closed.'); process.exit(0); }
const day = new Date(now).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const file = process.env.ALERT_STATE || '.alerts-state.json';
let sent: string[] = [];
try { sent = JSON.parse(readFileSync(file, 'utf8')).sent ?? []; } catch { /* first run */ }
sent = sent.filter((id) => id.startsWith(day)); // yesterday's alerts can fire again today

const list = (() => { for (const f of ['alerts/tickers.txt', 'agents/tickers.txt']) { try { const t = readTickers(readFileSync(f, 'utf8')); if (t.length) return t; } catch { /* next */ } } return []; })().slice(0, 40);
const move = Number(process.env.ALERT_MOVE_PCT) || 4;
const fresh: Alert[] = [];
for (const sym of list) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym.replace(/\./g, '-'))}?range=5d&interval=1d`, { headers: { 'user-agent': 'Mozilla/5.0 (trading-desk; personal alerts)' }, signal: AbortSignal.timeout(10000) });
    const b = r.ok ? parseDayBars(await r.json()) : null;
    if (b && (DRY || now - b.at < 30 * 60_000)) fresh.push(...priceAlerts(sym, b, day, move, new Set(sent)).filter((a) => !sent.includes(a.id)));
  } catch (e) { console.log(`${sym}: ${(e as Error).message}`); }
  await new Promise((res) => setTimeout(res, 250));
}
for (const a of fresh.slice(0, 8)) { // never flood the phone: at most 8 per run
  if (DRY) { console.log(`[dry] ${a.title}: ${a.message}`); continue; }
  try { await sendAlert(a); sent.push(a.id); console.log(`sent ${a.title}`); } catch (e) { console.log(`send failed: ${(e as Error).message}`); }
}
if (!DRY) writeFileSync(file, JSON.stringify({ day, sent }));
console.log(`${list.length} tickers, ${fresh.length} new alerts`);
