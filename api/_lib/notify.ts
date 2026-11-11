// Push one alert to the free ntfy app (ntfy.sh, open source). The topic name works like a password: anyone who knows it can read
// it, so NTFY_TOPIC should be long and random and alerts only ever carry tickers and prices, never account details.
// Optional NTFY_SERVER for a self-hosted server, NTFY_TOKEN for a protected topic, DESK_URL so tapping an alert opens the desk.
import type { Alert } from '../../shared/alerts.js';

export const notifyConfigured = () => !!process.env.NTFY_TOPIC;

export async function sendAlert(a: Pick<Alert, 'title' | 'message' | 'tags' | 'priority'>): Promise<void> {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) throw new Error('NTFY_TOPIC is not set');
  const server = (process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/+$/, '');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (process.env.NTFY_TOKEN) headers.authorization = `Bearer ${process.env.NTFY_TOKEN}`;
  const r = await fetch(server, {
    method: 'POST', headers, signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ topic, title: a.title.slice(0, 120), message: a.message.slice(0, 500), tags: a.tags, priority: a.priority, ...(process.env.DESK_URL ? { click: process.env.DESK_URL } : {}) }),
  });
  if (!r.ok) throw new Error(`ntfy HTTP ${r.status}`);
}
