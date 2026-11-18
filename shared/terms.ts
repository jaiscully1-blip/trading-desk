// One place to look up "what does this mean?" for any label on the desk: tear-sheet numbers, ratios, data labels,
// plus everything already written for Learn (glossary, basics, price-action patterns). Pure (tested).
import { GLOSSARY } from './learn';
import { BASICS } from './basics';
import { PA_DEFS } from './pacards';

export interface Term { title: string; what: string; read?: string[]; watch?: string; learn?: string }

/** Numbers and labels the desk shows that aren't in the Learn glossary. */
export const STAT_TERMS: Record<string, Term> = {
  'market cap': { title: 'Market cap', what: 'Share price × shares outstanding: what the stock market says the whole company is worth.', read: ['Large cap over $10B, mid cap $2–10B, small cap under $2B.', 'Two sources can differ a little because they use different share counts or times.'], learn: 'basics' },
  employees: { title: 'Employees', what: 'Full-time staff at the last annual report.', read: ['Revenue ÷ employees is a quick productivity check across peers.'] },
  founded: { title: 'Founded', what: 'The year the company (or the business it grew from) started.' },
  hq: { title: 'Headquarters', what: 'Where the company is based. It matters for taxes, regulation and which currency most costs are in.' },
  price: { title: 'Price', what: 'The last trade price, about 15 minutes delayed on free data.' },
  'shares out': { title: 'Shares outstanding', what: 'Every share that exists and is held by investors, insiders included.', read: ['Rising share count = dilution: each share owns a smaller slice.', 'A big year-over-year jump is often a stock split, an acquisition paid in stock, or heavy stock-based pay.'] },
  float: { title: 'Float', what: 'Shares that can actually trade: shares outstanding minus those locked up by insiders and big long-term holders.', read: ['Small floats move more on the same buying or selling.'] },
  'short interest': { title: 'Short interest', what: 'Shares sold short and not yet bought back, reported twice a month by FINRA.', read: ['% of float: above 10% is high, above 20% is crowded.', 'Days to cover = short shares ÷ average daily volume: how many days it would take shorts to buy back. Higher = more squeeze risk.'], learn: 'basics' },
  cash: { title: 'Cash', what: 'Cash and short-term investments on the latest balance sheet.' },
  debt: { title: 'Debt', what: 'Long-term borrowing on the latest balance sheet.' },
  'net cash': { title: 'Net cash', what: 'Cash minus debt. Positive = could pay off all its debt today; negative = net debt.' },
  revenue: { title: 'Revenue', what: 'Total sales for the period, before any costs ("the top line").', read: ['Growth in revenue usually drives a stock more than anything else for growth companies.'] },
  'net income': { title: 'Net income', what: 'Profit after every cost, interest and tax ("the bottom line"). Negative = a loss.', read: ['Can be pushed around by one-time items, so look at several years.'] },
  'free cash flow': { title: 'Free cash flow', what: 'Cash from operations minus spending on equipment and buildings: the cash the business actually throws off.', read: ['Often more reliable than net income, which includes non-cash items like stock-based pay.'] },
  'next earnings': { title: 'Next earnings', what: 'When the company is expected to report its next quarter, with the analysts’ average EPS estimate.', read: ['Stocks often move 5–10% or more on the report; options get more expensive into it.'] },
  'p/e (trailing)': { title: 'P/E (trailing)', what: 'Price ÷ the last 12 months of earnings per share.', read: ['Very high P/E (in the hundreds or thousands) usually means earnings are tiny or just turned positive, not that the stock is "expensive" in a simple way.', 'Compare with peers and the company’s own history.'] },
  'p/e (forward)': { title: 'P/E (forward)', what: 'Price ÷ analysts’ expected earnings per share for the next 12 months.', read: ['Lower than trailing P/E = earnings expected to grow.'] },
  'p/sales': { title: 'Price to sales', what: 'Market cap ÷ the last 12 months of revenue.', read: ['Used for companies with little or no profit yet. Software often trades at 5–15×; 40× is very high.'] },
  'p/book': { title: 'Price to book', what: 'Market cap ÷ book value (assets minus liabilities).', read: ['Most useful for banks and asset-heavy companies; less so for software.'] },
  'ev/ebitda': { title: 'EV / EBITDA', what: 'Enterprise value (market cap + debt − cash) ÷ earnings before interest, taxes, depreciation and amortization.', read: ['Compares companies with different debt levels. Around 10–15× is typical; thousands means EBITDA is near zero.'] },
  sector: { title: 'Sector', what: 'The broad group the company is classified in (GICS), like Information Technology or Health Care.', read: ['Stocks in the same sector often move together.'] },
  industry: { title: 'Industry', what: 'The narrower business group inside the sector, like Systems Software.' },
  exchange: { title: 'Exchange', what: 'Where the stock is listed. NASDAQ Global Select (NMS) and NYSE are the main US exchanges.' },
  'fiscal year ends': { title: 'Fiscal year end', what: 'The month the company’s financial year closes. Quarter labels (Q1–Q4) follow it, not the calendar.' },
  suppliers: { title: 'Suppliers', what: 'Companies or groups the company buys from or depends on, as described in its annual report (10-K).', read: ['A supplier’s trouble can become this company’s trouble (shortages, price hikes).'] },
  customers: { title: 'Customers', what: 'Who buys from the company. Companies must name any customer that is 10% or more of revenue.', read: ['One big customer = concentration risk.'] },
  competitors: { title: 'Competitors', what: 'Rivals the company names in its own 10-K, plus same-industry peers.' },
  beta: { title: 'Beta', what: 'How much the stock tends to move when the market moves 1%. Above 1 = moves more than the market.' },
  alpha: { title: 'Alpha', what: 'Return beyond what market and style factors explain.' },
  correlation: { title: 'Correlation (r)', what: 'How closely two series move together, from −1 (opposite) to +1 (together). 0 = no relation.', read: ['r² is the share of one series’ swings the other explains.', 'Correlation is not cause.'] },
  'p-value': { title: 'p-value', what: 'The chance of seeing a link this strong by luck if there were no real link. Under 5% is the usual bar.', read: ['Testing many pairs makes some pass by luck: that’s why Quant Lab also shows q.'] },
  vix: { title: 'VIX', what: 'The market’s expected volatility of the S&P 500 over the next 30 days, from option prices. The "fear gauge".', read: ['Under 15 calm, 20–30 nervous, above 30 fearful.'] },
  'fear & greed': { title: 'Fear & Greed', what: 'A 0–100 mood score built from several market measures (momentum, breadth, options, junk bonds and others). Low = fear.' },
  '2s10s': { title: '2s10s', what: '10-year Treasury yield minus the 2-year yield, in basis points. Negative (inverted) has preceded most US recessions.' },
  'p/c': { title: 'Put/call ratio', what: 'Put volume ÷ call volume. High = more hedging or bearish bets; very high readings often come near lows.' },
  'p/c (spy)': { title: 'Put/call ratio (SPY)', what: 'Put volume ÷ call volume on SPY options. Above 1 = more puts than calls (hedging or bearish bets).', read: ['Very high readings often come near short-term lows, when fear is crowded.'] },
  '3m10y': { title: '3m10y', what: '10-year Treasury yield minus the 3-month bill yield. The New York Fed’s favorite recession signal when it’s negative.' },
  '10y': { title: '10-year Treasury yield', what: 'What the US government pays to borrow for 10 years. It sets the tone for mortgage rates and how much investors pay for future profits.', read: ['Rising yields usually weigh on growth and tech stocks.'] },
  'oil (uso)': { title: 'Oil (USO)', what: 'The USO oil fund as a live stand-in for crude oil prices.', read: ['Oil feeds into inflation, airline and trucking costs, and energy stocks.'] },
  'dollar (uup)': { title: 'Dollar (UUP)', what: 'The UUP fund as a live stand-in for the US dollar against major currencies.', read: ['A stronger dollar hurts US companies that sell a lot abroad, and commodities priced in dollars.'] },
  'strongest link': { title: 'Strongest link', what: 'The series whose quarterly moves lined up most closely with the stock’s, at its best lead or lag.', read: ['Strong is not the same as real: check the verdict and the walk-forward test.'] },
  'links that hold up': { title: 'Links that hold up', what: 'Series that pass the many-tests check (q under 10%) and point the same way in both halves of the history.' },
  history: { title: 'History', what: 'How many quarters of the stock’s returns the finder could line up with other data.', read: ['Under about 30 quarters, almost nothing will pass the luck check.'] },
  'luck check (q)': { title: 'Luck check (q value)', what: 'The p-value adjusted for testing many pairs at once (Benjamini-Hochberg). Under 10% = unlikely to be a fluke even after all that testing.' },
  'swings explained': { title: 'Swings explained (r²)', what: 'Correlation squared: the share of the stock’s quarter-to-quarter swings that move with the other series.' },
  halves: { title: 'Halves', what: 'The correlation in the first half of the history and in the second. A real link usually shows up in both.' },
  'walk-forward test': { title: 'Walk-forward test', what: 'Finds the link on the first two-thirds of the history, then checks it on the last third it never saw. The closest thing to "would it have worked going forward".' },
  'predicts beyond own past?': { title: 'Granger test', what: 'Asks whether the other series, one quarter earlier, improves the forecast of the stock beyond the stock’s own last quarter.', read: ['Passing shows the series moves first, not that it causes the move.'] },
  'explained by factors': { title: 'Explained by factors (R²)', what: 'The share of the stock’s monthly moves that the market, size, value, profitability, investment and momentum factors explain together.' },
  'left over (alpha)': { title: 'Alpha', what: 'The yearly return left after the factors explain what they can. The t value says whether it could just be zero.' },
  market: { title: 'Market factor (beta)', what: 'How much the stock moves per 1% move in the whole US market. 1.0 = moves with it.' },
  'size (small minus big)': { title: 'Size factor', what: 'Small companies minus large ones. Positive tilt = the stock behaves like a small cap.' },
  'value (cheap minus expensive)': { title: 'Value factor', what: 'Cheap stocks (high book value per price) minus expensive ones. Positive = value stock; negative = growth stock.' },
  'profitability (robust minus weak)': { title: 'Profitability factor', what: 'Highly profitable companies minus weakly profitable ones.' },
  'investment (conservative minus aggressive)': { title: 'Investment factor', what: 'Companies that invest cautiously minus those growing assets fast.' },
  'momentum (winners minus losers)': { title: 'Momentum factor', what: 'Stocks that rose most over the past year minus those that fell most. Positive tilt = rides recent winners.' },
  'reaction': { title: 'Reaction', what: 'The move beyond the market from the day before the event to the day after.' },
  'drift after': { title: 'Drift after', what: 'The move beyond the market from day 2 to day 20 after the event: whether the stock kept going after the news was out.' },
  'spy exp. move': { title: 'Expected move', what: 'The move the options market prices in for SPY, from at-the-money option prices.' },
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9/&%. ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Look up a label anywhere on the desk. Returns null when nothing is written for it. */
let STAT_N: Map<string, Term> | null = null;
export function lookupTerm(label: string): Term | null {
  const k = norm(label);
  STAT_N ??= new Map(Object.entries(STAT_TERMS).map(([a, v]) => [norm(a), v]));
  if (STAT_N.has(k)) return STAT_N.get(k)!;
  const g = GLOSSARY.find((x) => norm(x.term) === k || norm(x.term).replace(/\s*\(.*\)/, '') === k);
  if (g) return { title: g.term, what: g.def };
  const b = BASICS.find((x) => norm(x.name) === k || norm(x.id) === k);
  if (b) return { title: b.name, what: b.short, read: b.points, watch: b.watch, learn: 'basics' };
  const pa = Object.keys(PA_DEFS).find((x) => norm(x) === k);
  if (pa) return { title: pa, what: PA_DEFS[pa], learn: 'pa' };
  // loose: a stat term that starts the label ("Market cap $224B")
  const loose = [...STAT_N.keys()].find((x) => k.startsWith(x + ' '));
  return loose ? STAT_N.get(loose)! : null;
}
