# Trading Desk

Personal trading desk for swing momentum names and intraday SPY/QQQ. Dense, keyboard-first, Bloomberg-style.
It never places trades: it shows information and enforces your own rules.

**Status: Milestone 6 (trade replay with ghost exit, end-of-day recap).** With API keys set, quotes, candles, VIX/10Y,
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

## Supabase (optional sync)

1. Create a free project, run `supabase/schema.sql` in the SQL editor.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel.
3. Click "Sync: sign in" in the status bar, use the magic link, then turn off new sign-ups in Supabase Auth settings.

Watchlist boards, playbooks, saved filters, the scan list, scan settings, account rules, and every journal trade, transfer and
check-in sync (newest write wins, per trade). Without Supabase they stay in the browser.

## Levels (SPY, QQQ and the selected ticker)

Prior-day high/low/close, session VWAP, opening range (5/15/30 min, default 15), each with distance in points and percent, drawn on the chart.
Alerts fire on a touch (within 0.02%) or a break of any level, checked on each quote poll, with a 5-minute cooldown per level. They show as a toast, a sound, a browser notification (if allowed) and in the mobile Alerts tab.
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
| `Shift J` | Full journal |
| `C` | Calendars tab |
| `F` | Hide/show fear strip |
| `N S Q R` | Right rail: News, Scanner, Quick Journal, Risk |
| `[ ]` | Hide/show left or right rail |
| `B` | Hide/show news ticker |
| `A` | Account drawer |
| `M` / `G` | World map / money flow globe overlay (Milestone 8) |
| `T` | Light/dark |
| `?` | Shortcuts |
| `Esc` | Close |

## Layout

- **Top strip:** SPY, QQQ, VIX, 10Y, ET market clock with countdowns, mode selector, account strip (opens the account drawer).
- **Left rail:** watchlist sorted by RS rank, boards Setups / Watching / Avoid (drag between them).
- **Center:** chart (TradingView Lightweight Charts) with D / 1H / 5m.
- **Right rail:** News, Scanner, Quick Journal, Risk.
- **Bottom:** 24/7 news ticker with "My watchlist only".
- **Pop-out:** the ↗ on any panel opens it in its own window for a second monitor; the selected ticker stays in sync across windows.
- **Layouts per market-clock mode:** rail widths, visibility, active tab and timeframe save to whichever mode you're in (Pre-market, Open, Midday, Power hour, After-hours & review). The mode follows the ET clock, or set it manually.
- **Mobile (≤760px):** watchlist, alerts and quick journal only.

## Structure

```
src/
  App.tsx              shell, keyboard, layouts per mode, popout + mobile routing
  components/          TopStrip, Watchlist, Chart, RightRail, Bits (ticker, command bar, drawer, overlays)
  data/live.ts         /api client, shared series store, polling, quote patching, demo fallback
  data/scan.ts         scan polling, demo scan, movers, universe
  data/cloud.ts        Supabase auth + sync (optional)
  data/news.ts         news + calendar polling and demo fallback
  lib/playbook.ts      playbooks, grading, filters
  lib/journal.ts       trades/fills math, stats, equity, guardrails, violations, tilt, time-of-day
  lib/csv.ts           broker CSV parsing, column detection, round trips, transfers
  lib/replay.ts        ghost-exit simulation (stop, target R, trail, time stop, EOD)
  lib/recap.ts         daily recap, day grade, lesson, journal CSV
  lib/idb.ts           IndexedDB store for the journal
  lib/indicators.ts    SMA, EMA, RSI, MACD, ATR, session VWAP
  lib/levels.ts        PDH/PDL/PDC, VWAP, opening range, touch/break detection
  lib/demo.ts          DEMO DATA generator (removed as adapters land)
  lib/layout.ts        per-mode layout defaults
  lib/store.ts         local persistence (moves to Supabase in M3/M4)
shared/                types, ET clock, provider parsers, scan engine, news + calendar logic (browser and /api)
api/                   Vercel functions: candles, quotes, macro, scan, movers, news, calendar, health (+ _lib adapters, cache, limits)
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
7. Market-clock mode (holiday / early-close feed)
8. World map, money flow globe
9. Research panels
10. AI layer
