// Movement watch: neutral read on whether the tape is moving enough to pay for option time decay. No bullish / bearish.
// Big movement either way is good for long options; a quiet tape lets theta burn them. Both kinds of day are tracked.
//   priced-in move  = spot x implied vol / sqrt(252)        (one standard deviation, the desk's "SPY exp. move"; VIX-based)
//   ATM option value ~ 0.3989 x spot x vol x sqrt(time left in trading years)   (Black-Scholes at the money, no rates, no skew)
// So an at-the-money option's value shrinks with the square root of time left: slowly at first, fast near the close. Pure + tested.
export const SESSION_MIN = 390; // 9:30 to 4:00
const K_ATM = 0.3989422804014327; // 1 / sqrt(2 pi)
const E_ABS = 0.7978845608028654; // mean |z| for a normal: sqrt(2 / pi)

export type MoveTone = 'theta' | 'move' | 'mid';
export interface MovementIn { spot: number; iv: number; closes: number[]; minutesLeft: number | null; gamma: 'positive' | 'negative' | null }
export interface DecayRow { label: string; gonePct: number; goneUsd: number }
export interface MovementRead {
  label: string; tone: MoveTone;
  priced: { usd: number; pct: number };
  recent: { avgPct: number; avgUsd: number; ratio: number };
  chop: { n: number; of: number; normal: number };
  big: { n: number; of: number; normal: number };
  latest: { pct: number; x: number; kind: 'quiet' | 'normal' | 'big' } | null;
  atm0: number; // value of an ATM 0DTE option at the open, $ per contract
  decay0: DecayRow[]; decay1: DecayRow[];
  breakEven: { usd: number; pct: number; forNext: boolean };
  parts: string[];
}

/** share of an ATM option's open value left, with `left` minutes of today remaining and `extraDays` full trading days after today */
const left = (leftMin: number, extraDays: number) => Math.sqrt((extraDays + leftMin / SESSION_MIN) / (1 + extraDays));

export function movementRead(i: MovementIn): MovementRead | null {
  const { spot, iv, closes } = i;
  if (!(spot > 0) || !(iv > 0) || closes.length < 22) return null;
  const sd = iv / Math.sqrt(252);
  const moves: number[] = [];
  for (let k = 1; k < closes.length; k++) moves.push(Math.abs(closes[k] / closes[k - 1] - 1));
  const m60 = moves.slice(-60), m10 = moves.slice(-10);
  const avg10 = m10.reduce((a, b) => a + b, 0) / m10.length;
  const ratio = avg10 / (E_ABS * sd);
  const chop = m60.filter((m) => m < 0.5 * sd).length, big = m60.filter((m) => m >= 1.5 * sd).length;
  const lastMove = moves[moves.length - 1], x = lastMove / sd;
  const rowAt = (elapsed: number, extra: number, label: string): DecayRow => {
    const open = K_ATM * spot * sd * Math.sqrt(1 + extra), now = open * left(SESSION_MIN - elapsed, extra);
    return { label, gonePct: (1 - now / open) * 100, goneUsd: (open - now) * 100 };
  };
  const times: [number, string][] = [[90, '11:00'], [210, '1:00'], [330, '3:00'], [390, '4:00']];
  const L = i.minutesLeft != null && i.minutesLeft > 0 ? i.minutesLeft : SESSION_MIN;
  const be = K_ATM * spot * sd * Math.sqrt(L / SESSION_MIN);
  const quiet = ratio < 0.85, lively = ratio > 1.15;
  const label = lively ? 'Movement beating theta' : quiet ? (i.gamma === 'negative' ? 'Quiet but jumpy' : 'Quiet: theta risk') : 'Balanced: watch both';
  const tone: MoveTone = lively ? 'move' : quiet ? 'theta' : 'mid';
  const parts = [
    `Priced-in move ±${(spot * sd).toFixed(2)} (${(sd * 100).toFixed(2)}%), from VIX ${(iv * 100).toFixed(1)}`,
    `Last 10 sessions averaged ${(avg10 * 100).toFixed(2)}% a day, ${ratio.toFixed(2)}x what is priced in`,
    `Last ${m60.length} sessions: ${chop} chop days (under half the priced-in move), ${big} big days (1.5x or more)`,
    i.gamma ? `Dealer gamma ${i.gamma === 'negative' ? 'negative: moves tend to speed up' : 'positive: moves tend to be damped'}` : 'Gamma not available',
  ];
  return {
    label, tone, priced: { usd: spot * sd, pct: sd * 100 },
    recent: { avgPct: avg10 * 100, avgUsd: avg10 * spot, ratio },
    chop: { n: chop, of: m60.length, normal: Math.round(m60.length * 0.383) }, big: { n: big, of: m60.length, normal: Math.round(m60.length * 0.134) },
    latest: { pct: lastMove * 100, x, kind: x < 0.5 ? 'quiet' : x >= 1.5 ? 'big' : 'normal' },
    atm0: K_ATM * spot * sd * 100,
    decay0: times.map(([m, l]) => rowAt(m, 0, l)), decay1: times.map(([m, l]) => rowAt(m, 1, l)),
    breakEven: { usd: be, pct: (be / spot) * 100, forNext: !(i.minutesLeft != null && i.minutesLeft > 0) },
    parts,
  };
}
