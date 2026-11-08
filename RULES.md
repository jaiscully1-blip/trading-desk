# Trading desk rules

Two kinds of rules live here. **Build rules** are checked automatically by `scripts/rules-check.mjs`, which runs before every
build and test (`npm run rules` runs it alone). If a rule breaks, the build fails, so nothing that breaks one can deploy.
**Trading rules** show on the desk as the **My rules** widget (Home → widget library → Trading tools) and on the **Morning** page.

## Build rules

| # | Rule | How it is checked |
|---|------|-------------------|
| R0 | $0 to run: free tiers and open-source libraries only. The only paid cost allowed is Claude API tokens. | Review (new providers need a free-tier note in `api/_lib/core.ts`) |
| R1 | API keys never ship to the browser. Keys live only in Vercel / GitHub secrets, never in chat or code. | Automatic: no `process.env` / secret `import.meta.env` in `src/`, no key-looking literals anywhere |
| R2 | Every provider sits behind an adapter in `api/`, rate-limited and cached. The browser only calls `/api/...`. | Automatic: no direct third-party `fetch` from `src/` |
| R3 | Browser code never imports server code. | Automatic |
| R4 | Vercel Hobby allows 12 serverless functions. New endpoints are routes in `api/research.ts?fn=`. | Automatic: counts `api/*.ts` |
| R5 | Every provider has its free-tier limit recorded and enforced (`take()` in `api/_lib/core.ts`). Check the limit before building. | Automatic: every `Provider` has a `LIMITS` entry |
| R6 | No bot: the desk only sends an order Jai approved (Webull ticket: preview → order PIN → Confirm), within server-side caps. | Automatic: order calls only in `api/_lib/broker/`, all gates present, no orders on a timer |
| R7 | Never fake data. Sample data only behind a **DEMO DATA** badge; every panel labels its freshness (live / delayed / end of day). | Automatic for random numbers outside demo code; freshness by review |
| R8 | Ask when unsure what Jai meant; don't change things on a guess. No Artifact previews of the app; one deploy per change set. | Review |
| R9 | Clean UI: hide empty "n/a" text rather than showing it; note in the Trading Desk Guide how to bring it back. | Review |

## Trading rules (shown live in **My rules**)

These come from the account settings in the journal (account drawer). The widget shows a green check or red cross for each:

1. **Pre-session check-in** done before the first trade.
2. **Daily loss limit**: no new trades after realized losses reach the max daily loss % (locks for the day).
3. **Heat**: open risk across all trades stays under the max heat %.
4. **Cooldown**: after the set number of losses in a row, wait the cooldown minutes.
5. **No rule breaks today**: oversized positions, widened stops, trading while locked or in cooldown, trades with no plan,
   failed checklist items and over-heat entries are listed by the journal with what they cost.

Below the lights is a **Before the open** checklist of Jai's own rules. It resets every trading day and can be edited
(add, remove, reset to defaults). Default list:

- Pre-session check-in done before the first trade
- Every trade has a playbook, entry, stop and target before I buy
- Size from the risk % — never bigger
- No new trades after the daily loss limit or during a cooldown
- The stop never moves further away
- Log every trade in the journal the same day

Nothing on the desk blocks a trade at the broker; the rules keep the limits in view and the journal prices every break.

## Bot policy (pending, not built yet)

**Current decision (Jai, Nov 8, 2026): no trading bot. Webull is connected with an approve-every-order ticket.**
The desk suggests trades; an order is sent to Webull only when Jai previews it, types the order PIN and presses Confirm.
Server-side gates on every order: desk password · `WEBULL_ORDERS=on` kill switch · order PIN · the order must match its
preview (3-minute confirmation) · stocks/ETFs only · no shorting (a sell can't exceed shares held) · per-order $ cap
(`WEBULL_MAX_ORDER_USD`, default $1,000) and share cap · daily order cap (`WEBULL_MAX_ORDERS_DAY`, default 10) · limit
and stop orders only unless `WEBULL_ALLOW_MARKET=on`. Every preview, order, cancel and refusal is logged in the Vercel
function logs (`audit: webull-order`). Options and futures orders are not supported from the desk.
A bot comes later only if Jai asks for one, with the limits below.

Jai's decision (Nov 7, 2026): an **on/off switch** on the desk that lets an AI bot trade **a limited amount of money**;
when it's off, the desk is manual (ideas and watchlist only, as today). Before any code places an order:

- **No live bot trading on Webull** (Jai, Nov 7, 2026). Webull stays read-only on the desk.
- Broker and starting mode to be chosen by Jai (Alpaca paper trading is free and comes first; real money only after he says so).
- Hard limits enforced on the server, not the browser: total capital cap, per-trade cap, daily loss cap, allowed symbols,
  regular market hours only, limit orders only, no shorting, no margin, no options.
- A kill switch that stops the bot and cancels its open orders, and an audit log of every decision and order.
- Order code lives only in `api/_lib/bot/` (build rule R6 enforces this).
