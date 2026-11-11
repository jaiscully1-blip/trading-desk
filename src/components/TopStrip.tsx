import type { Freshness, MacroResult, Mode, Quote } from '../types';
import type { ClockState } from '../lib/clock';
import type { AccountSettings, Guard } from '../lib/journal';
import { pct, px, sUsd, tone, usd } from '../lib/format';
import { Fresh, FlashNum, Q } from './common';
import type { MovementRead } from '../../shared/movement';
import { MovementBadge } from './Movement';

function Tick({ label, value, raw, chg, chgFmt, onClick, minor }: { label: string; value: string; raw?: number; chg: number; chgFmt: string; onClick?: () => void; minor?: boolean }) {
  return (
    <button className="tick" onClick={onClick} disabled={!onClick}>
      <span className="tick-l">{label}</span>
      <FlashNum v={raw}>{value}</FlashNum>
      <span className={`num ${tone(chg)} ${minor ? 'wide-only' : ''}`}>{chgFmt}</span>
    </button>
  );
}

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
}) {
  const dayPnl = account.guard.todayRealized + account.guard.todayUnrealized;
  const spy = quotes.SPY, qqq = quotes.QQQ;
  return (
    <header className="top">
      <div className="top-group">
        <Tick label="SPY" raw={spy.last} value={px(spy.last)} chg={spy.chgPct} chgFmt={pct(spy.chgPct)} onClick={() => onSelect('SPY')} />
        <Tick label="QQQ" raw={qqq.last} value={px(qqq.last)} chg={qqq.chgPct} chgFmt={pct(qqq.chgPct)} onClick={() => onSelect('QQQ')} />
        <Fresh kind={quoteFresh} at={quoteAsOf} src={quoteSource} />
        {movement && <MovementBadge m={movement} vol={vol} stats={moveStats} />}
      </div>

      {(clk.holiday || clk.earlyClose) && (
        <div className="top-group">
          {clk.holiday && <span className="pill bad" title="Market closed">Closed · {clk.holiday}</span>}
          {clk.earlyClose && <span className="pill warn" title={clk.earlyClose}>Early close {clk.closeSod === 13 * 3600 ? '1 PM' : ''}</span>}
        </div>
      )}

      <div className="top-group right">
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
