export type TF = 'D' | '1H' | '5m';
export type Board = 'setups' | 'watching' | 'avoid';
export type Mode = 'pre' | 'open' | 'midday' | 'power' | 'after';
export type RightTab = 'news' | 'scanner' | 'journal' | 'risk';
export type Overlay = 'map' | 'globe' | 'help' | null;

/** Every panel shows one of these, with a timestamp. */
export type Freshness = 'demo' | 'live' | 'delayed' | 'eod' | 'unavailable' | 'pending';

export interface Bar {
  time: number; // seconds; intraday bars are ET wall-clock encoded as UTC so the chart reads in ET
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Quote {
  sym: string;
  name: string;
  last: number;
  chgPct: number;
  rvol: number;
  rs5: number;
  rs20: number;
  rs60: number;
  rsRank: number; // 1-99 percentile vs. universe, from RS vs SPY over 5/20/60d
  gapPct: number;
  pmVol: number;
  flags: string[];
}

export interface Headline {
  id: string;
  t: number; // ms epoch
  src: string;
  title: string;
  syms: string[];
  macro: boolean;
}

export interface Layout {
  left: number;
  right: number;
  leftOpen: boolean;
  rightOpen: boolean;
  tab: RightTab;
  tf: TF;
  tickerOpen: boolean;
}

export interface JournalDraft {
  id: string;
  created: number;
  sym: string;
  side: 'long' | 'short';
  entry: number;
  stop: number;
  target: number;
  size: number;
  setup: string;
  thesis: string;
}
