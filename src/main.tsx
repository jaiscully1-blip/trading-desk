import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

try {
  const t = localStorage.getItem('td.themeV2');
  document.documentElement.dataset.theme = t ? JSON.parse(t) : 'dark';
} catch { /* ignore */ }

// Installable app: a tiny service worker that caches the app shell only (never /api data).
if ('serviceWorker' in navigator && import.meta.env.PROD && import.meta.env.MODE !== 'single') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
