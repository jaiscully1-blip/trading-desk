import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AccountGate } from './components/AccountGate';
import { currentAccount, storagePrefix } from './lib/accounts';
import './styles.css';
import { reportError, startTelemetry } from './lib/telemetry';
import { installFetchCache } from './lib/fetchCache';
import { startHealth } from './lib/health';

startTelemetry();
installFetchCache();
startHealth();

// After a new version is deployed, a tab that was already open asks for old file names that no longer exist
// ("Failed to fetch dynamically imported module"). Reload once to pick up the new version instead of showing an error.
const STALE_FETCH = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i;
// "reading 'default'" also comes from ordinary bugs, so it only counts as a missing file when a file really failed to load
// in this tab. Treating every such error as "new version" retried a genuine crash four times and then locked the desk.
let sawPreloadError = false;
const isStale = (msg: string) => STALE_FETCH.test(msg) || (sawPreloadError && /reading 'default'/i.test(msg));
/** Way out of a page that keeps crashing: open Home on the next load (keeps everything else). */
function openHome() {
  try { localStorage.setItem(`${storagePrefix()}page2`, JSON.stringify('home')); sessionStorage.removeItem('td.verReload'); } catch { /* ignore */ }
  location.reload();
}
// Retries wait a little longer each time (now, 4 s, 12 s, 30 s), because a fresh deploy can take a minute to reach every server.
// A successful start clears the counter, so one bad moment never uses up later reloads.
const RELOAD_WAIT = [0, 4_000, 12_000, 30_000];
let reloadPending = false;
function reloadForNewVersion(): boolean {
  if (reloadPending) return true;
  let n = 0;
  try {
    const r = JSON.parse(sessionStorage.getItem('td.verReload') || '{"n":0,"t":0}') as { n: number; t: number };
    n = Date.now() - r.t < 180_000 ? r.n : 0;
    if (n >= RELOAD_WAIT.length) return false;
    sessionStorage.setItem('td.verReload', JSON.stringify({ n: n + 1, t: Date.now() }));
  } catch { /* storage blocked: still reload */ }
  reloadPending = true;
  setTimeout(() => { void refetchFailed().finally(() => location.reload()); }, RELOAD_WAIT[n] ?? 0);
  return true;
}
// Files under /assets/ are cached for a year, and the browser keeps a 404 just as long. If it asked for a new file a moment
// before a deploy reached its server, every later load replays that saved 404. Refetching the failed file with
// cache: 'reload' replaces the saved copy, so the reload then works.
const failedUrls = new Set<string>();
const noteFailed = (msg: string) => { for (const m of msg.matchAll(/https?:\/\/[^\s'"]+\/assets\/[^\s'")]+/g)) failedUrls.add(m[0]); };
async function refetchFailed() {
  await Promise.all([...failedUrls].map((u) => fetch(u, { cache: 'reload' }).catch(() => null)));
}
// Clear only after a clean start (no reload waiting), or a retry that is still waiting would restart the count and never give up.
window.addEventListener('load', () => setTimeout(() => { if (reloadPending) return; try { sessionStorage.removeItem('td.verReload'); } catch { /* ignore */ } }, 15_000));
// Only swallow the error when we really reload; otherwise let it through so the page shows "The desk was just updated"
// (swallowing it without reloading hands the page an empty module, which crashed with "reading 'default'").
window.addEventListener('vite:preloadError', (e) => { sawPreloadError = true; noteFailed(String((e as unknown as { payload?: Error }).payload?.message ?? '')); if (reloadForNewVersion()) e.preventDefault(); });
window.addEventListener('unhandledrejection', (e) => { noteFailed(String((e.reason as Error | undefined)?.message ?? e.reason)); if (isStale(String((e.reason as Error | undefined)?.message ?? e.reason))) reloadForNewVersion(); });

/** A crash in one page shows a reload button instead of a blank screen, and is reported. */
class Boundary extends Component<{ children: ReactNode }, { err: Error | null; gaveUp: boolean }> {
  state = { err: null as Error | null, gaveUp: false };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error, info: { componentStack?: string | null }) {
    noteFailed(err.message);
    if (isStale(err.message)) { if (reloadForNewVersion()) return; this.setState({ gaveUp: true }); }
    reportError(err, { where: 'react', stack: info.componentStack?.slice(0, 2000) });
  }
  render() {
    if (!this.state.err) return this.props.children;
    const msg = this.state.err.message;
    const out = <div className="crash-actions"><button className="btn primary" onClick={() => { try { sessionStorage.removeItem('td.verReload'); } catch { /* ignore */ } void refetchFailed().finally(() => location.reload()); }}>Reload</button> <button className="btn" onClick={openHome}>Open Home instead</button></div>;
    // A new version was deployed while this tab was open: reload quietly. Only if the automatic retries all fail, offer the buttons.
    if (isStale(msg) && !this.state.gaveUp) return <div className="crash"><p className="muted">Updating to the new version…</p></div>;
    return <div className="crash"><b>{isStale(msg) ? 'The desk could not open the new version.' : 'Something broke on this page.'}</b><p className="muted small">{msg}</p>{out}</div>;
  }
}

try {
  const t = localStorage.getItem(`${storagePrefix()}themeV2`) ?? localStorage.getItem('td.themeV2');
  document.documentElement.dataset.theme = t ? JSON.parse(t) : 'dark';
} catch { /* ignore */ }

// Installable app: a tiny service worker that caches the app shell only (never /api data).
if ('serviceWorker' in navigator && import.meta.env.PROD && import.meta.env.MODE !== 'single') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

// Defence in depth: links from news feeds are filtered on the server, and any link that is not a web, mail or in-page link is blocked here.
document.addEventListener('click', (e) => {
  const a = (e.target as Element | null)?.closest?.('a[href]');
  const h = a?.getAttribute('href')?.trim() ?? '';
  if (a && !/^(https?:|mailto:|#|\/(?!\/))/i.test(h)) e.preventDefault();
}, true);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boundary>{currentAccount() ? <App /> : <AccountGate />}</Boundary>
  </StrictMode>,
);
