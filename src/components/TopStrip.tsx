import type { Freshness, MacroResult, Mode, Quote } from '../types';
import { MarketChips } from './MarketPulse';
import type { ClockState } from '../lib/clock';
import type { AccountSettings, Guard } from '../lib/journal';
import { sUsd, tone, usd } from '../lib/format';
import { Fresh, Q } from './common';
import type { MovementRead } from '../../shared/movement';
import { MovementBadge } from './Movement';
import { WorldClock } from './WorldClock';

export function TopStrip({
  quotes,
  clk,
  onSelect,
  onAccount,
  accountOpen,
  theme,
  onTheme,
  account,
  quoteFresh,
  quoteAsOf,
  quoteSource,
  movement,
  vol,
  moveStats,
  onWorld,
  live,
  onCmd,
}: {
  account: { guard: Guard; settings: AccountSettings; demo: boolean; demoPrices: boolean };
  marketSource?: string;
  quoteFresh: Freshness;
  quoteAsOf?: number;
  quoteSource?: string;
  macro: MacroResult | null;
  live: boolean;
  quotes: Record<string, Quote>;
  clk: ClockState;
  mode?: Mode;
  override?: Mode | null;
  onOverride?: (m: Mode | null) => void;
  onSelect: (s: string) => void;
  onAccount: () => void;
  accountOpen: boolean;
  theme: string;
  onTheme: () => void;
  onCmd?: () => void;
  movement?: MovementRead | null;
  vol?: import('../../shared/volatility').VolRead | null;
  moveStats?: import('../../shared/movementStats').MoveStats | null;
  onWorld?: () => void;
}) {
  const dayPnl = account.guard.todayRealized + account.guard.todayUnrealized;
  return (
    <header className="top top3">
      {/* zone 1: markets */}
      <div className="top-zone tz-markets">
        <MarketChips live={live} quotes={quotes} onSelect={onSelect} />
        <span className="tz-status"><Fresh kind={quoteFresh} at={quoteAsOf} src={quoteSource} />{movement && <MovementBadge m={movement} vol={vol} stats={moveStats} />}</span>
      </div>
      {/* zone 2: search */}
      <button className="top-search" onClick={onCmd} title="Search tickers, companies, pages and commands (/ or Cmd K)">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M11 11m-6 0a6 6 0 1 0 12 0 6 6 0 1 0-12 0 M20 20l-4-4" /></svg>
        <span>Search tickers, pages, commands</span><kbd>/</kbd>
      </button>

      {(clk.holiday || clk.earlyClose) && (
        <div className="top-group">
          {clk.holiday && <span className="pill bad" title="Market closed">Closed · {clk.holiday}</span>}
          {clk.earlyClose && <span className="pill warn" title={clk.earlyClose}>Early close {clk.closeSod === 13 * 3600 ? '1 PM' : ''}</span>}
        </div>
      )}

      {/* zone 3: you */}
      <div className="top-group right tz-you">
        <WorldClock nyClosed={!!clk.holiday} onOpen={onWorld ?? (() => {})} />
        <button className={`acct ${accountOpen ? 'on' : ''}`} onClick={onAccount} title="Account drawer (A)" data-key="A">
          {account.settings.startBalance == null ? (
            <span className="muted">Set starting balance →</span>
          ) : (
            <>
              <Q k={account.demo ? 'demo' : 'mine'} src="your starting balance, journal trades and transfers; open trades at current quotes" />
              <span><span className="tick-l">EQ</span> <span className="num">{usd(account.guard.equity)}</span></span>
              <span><span className="tick-l">DAY</span> <span className={`num ${tone(dayPnl)}`}>{sUsd(dayPnl)}</span></span>
              <span><span className="tick-l">R</span> <span className={`num ${tone(account.guard.rToday)}`}>{account.guard.rToday >= 0 ? '+' : ''}{account.guard.rToday.toFixed(1)}R</span></span>
              <span><span className="tick-l">RISK</span> <span className="num">{account.guard.riskUsedPct.toFixed(1)}/{account.settings.maxDailyLossPct.toFixed(1)}%</span></span>
            </>
          )}
          <span className={`pill ${account.guard.lockout === 'Clear' ? 'ok' : 'bad'}`} title={account.guard.reason ?? undefined}>{account.guard.lockout}</span>
          {(account.demo || account.demoPrices) && <span title={account.demo ? 'Includes sample trades' : 'Open positions priced with demo quotes'}><Fresh kind="demo" /></span>}
        </button>
        <button className="icon-btn" onClick={onTheme} title="Toggle theme (T)" aria-label="Toggle theme" data-key="T">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
    </header>
  );
}
