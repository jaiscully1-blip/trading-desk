import type { Mode, Quote } from '../types';
import { MODES, hms, etTime, type ClockState } from '../lib/clock';
import { DEMO_ACCOUNT, DEMO_MACRO, DEMO_AT } from '../lib/demo';
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
}: {
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
  const a = DEMO_ACCOUNT;
  const spy = quotes.SPY, qqq = quotes.QQQ;
  const nextOrClose = clk.toClose != null ? `Close in ${hms(clk.toClose)}` : `Open in ${hms(clk.toOpen ?? 0)}`;
  return (
    <header className="top">
      <div className="top-group">
        <span className="brand wide-only">DESK</span>
        <Tick label="SPY" value={px(spy.last)} chg={spy.chgPct} chgFmt={pct(spy.chgPct)} onClick={() => onSelect('SPY')} />
        <Tick label="QQQ" value={px(qqq.last)} chg={qqq.chgPct} chgFmt={pct(qqq.chgPct)} onClick={() => onSelect('QQQ')} />
        <Tick label="VIX" value={DEMO_MACRO.vix.toFixed(2)} chg={DEMO_MACRO.vixChg} chgFmt={pct(DEMO_MACRO.vixChg, 1)} minor />
        <Tick label="10Y" value={`${DEMO_MACRO.tnx.toFixed(3)}%`} chg={DEMO_MACRO.tnxChg} chgFmt={`${DEMO_MACRO.tnxChg >= 0 ? '+' : ''}${(DEMO_MACRO.tnxChg * 100).toFixed(1)}bp`} minor />
        <Fresh kind="demo" src={`Sample quotes and account, generated ${etTime(DEMO_AT)} ET. Real data from Milestones 2 and 4.`} />
      </div>

      <div className="top-group clock" title="Holidays and early closes are applied when the market-status feed lands (Milestone 7).">
        <span className="num clock-time">{etTime(clk.now, true)} ET</span>
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
        <button className={`acct ${accountOpen ? 'on' : ''}`} onClick={onAccount} title="Account drawer (A)">
          <span><span className="tick-l">EQ</span> <span className="num">{usd(a.equity)}</span></span>
          <span><span className="tick-l">DAY</span> <span className={`num ${tone(a.todayPnl)}`}>{sUsd(a.todayPnl)}</span></span>
          <span><span className="tick-l">R</span> <span className={`num ${tone(a.rToday)}`}>{a.rToday >= 0 ? '+' : ''}{a.rToday.toFixed(1)}R</span></span>
          <span><span className="tick-l">RISK</span> <span className="num">{a.riskUsedPct.toFixed(1)}/{a.maxDailyLossPct.toFixed(1)}%</span></span>
          <span className={`pill ${a.lockout === 'Clear' ? 'ok' : 'bad'}`}>{a.lockout}</span>
        </button>
        <button className="icon-btn" onClick={onTheme} title="Toggle theme (T)" aria-label="Toggle theme">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <button className="cmd-btn" onClick={onCmd}>
          <span className="muted cmd-txt">Search</span> <Kbd>Ctrl K</Kbd>
        </button>
      </div>
    </header>
  );
}
