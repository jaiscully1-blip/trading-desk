export type { TF, ChartTF, Mode, Freshness, Bar, SeriesResult, QuoteResult, MacroResult, MacroPoint } from '../shared/types';
import type { ChartTF } from '../shared/types';

export type Board = 'setups' | 'watching' | 'avoid';
export type RightTab = 'news' | 'scanner' | 'journal' | 'risk' | 'calendar';
export type Overlay = 'map' | 'globe' | 'help' | null;
export type OrMinutes = 5 | 15 | 30;

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
  /** last 30 daily closes for the trend line (from the scan), when loaded */
  spark?: number[];
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
  tf: ChartTF;
  tickerOpen: boolean;
  levelsOpen?: boolean;
  fearOpen?: boolean;
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
