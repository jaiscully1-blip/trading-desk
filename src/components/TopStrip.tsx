import type { Freshness, MacroResult, Mode, Quote } from '../types';
import { MODES, hms, etTime, type ClockState } from '../lib/clock';
import { DEMO_MACRO } from '../lib/demo';
import type { AccountSettings, Guard } from '../lib/journal';
import { pct, px, sUsd, tone, usd } from '../lib/format';
import { Fresh, Kbd } from './common';

function Tick({ label, value, chg, chgFmt, onClick, minor }: { label: string; value: string; chg: number; chgFmt: string; onClick?: () => void; minor?: boolean }) {
  return (
    <button className="tick" onClick={onClick} disabled={!onClick}>
      <span className="tick-l">{label}</span>
      <span className="num">{value}</span>
      <span className={`num ${tone(chg)} ${minor ? 'wide-only' : ''}`}>{chgFmt}</span>
    </button>
  );
}

const SHORT: Record<Mode, string> = { pre: 'Pre-mkt', open: 'Open', midday: 'Midday', power: 'Power hr', after: 'After-hrs' };

export function TopStrip({
  quotes,
  clk,
  mode,
  override,
  onOverride,
  onSelect,
  onAccount,
  accountOpen,
  theme,
  onTheme,
  onCmd,
  account,
  marketSource,
  quoteFresh,
  quoteAsOf,
  quoteSource,
  macro,
  live,
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
  mode: Mode;
  override: Mode | null;
  onOverride: (m: Mode | null) => void;
  onSelect: (s: string) => void;
  onAccount: () => void;
  accountOpen: boolean;
  theme: string;
  onTheme: () => void;
  onCmd: () => void;
}) {
  const dayPnl = account.guard.todayRealized + account.guard.todayUnrealized;
  const vixChg = macro?.vix?.prev ? ((macro.vix.value - macro.vix.prev) / macro.vix.prev) * 100 : NaN;
  const tnxChg = macro?.tnx?.prev != null ? macro.tnx.value - macro.tnx.prev : NaN;
  const spy = quotes.SPY, qqq = quotes.QQQ;
  const nextOrClose = clk.toClose != null ? `Close in ${hms(clk.toClose)}` : `Open in ${hms(clk.toOpen ?? 0)}`;
  return (
    <header className="top">
      <div className="top-group">
        <span className="brand wide-only">DESK</span>
        <Tick label="SPY" value={px(spy.last)} chg={spy.chgPct} chgFmt={pct(spy.chgPct)} onClick={() => onSelect('SPY')} />
        <Tick label="QQQ" value={px(qqq.last)} chg={qqq.chgPct} chgFmt={pct(qqq.chgPct)} onClick={() => onSelect('QQQ')} />
        <Fresh kind={quoteFresh} at={quoteAsOf} src={quoteSource} />
        {live ? (
          <>
            <Tick label="VIX" value={macro?.vix ? macro.vix.value.toFixed(2) : '—'} chg={vixChg} chgFmt={pct(vixChg, 1)} minor />
            <Tick label="10Y" value={macro?.tnx ? `${macro.tnx.value.toFixed(2)}%` : '—'} chg={tnxChg} chgFmt={Number.isFinite(tnxChg) ? `${tnxChg >= 0 ? '+' : ''}${(tnxChg * 100).toFixed(0)}bp` : '—'} minor />
            <span title={macro ? `FRED close for ${macro.vix?.date ?? macro.tnx?.date}` : 'Set FRED_API_KEY for VIX and 10Y'}>
              <Fresh kind={macro ? 'eod' : 'unavailable'} src={macro?.source} />
            </span>
          </>
        ) : (
          <>
            <Tick label="VIX" value={DEMO_MACRO.vix.toFixed(2)} chg={DEMO_MACRO.vixChg} chgFmt={pct(DEMO_MACRO.vixChg, 1)} minor />
            <Tick label="10Y" value={`${DEMO_MACRO.tnx.toFixed(3)}%`} chg={DEMO_MACRO.tnxChg} chgFmt={`${DEMO_MACRO.tnxChg >= 0 ? '+' : ''}${(DEMO_MACRO.tnxChg * 100).toFixed(1)}bp`} minor />
          </>
        )}
      </div>

      <div className="top-group clock" title={`NYSE holidays and early closes: published 2026-2028 calendar${marketSource ? ` + live status from ${marketSource}` : ''}`}>
        <span className="num clock-time">{etTime(clk.now, true)} ET</span>
        {clk.holiday && <span className="pill bad" title="Market closed">Closed · {clk.holiday}</span>}
        {clk.earlyClose && <span className="pill warn" title={clk.earlyClose}>Early close {clk.closeSod === 13 * 3600 ? '1 PM' : ''}</span>}
        <span className={`sess wide-only sess-${clk.session === 'Regular session' ? 'on' : 'off'}`}>{clk.session}</span>
        <select
          className="mode-sel"
          value={override ?? 'auto'}
          onChange={(e) => onOverride(e.target.value === 'auto' ? null : (e.target.value as Mode))}
          aria-label="Market-clock mode"
        >
          <option value="auto">Auto · {SHORT[clk.mode]}</option>
          {MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} (manual)
            </option>
          ))}
        </select>
        {override && <span className="pill warn" title="Manual override; layout won't follow the clock">Manual · {SHORT[mode]}</span>}
        <span className="muted num small wide-only" title={`${clk.nextLabel} in ${hms(clk.toNext)}`}>
          → {clk.nextLabel} {hms(clk.toNext)}
        </span>
        <span className="num small" title={`${clk.session}. Next phase: ${clk.nextLabel} in ${hms(clk.toNext)}`}>{nextOrClose}</span>
      </div>

      <div className="top-group right">
        <button className={`acct ${accountOpen ? 'on' : ''}`} onClick={onAccount} title="Account drawer (A)" data-key="A">
          {account.settings.startBalance == null ? (
            <span className="muted">Set starting balance →</span>
          ) : (
            <>
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
        <button className="cmd-btn" onClick={onCmd}>
          <span className="muted cmd-txt">Search</span> <Kbd>Ctrl K</Kbd>
        </button>
      </div>
    </header>
  );
}
