import { describe, expect, it } from 'vitest';
import { onDay, type Reminder } from '../src/lib/noteReminders';
import { noteTickers } from '../src/components/NoteTools';

const r = (repeat: Reminder['repeat'], date = '2026-11-23'): Reminder => ({ id: 'x', text: 't', date, time: '09:15', repeat, active: true, created: 0 });

describe('note reminders', () => {
  it('one-time reminders fall on their date only', () => {
    expect(onDay(r('once'), '2026-11-23')).toBe(true);
    expect(onDay(r('once'), '2026-11-24')).toBe(false);
  });
  it('routine reminders repeat from their start date', () => {
    expect(onDay(r('weekdays'), '2026-11-28')).toBe(false); // Saturday
    expect(onDay(r('weekdays'), '2026-11-30')).toBe(true);
    expect(onDay(r('weekly'), '2026-11-30')).toBe(true);   // next Monday
    expect(onDay(r('weekly'), '2026-12-01')).toBe(false);
    expect(onDay(r('monthly'), '2026-12-23')).toBe(true);
    expect(onDay(r('daily'), '2026-11-22')).toBe(false);   // before the start
  });
  it('finds $tickers in a note', () => {
    expect(noteTickers({ id: '1', title: '', sym: 'SPY', html: '<p>cyber security next $pltr</p><p>and $NVDA, $brk.b</p>', created: 0 })).toEqual(['SPY', 'PLTR', 'NVDA', 'BRK.B']);
  });
});
