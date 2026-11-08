// Trading-day timeline for the Morning page: sessions by Eastern-time minute of day, and where "now" and today's events fall.
export const DAY_START = 4 * 60, DAY_END = 20 * 60;
export interface Phase { id: string; label: string; from: number; to: number; focus?: boolean }
export const PHASES: Phase[] = [
  { id: 'pre', label: 'Premarket', from: 4 * 60, to: 9 * 60 + 30 },
  { id: 'open', label: 'Open to 11:00', from: 9 * 60 + 30, to: 11 * 60, focus: true },
  { id: 'mid', label: 'Midday', from: 11 * 60, to: 15 * 60 },
  { id: 'power', label: 'Power hour', from: 15 * 60, to: 16 * 60 },
  { id: 'after', label: 'After hours', from: 16 * 60, to: 20 * 60 },
];
/** "08:30" -> minutes since midnight (null if it isn't a clock time) */
export const clockMin = (t: string): number | null => { const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim()); return m ? +m[1] * 60 + +m[2] : null; };
/** 0..1 across the 4:00-20:00 strip, clamped */
export const frac = (min: number) => Math.max(0, Math.min(1, (min - DAY_START) / (DAY_END - DAY_START)));
export const phaseAt = (min: number): Phase | null => PHASES.find((p) => min >= p.from && min < p.to) ?? null;
