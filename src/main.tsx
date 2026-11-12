import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AccountGate } from './components/AccountGate';
import { currentAccount, storagePrefix } from './lib/accounts';
import './styles.css';
import { reportError, startTelemetry } from './lib/telemetry';

startTelemetry();

// After a new version is deployed, a tab that was already open asks for old file names that no longer exist
// ("Failed to fetch dynamically imported module"). Reload once to pick up the new version instead of showing an error.
const STALE = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|reading 'default'/i;
function reloadForNewVersion(): boolean {
  try {
    // up to two automatic reloads in two minutes (the new version can take a moment to reach every server), then show the message
    const r = JSON.parse(sessionStorage.getItem('td.verReload') || '{"n":0,"t":0}') as { n: number; t: number };
    const n = Date.now() - r.t < 120_000 ? r.n : 0;
    if (n >= 2) return false;
    sessionStorage.setItem('td.verReload', JSON.stringify({ n: n + 1, t: Date.now() }));
  } catch { /* storage blocked: still reload */ }
  location.reload();
  return true;
}
// Only swallow the error when we really reload; otherwise let it through so the page shows "The desk was just updated"
// (swallowing it without reloading hands the page an empty module, which crashed with "reading 'default'").
window.addEventListener('vite:preloadError', (e) => { if (reloadForNewVersion()) e.preventDefault(); });
window.addEventListener('unhandledrejection', (e) => { if (STALE.test(String((e.reason as Error | undefined)?.message ?? e.reason))) reloadForNewVersion(); });

/** A crash in one page shows a reload button instead of a blank screen, and is reported. */
class Boundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error, info: { componentStack?: string | null }) {
    if (STALE.test(err.message) && reloadForNewVersion()) return;
    reportError(err, { where: 'react', stack: info.componentStack?.slice(0, 2000) });
  }
  render() {
    if (!this.state.err) return this.props.children;
    if (STALE.test(this.state.err.message)) return <div className="crash"><b>The desk was just updated.</b><p className="muted">Reload to open the new version.</p><button className="btn primary" onClick={() => location.reload()}>Reload</button></div>;
    return <div className="crash"><b>Something broke on this page.</b><p className="muted">{this.state.err.message}</p><button className="btn primary" onClick={() => location.reload()}>Reload</button></div>;
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
