// Which chart tools make sense right now. Uses the NYSE market clock (holidays and 1:00 PM early closes included).
//   day tools  (VWAP, opening range ORH/ORL, premarket levels, session bands): regular trading hours only
//   ORH / ORL  : only once the opening range is complete (9:45 AM ET for the 15-minute range) on a trading day
//   long-term  : everything else (after hours, overnight, weekends, holidays) shows longer-term technical tools instead
import { clock } from './clock.js';

export interface ToolHours {
  /** regular session is open (9:30 AM to the close, 1:00 PM on early-close days) */
  regular: boolean;
  /** the opening range has completed, so ORH / ORL exist */
  orReady: boolean;
  phase: 'day' | 'long';
}

const OPEN_SOD = 9.5 * 3600;

export function toolHours(now: number = Date.now(), orMinutes = 15): ToolHours {
  const c = clock(now);
  const regular = c.session === 'Regular session';
  return { regular, orReady: regular && c.et.sod >= OPEN_SOD + orMinutes * 60, phase: regular ? 'day' : 'long' };
}

/** Intraday-only level ids; everything else (prior-day range) is long-term and always allowed. */
export const DAY_LEVEL_IDS: ReadonlySet<string> = new Set(['vwap', 'orh', 'orl', 'pmh', 'pml']);

/** Drop the levels that don't apply right now. */
export function levelsForHours<T extends { id: string }>(levels: T[], h: ToolHours): T[] {
  return levels.filter((l) => {
    if (!DAY_LEVEL_IDS.has(l.id)) return true;
    if (!h.regular) return false;
    if (l.id === 'orh' || l.id === 'orl') return h.orReady;
    return true;
  });
}
