// What each data provider feeds on the desk and what takes over when it fails, plus the rule that turns usage and recent errors into a status word.
// Pure + tested. The server fills in the live numbers (api/_lib/research/status.ts); the page only displays them.
export type ProviderState = 'ok' | 'limited' | 'error' | 'no-key' | 'idle';

export interface ProviderInfo { label: string; feeds: string; fallback: string; unofficial?: boolean }
export const PROVIDER_INFO: Record<string, ProviderInfo> = {
  twelvedata: { label: 'Twelve Data', feeds: 'Candles for the Desk chart (5m, 15m, 1H, D, W, M)', fallback: 'Yahoo Finance, then Alpha Vantage (daily only)' },
  finnhub: { label: 'Finnhub', feeds: 'Live quotes, news, earnings and IPO calendars, company data', fallback: 'Twelve Data quotes; Nasdaq calendar for earnings' },
  alphavantage: { label: 'Alpha Vantage', feeds: 'Put/call ratio, top movers, last-resort daily bars', fallback: 'None (small, 25 a day)' },
  fred: { label: 'FRED (St. Louis Fed)', feeds: 'VIX, yields, Fed liquidity, credit spread, release dates', fallback: 'None: no other free macro source' },
  finra: { label: 'FINRA', feeds: 'Short interest in the Scanner', fallback: 'Scanner shows no short interest' },
  kalshi: { label: 'Kalshi', feeds: 'Fed rate odds, economic odds', fallback: 'Polymarket' },
  gdelt: { label: 'GDELT', feeds: 'World map news hotspots', fallback: 'Desk news feeds place the dots by country' },
  binance: { label: 'Binance (public data)', feeds: 'Crypto candles', fallback: 'CoinGecko' },
  coingecko: { label: 'CoinGecko', feeds: 'Crypto prices (backup)', fallback: 'None' },
  sec: { label: 'SEC EDGAR', feeds: 'Filings, 13F, insider Form 4, IPO filings', fallback: 'None (official source)' },
  gemini: { label: 'Gemini (free tier)', feeds: 'Plain-English filing summaries, AI analysts', fallback: 'Summaries are skipped' },
  wikipedia: { label: 'Wikipedia', feeds: 'Company descriptions', fallback: 'Description left out' },
  aisstream: { label: 'aisstream.io', feeds: 'Ship positions on the world map', fallback: 'Map shows chokepoints without ships' },
  polymarket: { label: 'Polymarket', feeds: 'Crowd odds widget', fallback: 'Kalshi' },
  github: { label: 'GitHub (public files)', feeds: 'AI analyst results', fallback: 'None' },
  yahoo: { label: 'Yahoo Finance', feeds: 'Daily history, candle backup, rotation and quant data', fallback: 'Twelve Data / Alpha Vantage', unofficial: true },
  openfigi: { label: 'OpenFIGI', feeds: 'Matching 13F rows to tickers', fallback: 'Name matching' },
  ark: { label: 'ARK daily files', feeds: 'ARK trades on Smart money', fallback: 'Section left empty' },
  tradingview: { label: 'TradingView screener', feeds: 'Market snapshot for the heatmaps', fallback: 'Yahoo spark quotes', unofficial: true },
  alpaca: { label: 'Alpaca', feeds: 'Real-time IEX quotes and news (when configured)', fallback: 'Finnhub / Twelve Data', },
  nasdaq: { label: 'Nasdaq calendars', feeds: 'Earnings and IPO calendars', fallback: 'Finnhub calendars, Alpha Vantage IPOs', unofficial: true },
  cboe: { label: 'Cboe delayed options', feeds: 'Gamma levels, option chains (15 min delayed)', fallback: 'Gamma page shows nothing' },
  earningsapi: { label: 'Earnings API', feeds: 'Earnings actuals, beat / miss and the moves after reports', fallback: 'Finnhub actuals, Nasdaq estimates' },
  rdw: { label: 'RDW (Netherlands vehicle register)', feeds: 'Tesla and BYD registrations by month and model', fallback: 'Section left empty' },
  opensky: { label: 'OpenSky Network', feeds: 'Airport and airline traffic, jet tracker (Real Economy)', fallback: 'Sections left empty' },
  eia: { label: 'EIA open data', feeds: 'Electricity demand by grid region, gasoline by state', fallback: 'National gasoline from FRED' },
  noaa: { label: 'NOAA weather alerts', feeds: 'Severe weather risk by sector', fallback: 'Section left empty' },
  stocktwits: { label: 'StockTwits', feeds: 'Watchers and bullish / bearish tags on the Alt Data page', fallback: 'Section left empty', unofficial: true },
  copernicus: { label: 'Copernicus Data Space (Sentinel-2)', feeds: 'Satellite lot fullness on the Tesla & Lots page', fallback: 'Lots show setup steps' },
  tradetime: { label: 'Trade Time', feeds: 'World exchange hours, open / closed status and holidays', fallback: 'Built-in session table' },
  zillow: { label: 'Zillow Research', feeds: 'Home values, rents, listings and sales (monthly)', fallback: 'Housing panel left out' },
  mempool: { label: 'mempool.space', feeds: 'Bitcoin network: fees, hash rate, difficulty', fallback: 'Section left out' },
  apewisdom: { label: 'ApeWisdom', feeds: 'Trending tickers on Reddit', fallback: 'Section left out', unofficial: true },
  dataroma: { label: 'Dataroma', feeds: 'Superinvestor 13F portfolio updates', fallback: 'Section left out', unofficial: true },
};

export interface ProviderUsage { used: number; limit: number }
export interface ProviderHealth { lastOk?: number; lastError?: string; lastErrorAt?: number }

/** limited = a budget is nearly used up, or the last error was a rate limit; error = it failed recently and has not succeeded since */
export function stateOf(i: { keyed: boolean; hasKey: boolean; min: ProviderUsage; day: ProviderUsage; health: ProviderHealth; now: number }): ProviderState {
  if (i.keyed && !i.hasKey) return 'no-key';
  const recent = (t?: number) => t != null && i.now - t < 15 * 60_000;
  const err = i.health.lastError, errAt = i.health.lastErrorAt;
  const failing = recent(errAt) && (i.health.lastOk == null || (errAt ?? 0) > i.health.lastOk);
  const frac = Math.max(i.min.limit ? i.min.used / i.min.limit : 0, Number.isFinite(i.day.limit) && i.day.limit ? i.day.used / i.day.limit : 0);
  if (frac >= 0.9 || (failing && /429|rate limit|budget/i.test(err ?? ''))) return 'limited';
  if (failing) return 'error';
  if (recent(i.health.lastOk)) return 'ok';
  return 'idle';
}
export const STATE_LABEL: Record<ProviderState, string> = { ok: 'Working', limited: 'Limited', error: 'Failing', 'no-key': 'Needs a key', idle: 'Not used lately' };
