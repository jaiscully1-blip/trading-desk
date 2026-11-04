# Trading Desk

Personal trading desk for swing momentum names and intraday SPY/QQQ. Dense, keyboard-first, Bloomberg-style.
It never places trades: it shows information and enforces your own rules.

**Status: Milestone 3 (scanner, RS rank, watchlist boards, playbooks).** With API keys set, quotes, candles, VIX/10Y,
SPY/QQQ levels, the scanner and RS rank are real. Without keys (or in the static preview) everything falls back to
generated sample data behind a `DEMO DATA` badge. News, account and journal stay DEMO until their milestones.

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

## Supabase (optional sync)

1. Create a free project, run `supabase/schema.sql` in the SQL editor.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel.
3. Click "Sync: sign in" in the status bar, use the magic link, then turn off new sign-ups in Supabase Auth settings.

Watchlist boards, playbooks, saved filters, the scan list and scan settings sync (newest write wins). Without Supabase they stay in the browser.

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
  lib/playbook.ts      playbooks, grading, filters
  lib/indicators.ts    SMA, EMA, RSI, MACD, ATR, session VWAP
  lib/levels.ts        PDH/PDL/PDC, VWAP, opening range, touch/break detection
  lib/demo.ts          DEMO DATA generator (removed as adapters land)
  lib/layout.ts        per-mode layout defaults
  lib/store.ts         local persistence (moves to Supabase in M3/M4)
shared/                types, ET clock and provider parsers used by both browser and /api
api/                   Vercel functions: candles, quotes, macro, scan, movers, health (+ _lib adapters, cache, limits)
supabase/schema.sql    table + row-level security
tests/                 vitest: parsers (incl. a real Alpha Vantage response), indicators, levels, clock, API
```

## Milestones

1. ✅ Shell: layout, themes, top strip, rails, command bar, saved layouts, demo data
2. ✅ Data layer and charts: adapters, caching, candles, indicators, levels on SPY/QQQ
3. ✅ Scanner, RS rank, watchlist boards, playbook editor and grades
4. Journal, pre-trade checklist, CSV import, account strip and drawer, risk guardrails
5. News ticker, chart news flags, calendars, fear strip
6. Trade replay with ghost exit, end-of-day recap
7. Market-clock mode (holiday / early-close feed)
8. World map, money flow globe
9. Research panels
10. AI layer
