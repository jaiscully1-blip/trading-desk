// Strategy library: a reference and launch pad, not an engine. One card per idea, grouped by family, written in our own
// words. Idea source for the family list: "151 Trading Strategies" (Kakushadze and Serur), SSRN 3247865. Nothing here is
// copied from the paper and no card says a direction is good or bad: it says what the idea needs and whether the desk's free
// data can test it. Not advice. A backtest is not proof.

export type Family = 'momentum' | 'meanrev' | 'vol' | 'event' | 'season' | 'pairs' | 'trend';
export type FreeFit = 'yes' | 'partly' | 'no';
/** Where the card's button goes. `scanner` sets that preset filter; `backtest` opens Home (Playbook backtest widget). */
export type Launch =
  | { kind: 'scanner'; filterId: string; label: string }
  | { kind: 'backtest'; label: string }
  | { kind: 'page'; page: 'flows' | 'gamma' | 'calendar' | 'patterns'; label: string };

export interface StrategyCard {
  id: string; family: Family; name: string;
  idea: string;            // plain English, our own words
  needs: string;           // data the idea needs
  free: FreeFit; freeNote: string; // can free-tier data support it, and why
  uses: string[];          // existing desk numbers that touch it
  optionsNote: string;     // theta / movement framing (never a bullish or bearish verdict)
  launch?: Launch;
}

export const SOURCE = { title: '151 Trading Strategies', authors: 'Kakushadze and Serur', url: 'https://ssrn.com/abstract=3247865' };

export const FAMILIES: { id: Family; label: string; blurb: string }[] = [
  { id: 'momentum', label: 'Momentum', blurb: 'Things that have been moving tend to keep their relative standing for a while (or they do not: test it).' },
  { id: 'trend', label: 'Trend following', blurb: 'Rules that stay with a move until an exit rule says stop, so the size of the move matters more than the call.' },
  { id: 'meanrev', label: 'Mean reversion', blurb: 'Stretched prices that snap back toward an average. Works until a stretch turns into a regime change.' },
  { id: 'vol', label: 'Volatility', blurb: 'Trade the size of movement and what options charge for it, not the direction.' },
  { id: 'event', label: 'Event-driven', blurb: 'Scheduled news (earnings, CPI, Fed, IPOs) that makes movement more likely on a known day.' },
  { id: 'season', label: 'Seasonality', blurb: 'Calendar patterns in how much or how far the tape moves.' },
  { id: 'pairs', label: 'Relative value and pairs', blurb: 'One thing against another so the market-wide move cancels out.' },
];

export const FREE_LABEL: Record<FreeFit, string> = { yes: 'Free data: yes', partly: 'Free data: partly', no: 'Free data: no' };

