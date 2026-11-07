import type { Layout, Mode } from '../types';

// Sensible per-mode defaults. Any change you make is saved to the mode you're in.
const base: Layout = { left: 240, right: 330, leftOpen: true, rightOpen: true, tab: 'news', tf: '5m', tickerOpen: true };

export const DEFAULT_LAYOUTS: Record<Mode, Layout> = {
  pre: { ...base, tab: 'scanner', tf: '5m' },
  open: { ...base, tab: 'news', tf: '5m' },
  midday: { ...base, tab: 'scanner', tf: '1H' },
  power: { ...base, tab: 'risk', tf: '5m' },
  after: { ...base, tab: 'journal', tf: 'D' },
};
