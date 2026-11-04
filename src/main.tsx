import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

try {
  const t = localStorage.getItem('td.theme');
  if (t) document.documentElement.dataset.theme = JSON.parse(t);
} catch { /* ignore */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
