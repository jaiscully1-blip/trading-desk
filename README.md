# Trading Desk

Personal trading desk for swing momentum names and intraday SPY/QQQ. Dense, keyboard-first, Bloomberg-style.
It never places trades: it shows information and enforces your own rules.

**Status: Milestone 1 (shell).** Every number on screen is generated sample data behind a `DEMO DATA` badge.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # typecheck + production build to dist/
npm run build:single # one self-contained HTML file in dist-single/ (used for hosted previews)
```

Deploy: import the repo in Vercel (framework preset: Vite). Serverless functions for keyed calls go in `/api` from Milestone 2.

## Environment variables

Milestone 1 needs none. See `.env.example` for the full list and which milestone uses each.
Keyed provider calls go through `/api` serverless functions, so API keys never reach the browser.
Never prefix a secret with `VITE_` (Vite ships those to the client).

| Variable | Used from | Where |
|---|---|---|
| `FINNHUB_API_KEY` | M2 | server |
| `TWELVEDATA_API_KEY` | M2 | server |
| `ALPHAVANTAGE_API_KEY` | M2 | server |
| `FRED_API_KEY` | M5 | server |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | M3 | server |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | M3 | browser (public, RLS required) |
| `ANTHROPIC_API_KEY` | M10 | server |

## Keyboard

| Key | Action |
|---|---|
| `Ctrl K` | Command bar: jump to a ticker or run `/gappers`, `/journal`, `/map`, `/layout-reset`, `/mode-*` … |
| `↑ ↓` / `J K` | Move through watchlist |
| `1 2 3` | Chart: daily, 1-hour, 5-minute |
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
  lib/clock.ts         ET market clock, phases, DST-correct countdowns
  lib/demo.ts          DEMO DATA generator (removed as adapters land)
  lib/layout.ts        per-mode layout defaults
  lib/store.ts         local persistence (moves to Supabase in M3/M4)
```

## Milestones

1. ✅ Shell: layout, themes, top strip, rails, command bar, saved layouts, demo data
2. Data layer and charts: adapters, caching, candles, indicators, levels on SPY/QQQ
3. Scanner, RS rank, watchlist boards, playbook editor and grades
4. Journal, pre-trade checklist, CSV import, account strip and drawer, risk guardrails
5. News ticker, chart news flags, calendars, fear strip
6. Trade replay with ghost exit, end-of-day recap
7. Market-clock mode (holiday / early-close feed)
8. World map, money flow globe
9. Research panels
10. AI layer
