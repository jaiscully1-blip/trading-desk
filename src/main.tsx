import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { reportError, startTelemetry } from './lib/telemetry';

startTelemetry();

/** A crash in one page shows a reload button instead of a blank screen, and is reported. */
class Boundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error, info: { componentStack?: string | null }) { reportError(err, { where: 'react', stack: info.componentStack?.slice(0, 2000) }); }
  render() {
    if (!this.state.err) return this.props.children;
    return <div className="crash"><b>Something broke on this page.</b><p className="muted">{this.state.err.message}</p><button className="btn primary" onClick={() => location.reload()}>Reload</button></div>;
  }
}

try {
  const t = localStorage.getItem('td.themeV2');
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
    <Boundary><App /></Boundary>
  </StrictMode>,
);
