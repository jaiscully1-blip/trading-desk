import { describe, expect, it } from 'vitest';
import { alertTime } from '../src/lib/eventAlerts';

const et = (ms: number) => new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
describe('calendar alert times', () => {
  it('rings 10 minutes before the event', () => {
    expect(et(alertTime('2026-11-20', 'before open'))).toBe('09:20');
    expect(et(alertTime('2026-11-20', 'after close'))).toBe('15:50');
    expect(et(alertTime('2026-11-20', '8:30'))).toBe('08:20');
    expect(et(alertTime('2026-12-09', '2:00 pm'))).toBe('13:50');
  });
});
