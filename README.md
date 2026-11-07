# Trading Desk

Personal trading desk for swing momentum names and intraday SPY/QQQ. Dense, keyboard-first, Bloomberg-style.
It never places trades: it shows information and enforces your own rules.

**Status: Milestone 7 (market-clock mode with holidays and early closes).** With API keys set, quotes, candles, VIX/10Y,
SPY/QQQ levels, the scanner, RS rank, news, calendars and the fear strip are real. The journal and account are always your own
data. Without keys (or in the static preview) market data falls back to generated sample data behind a `DEMO DATA` badge.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit + API tests (no network; providers are mocked)
npm run build        # typecheck + production build to dist/
npm run build:single # one self-contained HTML file in dist-single/ (used for hosted previews)
```

`npm run dev` also runs the `/api` functions locally and reads keys from `.env.local`.

Deploy: import the repo in Vercel (framework preset: Vite) and add the env vars below. `/api/*.ts` deploy as serverless functions automatically.

## Environment variables

Milestone 1 needs none. See `.env.example` for the full list and which milestone uses each.
Keyed provider calls go through `/api` serverless functions, so API keys never reach the browser.
Never prefix a secret with `VITE_` (Vite ships those to the client).

| Variable | Used from | Where |
|---|---|---|
| `TWELVEDATA_API_KEY` | M2 | server |
| `FINNHUB_API_KEY` | M2 | server |
| `ALPHAVANTAGE_API_KEY` | M2 | server |
| `FRED_API_KEY` | M2 | server |
| `SEC_USER_AGENT` | company page | server: `TradingDesk you@email.com` (SEC's required contact; not a key) |
| `GEMINI_API_KEY` (+ optional `GEMINI_MODEL`) | company page | server: free key from aistudio.google.com |
| `AISSTREAM_API_KEY` | world map, shipping layer | server: free key from aisstream.io (optional) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | M3 | browser (public; row-level security in `supabase/schema.sql`) |
| `ANTHROPIC_API_KEY` | M10 | server |

## Data layer

```
browser ──> /api/candles  ─> Twelve Data ─> Alpha Vantage (daily only)
        ──> /api/quotes   ─> Finnhub ─> Twelve Data
        ──> /api/macro    ─> FRED (VIXCLS, DGS10)
        ──> /api/health   (which keys exist; never the keys)
```

- **Adapters** live in `api/_lib/adapters.ts`; reorder or swap a chain there. Parsers are pure functions in `shared/parse.ts`.
- **Rate limits** (free tiers, checked Nov 2026): Twelve Data 8 credits/min and 800/day; Finnhub 60 calls/min; Alpha Vantage 25/day. The server keeps a per-instance budget just under each.
- **Caching:** in-memory per function instance with a stale fallback, plus `s-maxage` headers so Vercel's CDN serves repeat requests without spending credits. TTLs are shorter during the regular session.
- **Credit budget:** 5-minute candles refresh 20 seconds after each bar closes, not continuously. Between refreshes the forming bar is updated from the 30-second Finnhub quote. Three symbols on 5m costs about 234 Twelve Data credits a day.
- **Freshness badges:** `LIVE` (real-time provider), `END OF DAY` (Alpha Vantage daily fallback, FRED), `NO DATA` (missing key or outage), `UNAVAILABLE ON FREE TIER`, `DEMO DATA`.

## Scanner and playbooks (M3)

**Universe:** watchlist + your scan list (+ optional Alpha Vantage top movers), capped at 40. A full-market scan isn't possible on
free tiers: Twelve Data allows 8 credits a minute, so the scan fills in progressively (about 5 tickers a minute, leaving 2 credits
for charts) and then refreshes daily bars hourly. Each ticker costs about 8 credits a day.

```
/api/scan?symbols=...  ─> Twelve Data daily bars (never the Alpha Vantage fallback)
                       ─> FINRA consolidated short interest (keyless, twice monthly)
                       ─> Finnhub company news (catalyst = headline in last 24h) + profile (shares outstanding)
/api/movers            ─> Alpha Vantage TOP_GAINERS_LOSERS, hourly, plain tickers ≥ $2 and ≥ 500k volume
```

- **Metrics** (`shared/scan.ts`): gap %, time-of-day adjusted RVOL, above 20/50-day average, breakouts above 20/50-day and 52-week
  highs, gap-and-go (gap ≥ 3%, above open, RVOL ≥ 1.5), squeeze (days to cover ≥ 5 or SI ≥ 15% of shares out, + 5/20-day volume ≥ 1.3x,
  + catalyst), bull flag, cup and handle.
- **RS rank:** stock return minus SPY return over 5, 20 and 60 days, averaged, then ranked 1-99 across the universe. Live prices update it.
- **Playbooks** (P): weighted criteria with thresholds. Grade = passed weight / weight that had data: A+ ≥ 90%, A ≥ 80%, B ≥ 65%, else C.
  A `*` means under half the weight could be checked. Two starter playbooks: Momentum A+, Swing breakout.
- **Filters:** presets plus saved custom filters (AND of conditions). `+` adds a result to Watching.
- **Not on free tiers:** premarket volume.

## Journal, account and guardrails (M4)

- **Trade ticket** (Q): ticker, side, entry, stop, target, size, setup, thesis, emotion, screenshot (paste/drop). Grade at entry is
  stamped from the active playbook. **Log entry stays disabled until every checklist item (generated from the playbook) is ticked**,
  the day's check-in is done, and you're not locked out or cooling down. The scanner's verdict is shown next to each item; ticking
  one the data says failed is allowed but logged as a violation.
- **Journal** (Shift+J): trades with fills, partial exits, stop moves, notes, screenshots; R-multiple, win rate, expectancy (R and $),
  profit factor; breakdowns by setup, grade, emotion and time of day (ET, 30-minute buckets).
- **Broker CSV import:** drop fills and cash-transfer CSVs together. Columns are auto-detected (Webull order history: Symbol, Side,
  Status, Filled, Avg Price, Filled Time) and can be remapped. Fills are grouped into round trips and attached to the journal entry you
  logged (same symbol/side, within 30 minutes before the first fill); broker fills replace hand-entered ones. Round trips with no plan
  become "imported" trades, flagged as a violation. Re-importing the same file never double-counts. Deposits/withdrawals are detected
  from the transfers file. Webull exports have no fees; times are read as US Eastern.
- **Account:** starting balance is set once (changing it requires typing RESET). Equity = start + realized P&L + deposits − withdrawals
  (+ unrealized on open positions). There is no manual deposit button. The drawer shows the equity curve and a P&L calendar.
- **Guardrails:** position size from stop distance and risk % (default 0.5%); max daily loss lockout (default 2% of start-of-day
  equity, realized) until the next session; 10-minute cooldown after 2 losses in a row; portfolio heat (open risk to stops, max 6%);
  pre-session tilt check-in (sleep, mood, stress, chasing losses) that halves risk per trade on a high-tilt day; rules can't be loosened
  while locked.
- **Violation log priced in dollars:** oversized position (the share of the loss above plan), widened stop (loss beyond the planned
  risk), traded during lockout/cooldown or before check-in, no plan, ticked a failing checklist item, over max heat (the trade's loss).
  Winners that broke a rule are logged at $0.
- **Storage:** journal, transfers and check-ins in IndexedDB (screenshots are compressed to ≤1280px JPEG); with Supabase each trade is
  a row in `desk_items` and edits merge per trade.

## News, calendars and fear strip (M5)

```
/api/news      ─> Finnhub market news + company news (watchlist), RSS: CNBC, MarketWatch, Yahoo Finance, Federal Reserve, BLS
/api/calendar  ─> FRED release calendar (+ SPY reaction history), FOMC schedule, Kalshi Fed odds, Alpha Vantage earnings + IPOs
/api/macro     ─> FRED VIX, 10Y, 2s10s, 3m10y (end of day) + Alpha Vantage SPY put/call (every 2h)
```

- **24/7 ticker** and **News tab**: merged, de-duplicated, tagged to tickers (symbol, $symbol, or company name) and flagged macro.
  Every feed is optional: a failing feed shows as ✗ in the source list instead of breaking the panel.
- **News flags on the chart**: each headline is pinned to the candle it hit (or the next candle after the close). Click a flag for
  headline, source, time and sentiment. Filter: ticker + macro / ticker / macro / off.
- **Sentiment** is keyword-based and labeled "rough"; the AI headline scorer in Milestone 10 replaces it.
- **Calendars tab** (C): Fed countdown (2:00 PM ET statement, SEP meetings marked; 2026 confirmed, 2027 tentative) with rate odds from
  Kalshi's public prediction-market data (not CME FedWatch, which has no free API); economic releases with impact and "what usually
  happens" (SPY's average move on the last N release days vs. a typical day, from daily bars); earnings for your tickers or the next
  7 days; IPOs. Lockup expiries: no free source.
- **Fear strip** (F): VIX, SPY expected daily move (SPY × VIX / √252), SPY put/call, 2s10s and 3m10y curve, 10Y, oil (USO) and dollar
  (UUP) as live ETF proxies. Fear & Greed: CNN has no official free API, so it shows n/a.
- **Alpha Vantage budget (25/day):** movers hourly in session (~7), put/call every 2h (~4), earnings + IPO calendars twice a day,
  leaving room for the daily-candle fallback.

## Replay and daily recap (M6)

- **Replay** (journal → a trade → "Replay with ghost exit", or `/replay` for the last trade): plays the trade bar by bar on the finest
  candles that cover it (5m covers about the last 10 sessions on Twelve Data free; older trades use 1H, then daily), with your real
  fills, entry/stop/target lines, and a **ghost exit** where your exit rules would have taken you out: initial stop, target at N R,
  trailing stop (after +N R, trail by N R), time stop (N minutes), flat by the close. Shows the ghost result and the difference vs.
  your actual exit in R and dollars. Simulation starts the bar after entry; stop wins when stop and target share a candle; gaps fill
  at the open. Space plays, ←/→ step. Rules sync with your settings.
- **End-of-day recap**: generated automatically after the 4:00 PM ET close on days you traded: P&L, R, win rate, best and worst trade
  (click to replay), rules broken with their dollar cost, a process-first day grade (A–F: broken rules cost points even on green days),
  and one lesson tied to the costliest mistake. "Download image" exports a 1200×630 PNG. `/recap` shows today so far and past days.
- **Daily CSV backup**: the full journal (one row per trade, fills flattened) downloads automatically at the close (turn off with
  `/auto-backup`); the recap also offers the day's CSV or the full journal on demand.

## Market-clock mode (M7)

The layout switches itself by Eastern time (Pre-market 4:00, Open 9:30, Midday 11:00, Power hour last hour before the close,
After-hours & review from the close) with countdowns to the next phase and to the open or close. Each mode has its own saved
layout; a notice appears when it switches. The mode selector in the top strip (or `/mode-*`) overrides it.

- **Holidays and early closes:** the official NYSE 2026–2028 calendar is built in (`shared/marketCalendar.ts`). On early-close days
  (1:00 PM) power hour starts at noon, after-hours starts at 1:00 and ends at 5:00, countdowns, RVOL's volume curve and the daily
  recap all use the 1:00 close. Holidays show "Closed · <holiday>" and count down to the next trading day.
- **Status feed** (`/api/market-status`, polled every 10 min): Finnhub market status + holiday list, Alpha Vantage market status as
  the backup. Feed holidays/early closes are merged on top of the published calendar (never removing one), and a closure the feed
  reports outside the calendar (e.g. a national day of mourning) closes the day. Without `/api` the published calendar still applies.

## Home (H): blank and customizable

The desk opens on Home, which starts empty. Everything on it is saved in this browser.
- **Search bar** (ticker or company name, e.g. "tesla") drops in a **stock widget**: price, mini chart (5m or D) and its headlines.
- **+ Add widget**: stock, live news (all / macro / ★ starred), **options calculator** (Black-Scholes price, delta, gamma,
  theta/day, vega, breakeven, chance of finishing in the money, P/L-at-expiry graph; enter IV from your broker's chain since free
  data has no live IV), clock (ET, session countdown, London/Tokyo/Hong Kong/your time), notes, ★ starred, market movers
  (Alpha Vantage), calendar (economic events + earnings).
- **Move and size:** drag a widget by its title bar; drag the bottom-right corner to resize. Widgets snap to a 12-column grid
  and push each other out of the way, never overlapping.
- **Side bar:** the right-hand column is a small scrollable second screen. Send a widget there with ⇥ (or "→ side" in the add
  menu), reorder with ↑ ↓, change its height from the corner, and bring it back with ⇤.

## Messages (E)

A chat-style stream for the trading day (also a Home widget):
- **Earnings filed (live):** the SEC's latest-filings feed is checked every minute; any 8-K with Item 2.02 (Results of
  Operations) from your watchlist, starred or scanner tickers, or ~120 built-in large caps (`BIG_CAPS` in `shared/feed.ts`),
  shows up as "NVDA just filed its earnings results" with a link to the filing.
- **Earnings today and beat/miss (delayed):** Finnhub's free earnings calendar: estimates in the morning, actual EPS and revenue
  vs estimates once Finnhub records them.
- **Fed and White House:** official RSS feeds (Fed speeches, testimony, press releases; White House briefings and statements).
- **Economy:** today's scheduled releases (CPI, jobs, …) at their release time.
- **Live video:** when the White House, Federal Reserve or C-SPAN YouTube channel is live, a LIVE chip appears and the stream
  plays inside the page (official embeds; detection reads each channel's public /live page every 3 minutes).

## Stars, pings, company names (★)

- **Star any ticker** (☆ next to it in the watchlist, scanner, chart header, company page); click again to unstar. Starred tickers
  get their own **Starred** list at the top of the Scanner tab, with the last ping for each.
- **Pings** pop up bottom-right (and as a desktop notification if the tab is in the background):
  news headlines naming a starred ticker; earnings the day before, the day of, and when results post (Finnhub, delayed);
  moves past ±3% / 6% / 9%… (set the % in the Starred header); crossing yesterday's high/low or a forming pattern's trigger
  (same engine as the Patterns page, on daily bars fetched for starred tickers every 3 hours).
- **Company names** show next to tickers everywhere (Finnhub profiles, cached a week server-side and in the browser).
  Click a name, or press `O`, to open the company page.

## Company page (O)

What they do, main products (with revenue share when the report states it), and a **clickable supply chain**: suppliers →
company → customers, competitors and same-industry peers below. Click any box with a ticker to re-center on it; Back returns.
- Source: the company's latest 10-K (or 20-F/40-F) from SEC EDGAR (keyless; `SEC_USER_AGENT` carries your contact email as SEC
  asks). The business section, the start of MD&A and every sentence mentioning customers/suppliers are sent to **Gemini's free
  tier** (`GEMINI_API_KEY`, model `GEMINI_MODEL`, default `gemini-3.1-flash-lite`), which returns only what the report states.
  Names are matched to tickers with SEC's own ticker list. Each report is read once and cached ~30 days (CDN + memory), so a
  company costs one Gemini call per filing.
- Without a Gemini key the page still shows the profile, peers (Finnhub), the filing link and a Wikipedia summary.
- Limits: many companies don't name customers (e.g. "Customer A"); private and foreign-only suppliers show as gray boxes.

## News buttons and long timeframes

The chart has `5m 1H D W M Y` (keys 3 2 1 4 5 6). Each candle with news gets one clickable button: green = mostly good
headlines, red = mostly bad, gray = mixed (keyword sentiment). On D / W / M the button covers that day / week / month; Y shows
monthly candles with one button per year. Long timeframes pull the ticker's news history (Finnhub free, about the last year).

## Pattern lookup (X)

Type any ticker (or click a quick-pick) and the desk finds, draws and explains its patterns on daily or hourly bars. $0: no AI.
- **Candlestick signals** in the last 25 bars, judged against the trend going into them: hammer / hanging man, inverted hammer /
  shooting star, doji, bullish/bearish engulfing, morning/evening star, piercing line / dark cloud cover, three white soldiers /
  three black crows, harami, marubozu. Each says whether later bars confirmed or failed it. Arrows mark them on the chart.
- **Chart patterns** from swing points (3 bars each side) and least-squares trendlines: head and shoulders (and inverse), double
  top/bottom, ascending/descending/symmetrical triangles, bull flag and cup-and-handle (same rules as the scanner). Each is drawn on
  the chart with its neckline/trendlines, marked forming / confirmed / failed, with trigger, stop and textbook measured-move target.
- **Description:** a template-written summary (price, 20-bar change, position vs 20/50 averages, what was found) plus a paragraph per
  pattern. Click any item to frame it and show its trigger/stop/target lines.
- **Save image** downloads a PNG of the chart with the descriptions underneath (works on the deployed site; the artifact preview
  blocks downloads). Tested against real NVDA daily data (fixture in `tests/fixtures`).

## World map and money flow globe (M8)

**More map layers:** besides Market news and Weather, the map has **Conflicts**, **Shipping & oil**, **Lawsuits** and **Deals &
developments**. Each is a GDELT GEO query over the last 24 hours (keyless), so a dot is where news places the story, sized by
article count; click for headlines. Shipping & oil also draws the world's oil chokepoints (EIA) and, with a free
`AISSTREAM_API_KEY` from aisstream.io, the ships near each chokepoint: an 8-second AIS snapshot refreshed every 5 minutes, tankers
marked when their broadcast says so. Free data can't give a full live fleet map or exact court locations.

- **World map (`M`)**, two layers on one map (D3 Natural Earth projection, Natural Earth 110m borders via `world-atlas`):
  - **News:** GDELT GEO 2.0 hotspots for the last 24h of market news (keyless, 1 request / 5 s, cached 30 min). Two queries split
    by tone (tone < −2 and tone > 2) are merged per location: size = article count, green/red = net tone. Click a hotspot for its
    headlines and the tickers they affect (your watchlist names matched in the headlines, plus that country's ETF).
  - **Sentiment weather:** 12 regions, each scored 60% country ETF move today (±2% = ±1; Finnhub quotes) + 40% regional GDELT tone.
    Storm ≤ −0.5, rain ≤ −0.15, cloud, partly sunny, sun ≥ +0.5. Click a region for the numbers; "Chart" opens its ETF.
- **Money flow globe (`G`)** — a labeled **PROXY**, not fund-flow data. 11 sector SPDRs + TLT, GLD, UUP (Twelve Data daily, falls
  back to Alpha Vantage) and BTC/ETH (Binance public data mirror, CoinGecko fallback). flow = return vs SPY × dollar volume vs its
  20-day average (floored at 0.5×), for 1D / 5D / 20D. Arcs run from the 3 biggest outflows to the 3 biggest inflows with moving
  particles. Node positions carry no meaning. Drawn on canvas with d3-geo's orthographic projection (no WebGL library) so the
  overlay stays small and lazy-loaded; drag to rotate, click to chart.
- Both overlays load only when opened and only poll while open. The globe fills progressively when Twelve Data credits run out.

## Supabase (optional sync)

1. Create a free project, run `supabase/schema.sql` in the SQL editor.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel.
3. Click "Sync: sign in" in the status bar, use the magic link, then turn off new sign-ups in Supabase Auth settings.

Watchlist boards, playbooks, saved filters, the scan list, scan settings, account rules, and every journal trade, transfer and
check-in sync (newest write wins, per trade). Without Supabase they stay in the browser.

## Levels (SPY, QQQ and the selected ticker)

Prior-day high/low/close, session VWAP, opening range (5/15/30 min, default 15), each with distance in points and percent, drawn on the chart.
Alerts fire on a touch (within 0.02%) or a break of any level, checked on each quote poll, with a 5-minute cooldown per level. They show as a toast, a sound, a browser notification (if allowed) and in the alert log.
Premarket high/low are marked unavailable: Twelve Data includes extended-hours candles only on its paid Pro plan.

## Keyboard

| Key | Action |
|---|---|
| `Ctrl K` | Command bar: jump to a ticker or run `/gappers`, `/journal`, `/map`, `/layout-reset`, `/mode-*` … |
| `↑ ↓` / `J K` | Move through watchlist |
| `1 2 3` | Chart: daily, 1-hour, 5-minute |
| `L` | Hide/show levels panel |
| `P` | Playbook editor |
| `Q` | Trade ticket (quick journal) |
| `Shift J` | Journal page |
| `F` | Hide/show fear strip |
| `H E D X O S M G C` | Pages: Home, Messages, Desk, Patterns, Company, Scanner, World map, Money flow, Calendars |
| `1 2 3 4 5 6` | Chart: Daily, 1-hour, 5-min, Weekly, Monthly, Yearly news |
| `N Q R` | Desk right rail: News, Quick Journal, Risk |
| `[ ]` | Hide/show left or right rail |
| `B` | Hide/show news ticker |
| `A` | Account drawer |
| `T` | Terminal (dark) / paper (light) |
| `?` | Shortcuts |
| `Esc` | Close |

## Install it as an app (laptop)

The desk is an installable web app (manifest + a small service worker that caches only the app shell, never market data).
Open the deployed site, then **Chrome/Edge:** the install icon in the address bar (or ⋮ → Cast, save and share → Install page as app);
**Safari (macOS 14+):** File → Add to Dock. It opens in its own window with a dock icon and updates itself on each deploy.

## Layout

- **Top strip:** SPY, QQQ, VIX, 10Y, ET market clock with countdowns, mode selector, account strip (opens the account drawer).
- **Left rail:** watchlist sorted by RS rank, boards Setups / Watching / Avoid (drag between them).
- **Center:** chart (TradingView Lightweight Charts) with D / 1H / 5m.
- **Right rail:** News, Scanner, Quick Journal, Risk.
- **Bottom:** 24/7 news ticker with "My watchlist only".
- **Pop-out:** the ↗ on any panel opens it in its own window for a second monitor; the selected ticker stays in sync across windows.
- **Layouts per market-clock mode:** rail widths, visibility, active tab and timeframe save to whichever mode you're in (Pre-market, Open, Midday, Power hour, After-hours & review). The mode follows the ET clock, or set it manually.
- **Side menu (laptop, full or half screen):** one full-screen page per section: Desk `D`, Patterns `X`, Scanner `S` (scanner + chart), World map `M`,
  Money flow `G`, Calendars `C` (calendars + chart), Journal `Shift J`, plus the Account drawer `A`. The last page you used reopens.
- **Look:** dark terminal theme (amber accent, mono numbers) by default; `T` switches to a light "paper" theme.

## Structure

```
src/
  App.tsx              shell, pages, keyboard, layouts per mode, popout routing
  components/          TopStrip, Watchlist, Chart, RightRail, Bits (ticker, command bar, drawer, overlays), SideNav, WorldMap, MoneyGlobe
  data/live.ts         /api client, shared series store, polling, quote patching, demo fallback
  data/scan.ts         scan polling, demo scan, movers, universe
  data/cloud.ts        Supabase auth + sync (optional)
  data/news.ts         news + calendar polling and demo fallback
  lib/playbook.ts      playbooks, grading, filters
  lib/journal.ts       trades/fills math, stats, equity, guardrails, violations, tilt, time-of-day
  lib/csv.ts           broker CSV parsing, column detection, round trips, transfers
  lib/replay.ts        ghost-exit simulation (stop, target R, trail, time stop, EOD)
  lib/recap.ts         daily recap, day grade, lesson, journal CSV
  data/market.ts       market-status feed polling
  data/world.ts        world map + flows polling and demo fallback
  lib/idb.ts           IndexedDB store for the journal
  lib/indicators.ts    SMA, EMA, RSI, MACD, ATR, session VWAP
  lib/levels.ts        PDH/PDL/PDC, VWAP, opening range, touch/break detection
  lib/demo.ts          DEMO DATA generator (removed as adapters land)
  lib/layout.ts        per-mode layout defaults
  lib/store.ts         local persistence (moves to Supabase in M3/M4)
shared/                types, ET clock, provider parsers, scan engine, news + calendar logic, world hotspots/weather, flows (browser and /api)
api/                   Vercel functions: candles, quotes, macro, scan, movers, news, calendar, market-status, world, flows, health (+ _lib)
public/                manifest, icons, service worker (installable app)
supabase/schema.sql    table + row-level security
tests/                 vitest: parsers (incl. a real Alpha Vantage response), indicators, levels, clock, API
```

## Milestones

1. ✅ Shell: layout, themes, top strip, rails, command bar, saved layouts, demo data
2. ✅ Data layer and charts: adapters, caching, candles, indicators, levels on SPY/QQQ
3. ✅ Scanner, RS rank, watchlist boards, playbook editor and grades
4. ✅ Journal, pre-trade checklist, CSV import, account strip and drawer, risk guardrails
5. ✅ News ticker, chart news flags, calendars, fear strip
6. ✅ Trade replay with ghost exit, end-of-day recap
7. ✅ Market-clock mode (holiday / early-close feed)
8. ✅ World map (news + sentiment weather), money flow globe
9. Research panels
10. AI layer
