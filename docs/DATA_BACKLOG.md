# Data opportunity backlog

Triage of an outside "institutional terminal" wishlist against what the desk already does (Nov 8, 2026). Rules that decide everything here:
free only (R0), real data only and labelled (R7), no new serverless function (R4: Vercel Hobby has 12; new endpoints are routes inside `api/research.ts`),
TypeScript only (no Python runtime, so formulas from statsmodels, arch, vectorbt and similar are ported, not imported).
Endpoints marked (verify) were not re-checked against current documentation; confirm terms and rate limits before building.

Effort: easy under 1 day, medium 1 to 3, hard 4 to 10. Kind: observed = reported by a source; calculated = derived on the desk (must carry a CALCULATED / ESTIMATE tag).

## Built Nov 8, 2026

Fed liquidity and credit widget (`macro`), VIX rank and realized-vol estimators and the weekday / event / gap / overnight tables inside the Movement watch. Data: `api/research?fn=macropack` (FRED only).

## Build next (free, fits the desk, high value)

| Item | Kind | Free source or method | Effort | Why |
|---|---|---|---|---|
| Fed liquidity and credit panel: reverse repo, Treasury General Account, Fed balance sheet, high-yield spread, real 10Y yield, financial conditions | observed | FRED series through the existing FRED adapter (RRPONTSYD, WTREGEN, WALCL, BAMLH0A0HYM2, DFII10, NFCI) (verify ids) | easy | Same adapter and key as VIX and 10Y; big macro context for no new provider |
| Movement stats by event and weekday: chop vs big days after CPI / FOMC / jobs, by weekday, on opex, gap fill vs continuation, overnight vs regular-session move | calculated | 3 years of daily bars the desk already loads plus its own calendar | medium | Extends the Movement watch toward "which days burn theta"; no new data |
| Volatility estimators and IV rank for the market: Parkinson, Garman-Klass, Yang-Zhang, vol of vol, VIX rank and percentile | calculated | Daily OHLC and FRED VIXCLS history | easy | Tells you if options are rich or cheap versus a year of VIX |
| Edge reality check on the backtest and Poker bets: out-of-sample split, bootstrap confidence on expectancy, transaction cost and slippage input, parameter sensitivity | calculated | `shared/backtest.ts`, `shared/edge.ts` already have the trades | medium | Stops a lucky backtest looking like an edge; fits the existing Wilson-bound approach |
| Rolling correlation and beta board: SPY vs QQQ, IWM, TLT, UUP, gold, oil, BTC, semis; flags when a relationship changes | calculated | Daily bars already fetched for the rotation page | medium | Answers "is the relationship still holding" |
| Fundamental quality scores on the Company page: Piotroski F, Altman Z, FCF conversion, accruals (Sloan), dilution, net debt | calculated | SEC EDGAR companyfacts XBRL (free, needs the SEC contact header the desk already sets) | hard (XBRL tag mapping is messy) | Real earnings-quality signal without paying for statement APIs; start with Piotroski, Altman and FCF conversion |
| Observed vs calculated tags everywhere | convention | Add a CALCULATED / ESTIMATE badge beside LIVE / DELAYED / EOD | easy | Cheap integrity win; the Movement watch decay and Gamma levels are estimates and should say so |
| This backlog file | process | Keep adding rows with usefulness, cost, dependencies, effort | easy | The one process idea worth keeping |

## Build later (useful, needs more work or a decision)

| Item | Kind | Free source or method | Effort | Note |
|---|---|---|---|---|
| CFTC Commitments of Traders | observed | CFTC public reporting API or weekly files (verify) | medium | Weekly, 3 days late; good for futures-linked ETFs and commodities |
| FINRA daily short sale volume | observed | FINRA regsho daily files (verify) | medium | Short sale volume is not short interest; label it |
| VIX futures term structure | observed | Cboe publishes daily settlement files (verify) | medium | Contango / backwardation read |
| Max pain, unusual volume vs open interest, skew and term structure | calculated | The Cboe delayed chain the Gamma page already pulls | medium | Volume is not proof of direction; show as activity, not as a signal |
| Anchored VWAP, approximate volume profile, initial balance, prior-day value area | calculated | 5-minute bars (about 10 sessions free) | medium | Approximations from candles; say so. No tick data, so no true order flow |
| Fill quality on your own Webull fills (price vs bar VWAP, slippage by time of day) | calculated | Your order history plus 5-minute bars | medium | Real numbers about your execution |
| Breadth from the S&P 500 heatmap data (advance / decline, up volume share) | calculated | Constituent daily changes the ETFs page already loads | easy | Substitute for NYSE TICK / TRIN, which free feeds don't carry |
| IV history log for IV rank per ticker and earnings IV crush | calculated | Save a daily snapshot of the chain (needs Supabase, already optional) | hard | Cannot be backfilled for free; starts accumulating the day you turn it on |
| Federal contract awards for small caps | observed | USAspending.gov API, no key (verify) | medium | Niche, very good for defense and government names |
| Headline dedupe, news velocity per ticker | calculated | Existing news feeds | easy | Shows when a name is suddenly talked about |
| Point-in-time macro for backtests | observed | ALFRED (FRED archive) | hard | Only matters if macro enters the backtest |

## Already on the desk (don't rebuild)

Hurst, permutation entropy, GARCH(1,1), momentum and trend read (`shared/quant.ts`); historical odds with Wilson lower bound (`edge.ts`); Monte Carlo of the next 50 trades; playbook backtest on 3 years; Kelly, expectancy, position size, recovery math; Form 4 insiders; 13F diffs; ARK trades; Congress trades; gamma walls and flip; expected move; VIX, put/call, Fear and Greed, yield curve; rotation and risk appetite; sector heatmap; Kalshi and Polymarket odds; economic calendar with history; GDELT world map; market-clock mode with holidays; command bar ticker search; per-provider adapter chain with stale-cache fallback.

## Skip (with the reason)

| Item | Reason |
|---|---|
| Order book, tick, quote, time and sales, VPIN, Kyle's lambda, effective and realized spread, order flow imbalance | No free whole-market tick or depth feed. A free IEX-only feed covers a small slice of volume, so these numbers would mislead. Inventing flow from candles is not allowed |
| Google Trends, web traffic, app rankings, job postings, satellite, shipping beyond the existing chokepoints | No official free API (Trends has none); scraping is not authorised |
| Economic surprise index, analyst estimates and revisions, earnings call transcripts | Paid or restricted for redistribution |
| Python libraries (statsmodels, arch, vectorbt, Zipline, QuantLib) | The app has no Python runtime and a function cap; the needed formulas are small and are ported to TypeScript |
| Unified security master, time-series database, streaming infrastructure, normalized warehouse | Over-built for one user on free tiers; the desk caches per request and Supabase is optional |
| 8-agent research programme, 20 report files, full work-breakdown structure | Research theatre for a one-person tool; this file plus the vault decision log covers it |
| Replacing working providers | Not needed; the real fix is a shared request budget (see below) |
| ICT-style labels (fair value gap, change of character, liquidity sweep) as signals | Rule-based pattern labels are possible, but their predictive value is unproven; only add with the edge reality check beside them |

## Fallback and rate limits (partly adopt)

The desk already has provider chains (Twelve Data then Alpha Vantage, Finnhub quote chain) and stale-cache fallback. The remaining gap is the 429s: every Vercel instance counts its own free-tier budget. A shared counter would fix it (for example a free Redis); that is a new provider under R0, so it needs a decision.
