// Key intraday levels for any ticker, from daily + 5-minute bars.
import type { Bar, OrMinutes } from '../types';

export type LevelId = 'pdh' | 'pdl' | 'pdc' | 'pmh' | 'pml' | 'vwap' | 'orh' | 'orl';

export interface Level {
  id: LevelId;
  label: string;
  value: number | null;
  /** why value is null */
  status?: 'unavailable' | 'forming' | 'no-data';
}

export const LEVEL_LABEL: Record<LevelId, string> = {
  pdh: 'Prior-day high',
  pdl: 'Prior-day low',
  pdc: 'Prior-day close',
  pmh: 'Premarket high',
  pml: 'Premarket low',
  vwap: 'VWAP',
  orh: 'Opening-range high',
  orl: 'Opening-range low',
};
export const LEVEL_SHORT: Record<LevelId, string> = { pdh: 'PDH', pdl: 'PDL', pdc: 'PDC', pmh: 'PMH', pml: 'PML', vwap: 'VWAP', orh: 'ORH', orl: 'ORL' };

const OPEN_MIN = 570; // 9:30
const CLOSE_MIN = 960; // 16:00
const minOfDay = (t: number) => Math.floor((t % 86400) / 60);
const dayOf = (t: number) => Math.floor(t / 86400);

export interface LevelInput {
  daily: Bar[];
  intraday: Bar[]; // 5-minute, regular hours (extended hours not on free tier)
  /** ET date (days since epoch) of the session to compute; defaults to the last intraday bar's date */
  sessionDay?: number;
  orMinutes: OrMinutes;
  /** true when premarket bars exist; false on free tier */
  hasExtendedHours?: boolean;
  /** encoded ET "now", to know whether the opening range has completed */
  nowEnc?: number;
}

export function computeLevels(inp: LevelInput): Level[] {
  const { daily, intraday, orMinutes } = inp;
  const sessionDay = inp.sessionDay ?? (intraday.length ? dayOf(intraday[intraday.length - 1].time) : undefined);

  // Prior day = last daily bar strictly before the session date
  const prior = sessionDay == null ? daily[daily.length - 2] : [...daily].reverse().find((b) => dayOf(b.time) < sessionDay);

  const today = sessionDay == null ? [] : intraday.filter((b) => dayOf(b.time) === sessionDay);
  const rth = today.filter((b) => minOfDay(b.time) >= OPEN_MIN && minOfDay(b.time) < CLOSE_MIN);
  const pm = today.filter((b) => minOfDay(b.time) >= 240 && minOfDay(b.time) < OPEN_MIN);

  // VWAP
  let pv = 0, vol = 0;
  for (const b of rth) { pv += ((b.high + b.low + b.close) / 3) * b.volume; vol += b.volume; }
  const vwap = vol > 0 ? pv / vol : null;

  // Opening range: bars starting in [9:30, 9:30+N)
  const orBars = rth.filter((b) => minOfDay(b.time) < OPEN_MIN + orMinutes);
  const orEndEnc = sessionDay != null ? sessionDay * 86400 + (OPEN_MIN + orMinutes) * 60 : 0;
  const lastBarEnd = rth.length ? rth[rth.length - 1].time + 300 : 0;
  const orDone = orBars.length > 0 && (lastBarEnd >= orEndEnc || (inp.nowEnc ?? 0) >= orEndEnc);
  const orh = orDone ? Math.max(...orBars.map((b) => b.high)) : null;
  const orl = orDone ? Math.min(...orBars.map((b) => b.low)) : null;

  const pmStatus: Level['status'] = inp.hasExtendedHours ? (pm.length ? undefined : 'no-data') : 'unavailable';
  const L = (id: LevelId, value: number | null, status?: Level['status']): Level => ({ id, label: LEVEL_LABEL[id], value, status: value == null ? status ?? 'no-data' : undefined });

  return [
    L('pdh', prior?.high ?? null),
    L('pdl', prior?.low ?? null),
    L('pdc', prior?.close ?? null),
    L('pmh', inp.hasExtendedHours && pm.length ? Math.max(...pm.map((b) => b.high)) : null, pmStatus),
    L('pml', inp.hasExtendedHours && pm.length ? Math.min(...pm.map((b) => b.low)) : null, pmStatus),
    L('vwap', vwap, rth.length ? undefined : 'forming'),
    L('orh', orh, 'forming'),
    L('orl', orl, 'forming'),
  ];
}

export interface LevelEvent {
  sym: string;
  id: LevelId;
  kind: 'touch' | 'break';
  dir: 'up' | 'down';
  level: number;
  price: number;
}

/** Touch = price comes within `tol` of a level it was away from. Break = price crosses to the other side. */
export function detectLevelEvents(sym: string, prev: number, cur: number, levels: Level[], tolPct = 0.02): LevelEvent[] {
  const out: LevelEvent[] = [];
  for (const l of levels) {
    if (l.value == null) continue;
    const tol = (l.value * tolPct) / 100;
    const dir = cur >= prev ? 'up' : 'down';
    if ((prev - l.value) * (cur - l.value) < 0 && Math.abs(cur - l.value) > tol) {
      out.push({ sym, id: l.id, kind: 'break', dir, level: l.value, price: cur });
    } else if (Math.abs(cur - l.value) <= tol && Math.abs(prev - l.value) > tol) {
      out.push({ sym, id: l.id, kind: 'touch', dir, level: l.value, price: cur });
    }
  }
  return out;
}