export const STRATEGIES: StrategyCard[] = [
  // ---- momentum
  { id: 'xs-momentum', family: 'momentum', name: 'Cross-sectional momentum', free: 'yes',
    idea: 'Rank a basket by how much each name moved over the past few months, skipping the most recent weeks, and lean on the names at the top of the ranking. It is about relative standing, not about the market going up.',
    needs: 'Daily closes for a basket of tickers (months of history).',
    freeNote: 'Daily bars are on the free tier; the desk already ranks relative strength against SPY.',
    uses: ['RS rank vs SPY', 'Scanner 20/50D breakout', 'Playbook backtest'],
    optionsNote: 'Leaders still need to move enough to beat the theta you pay; check Movement watch before buying time.',
    launch: { kind: 'scanner', filterId: 'brk', label: 'Scanner: 20/50D breakouts' } },
  { id: 'hi52', family: 'momentum', name: 'Closeness to the 52-week high', free: 'yes',
    idea: 'Names that sit near their one-year high are compared with names far from it. The distance from the high is the signal, not the price level.',
    needs: 'One year of daily highs and closes.',
    freeNote: 'Fully covered by daily bars.',
    uses: ['Scanner 52W high', 'RS rank vs SPY'],
    optionsNote: 'Near-high names can go quiet for weeks; quiet means decay wins on long options.',
    launch: { kind: 'scanner', filterId: 'hi52', label: 'Scanner: 52-week highs' } },
  { id: 'sector-rot', family: 'momentum', name: 'Sector and ETF rotation', free: 'yes',
    idea: 'Rank sector and theme ETFs by recent performance and watch which groups money is moving into and out of. The unit is a group, which is cheaper to track than hundreds of names.',
    needs: 'Daily closes for sector ETFs.',
    freeNote: 'Sector ETF bars are free; the Rotation page already computes the ranking.',
    uses: ['Rotation page', 'RS rank vs SPY'],
    optionsNote: 'Rotation tells you where movement is happening, which is where long options have a better chance to pay for decay.',
    launch: { kind: 'page', page: 'flows', label: 'Open Rotation' } },

  // ---- trend following
  { id: 'ma-cross', family: 'trend', name: 'Moving-average crossover', free: 'yes',
    idea: 'A fast average crossing a slow average marks a possible change of pace. Simple, late by design, and it produces many small whipsaws in quiet markets.',
    needs: 'Daily closes.',
    freeNote: 'Covered by daily bars.',
    uses: ['Playbook backtest', 'Scanner 20/50D breakout'],
    optionsNote: 'Whipsaw periods are exactly the quiet, low-movement days where theta eats long options.',
    launch: { kind: 'backtest', label: 'Open Playbook backtest (Home)' } },
  { id: 'donchian', family: 'trend', name: 'Channel breakout (Donchian style)', free: 'yes',
    idea: 'Act when price leaves its recent high-low channel and exit when it returns through a shorter channel. The exit rule is part of the strategy, not an afterthought.',
    needs: 'Daily highs and lows.',
    freeNote: 'Covered by daily bars.',
    uses: ['Scanner 20/50D breakout', 'Playbook backtest (stop in ATR, target in R)'],
    optionsNote: 'A breakout that fails to follow through is a theta loss; the backtest R-multiples show how often.',
    launch: { kind: 'scanner', filterId: 'brk', label: 'Scanner: breakouts' } },
  { id: 'vol-breakout', family: 'trend', name: 'Squeeze then expansion', free: 'yes',
    idea: 'A stretch of unusually narrow range often precedes a wider one. The idea is the range change, and it says nothing about which way the move goes.',
    needs: 'Daily highs, lows and closes.',
    freeNote: 'Covered by daily bars; the desk already flags squeezes.',
    uses: ['Scanner squeeze', 'Volatility: range-based estimators'],
    optionsNote: 'Direction-neutral. A squeeze means options may be cheap relative to a coming move, or the squeeze may just keep going: check IV rank.',
    launch: { kind: 'scanner', filterId: 'squeeze', label: 'Scanner: squeeze' } },

  // ---- mean reversion
  { id: 'rsi-revert', family: 'meanrev', name: 'Short-term stretch and snap-back', free: 'yes',
    idea: 'After a few unusually large days in a row, price sometimes drifts back toward its short average. Holding periods are days, and costs matter a lot at that speed.',
    needs: 'Daily closes (an oscillator or a z-score of the last few days).',
    freeNote: 'Covered by daily bars.',
    uses: ['Playbook backtest', 'Edge odds (historical odds from similar states)'],
    optionsNote: 'Snap-backs are often smaller than the premium on a short-dated option; compare the average move to the priced-in move.',
    launch: { kind: 'backtest', label: 'Open Playbook backtest (Home)' } },
  { id: 'gap-fill', family: 'meanrev', name: 'Gap fill or continue', free: 'yes',
    idea: 'A gap at the open either gets closed during the day or runs on. The desk counts how often each happened for SPY in its own history.',
    needs: 'Daily open, high, low, close.',
    freeNote: 'Covered by daily bars; the Movement watch card shows fill and continue rates.',
    uses: ['Gap stats (shared/movementStats.ts)', 'Scanner gappers and gap-and-go'],
    optionsNote: 'Either outcome is movement. A gap that fills and stalls is the case where theta wins.',
    launch: { kind: 'scanner', filterId: 'gappers', label: 'Scanner: gappers ≥3%' } },
  { id: 'etf-premium', family: 'meanrev', name: 'ETF versus its holdings', free: 'no',
    idea: 'An ETF can trade slightly away from the value of what it holds. Catching that gap needs live, precise prices on both sides.',
    needs: 'Real-time ETF price and its net asset value or live basket prices.',
    freeNote: 'Free tiers are delayed and do not carry intraday NAV; the gaps are too small and short to see at that quality.',
    uses: [],
    optionsNote: 'Not an options idea.' },

  // ---- volatility
  { id: 'vrp', family: 'vol', name: 'Volatility risk premium', free: 'yes',
    idea: 'Options usually charge more than the market then actually moves. The gap between implied and realized volatility is the premium; it is thin or negative in the stretches that hurt.',
    needs: 'An implied volatility proxy (VIX) and daily bars for realized volatility.',
    freeNote: 'VIX history and SPY bars are free. Single-name implied vol history is not.',
    uses: ['VIX minus realized (shared/volatility.ts)', 'VIX one-year rank', 'Movement watch'],
    optionsNote: 'This is the theta-burn view: when options are priced above movement, decay wins for the seller and the buyer fights it.',
    launch: { kind: 'page', page: 'gamma', label: 'Open Gamma & IV' } },
  { id: 'vol-regime', family: 'vol', name: 'Volatility regime and vol of vol', free: 'yes',
    idea: 'Where volatility sits in its own one-year range, and how violently it changes, describes the environment better than a single reading.',
    needs: 'VIX history.',
    freeNote: 'VIX daily history is free.',
    uses: ['VIX one-year rank and percentile', 'Vol of vol', 'Gamma regime'],
    optionsNote: 'High rank means options are expensive, low rank means cheap; neither says which way the next move goes.',
    launch: { kind: 'page', page: 'gamma', label: 'Open Gamma & IV' } },
  { id: 'term-structure', family: 'vol', name: 'Volatility term structure and futures curve', free: 'no',
    idea: 'Compare near-dated with far-dated volatility (or volatility futures) to see whether the market expects calm or stress ahead.',
    needs: 'VIX futures curve or a full options surface across expiries, ideally history.',
    freeNote: 'Free tiers have no VIX futures curve and no historical option chains. Do not trust a hand-built substitute.',
    uses: ['Gamma & IV surface (current snapshot only)'],
    optionsNote: 'Would matter a lot for calendar spreads, but cannot be tested honestly on free data.' },

  // ---- event-driven
  { id: 'earnings-move', family: 'event', name: 'Earnings: implied versus actual move', free: 'partly',
    idea: 'Before earnings, options price an expected move. Over many quarters you can ask whether the actual moves were bigger or smaller than that on average.',
    needs: 'Earnings dates, past price reactions, and the option-implied move for each (history).',
    freeNote: 'Dates and past reactions are free. Historical implied moves are not, so only the current event is checkable.',
    uses: ['Earnings and IPO calendar', 'Movement watch'],
    optionsNote: 'Movement either way is the point; IV crush after the print is the theta-style cost to know about.',
    launch: { kind: 'page', page: 'calendar', label: 'Open Calendars' } },
  { id: 'macro-day', family: 'event', name: 'CPI, jobs and Fed days', free: 'yes',
    idea: 'Scheduled macro releases change how far the index moves on that day. The desk marks those days and compares them with normal days.',
    needs: 'Calendar of release dates and daily bars.',
    freeNote: 'Dates are free; the weekday and event stats already use them.',
    uses: ['Event day stats (shared/movementStats.ts)', 'Macro widget', 'Calendars'],
    optionsNote: 'Compare the average move on event days with the priced-in move before paying for time.',
    launch: { kind: 'page', page: 'calendar', label: 'Open Calendars' } },

  // ---- seasonality
  { id: 'weekday', family: 'season', name: 'Day-of-week movement', free: 'yes',
    idea: 'Some weekdays tend to have wider or narrower ranges. Measure range and chop rate per weekday, not just the average direction.',
    needs: 'Daily bars.',
    freeNote: 'Covered by daily bars; the Movement watch card has a per-weekday table.',
    uses: ['Weekday stats (shared/movementStats.ts)', 'Movement watch'],
    optionsNote: 'The useful read is which days are quiet (decay wins) and which are active.',
    launch: { kind: 'backtest', label: 'Open Playbook backtest (Home)' } },
  { id: 'opex-turn', family: 'season', name: 'Monthly option expiry and turn-of-month', free: 'partly',
    idea: 'Option expiry days and the turn of the month can change how the tape behaves. Samples are small, so this is easy to over-read.',
    needs: 'Daily bars and an expiry calendar.',
    freeNote: 'Bars and the calendar rule are free, but only a few dozen events per year exist: low sample size.',
    uses: ['Monthly opex flag (shared/movementStats.ts)'],
    optionsNote: 'Pinning near expiry can mean smaller ranges; confirm in the numbers, not in the story.' },

  // ---- relative value / pairs
  { id: 'pairs', family: 'pairs', name: 'Pairs: two related names', free: 'partly',
    idea: 'Two stocks in the same industry usually move together. When the gap between them stretches, the idea is that it narrows, and the market-wide move cancels out.',
    needs: 'Daily closes for both names, and the ability to hold one long and one short.',
    freeNote: 'Prices are free. The desk does not place short stock orders, so it is research only here.',
    uses: ['RS rank vs SPY (as a proxy for the gap)'],
    optionsNote: 'Can be built with options on each leg, but the desk does not model multi-leg options.' },
  { id: 'etf-relative', family: 'pairs', name: 'Sector versus market', free: 'yes',
    idea: 'Compare a sector ETF with SPY: the ratio rising or falling shows which side is leading, without a call on the market itself.',
    needs: 'Daily closes for the sector ETF and SPY.',
    freeNote: 'Covered by daily bars.',
    uses: ['Rotation page', 'RS rank vs SPY'],
    optionsNote: 'A ratio can trend while both legs are quiet, so check movement separately.',
    launch: { kind: 'page', page: 'flows', label: 'Open Rotation' } },
];

export const TODO_EDGE_CHECK = 'TODO (edge reality check): out-of-sample split, bootstrap confidence interval and costs for every backtest. Not built yet; see the vault note on the edge reality check.';

export function filterStrategies(list: StrategyCard[], family: Family | 'all' = 'all', onlyFree = false): StrategyCard[] {
  return list.filter((s) => (family === 'all' || s.family === family) && (!onlyFree || s.free !== 'no'));
}
export function familyCounts(list: StrategyCard[]): Record<Family, number> {
  const out = Object.fromEntries(FAMILIES.map((f) => [f.id, 0])) as Record<Family, number>;
  for (const s of list) out[s.family]++;
  return out;
}
