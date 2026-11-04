// Types shared by the browser app and the /api serverless functions.

export type TF = 'D' | '1H' | '5m';
export type Mode = 'pre' | 'open' | 'midday' | 'power' | 'after';

/** Every panel shows one of these, with a timestamp. */
export type Freshness = 'demo' | 'live' | 'delayed' | 'eod' | 'unavailable' | 'pending' | 'nodata';

export interface Bar {
  /** Seconds. Daily bars: UTC midnight of the ET date. Intraday: ET wall-clock encoded as UTC so charts read in ET. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SeriesResult {
  symbol: string;
  tf: TF;
  bars: Bar[];
  source: string;
  freshness: Freshness;
  /** ms epoch when the server fetched it */
  asOf: number;
  note?: string;
}

export interface QuoteResult {
  symbol: string;
  last: number;
  prevClose: number;
  chgPct: number;
  open: number;
  high: number;
  low: number;
  /** ms epoch of the provider's quote time */
  t: number;
  source: string;
  freshness: Freshness;
}

export interface MacroPoint {
  value: number;
  prev: number | null;
  date: string; // YYYY-MM-DD of the observation
}

export interface MacroResult {
  vix: MacroPoint | null;
  tnx: MacroPoint | null;
  source: string;
  freshness: Freshness;
  asOf: number;
}

export interface ApiError {
  error: string;
  /** true when no free source can provide this */
  unavailable?: boolean;
  tried?: string[];
}
