import { describe, expect, it } from 'vitest';
import { checkAlerts, describeAlert, distance, hit, type PriceAlert } from '../shared/alertrules';

const a = (p: Partial<PriceAlert>): PriceAlert => ({ id: 'x', sym: 'NVDA', kind: 'above', value: 180, active: true, created: 0, ...p });

describe('price alerts', () => {
  it('conditions', () => {
    expect(hit(a({}), { last: 180, chgPct: 0 })).toBe(true);
    expect(hit(a({}), { last: 179.99, chgPct: 0 })).toBe(false);
    expect(hit(a({ kind: 'below', value: 150 }), { last: 149, chgPct: 0 })).toBe(true);
    expect(hit(a({ kind: 'chgUp', value: 3 }), { last: 1, chgPct: 3.2 })).toBe(true);
    expect(hit(a({ kind: 'chgDown', value: 3 }), { last: 1, chgPct: -3.1 })).toBe(true);
    expect(hit(a({ kind: 'chgDown', value: 3 }), { last: 1, chgPct: 3.1 })).toBe(false);
    expect(hit(a({ kind: 'rvol', value: 2 }), { last: 1, chgPct: 0, rvol: NaN })).toBe(false);
    expect(hit(a({}), undefined)).toBe(false);
  });
  it('one-time alerts switch off; repeating ones re-arm only after the condition clears', () => {
    const armed = new Set<string>();
    const once = checkAlerts([a({})], { NVDA: { last: 181, chgPct: 0 } }, armed, 5);
    expect(once.fired).toHaveLength(1);
    expect(once.next[0]).toMatchObject({ active: false, firedAt: 5, firedPx: 181 });

    const rep = [a({ id: 'r', repeat: true })];
    const armed2 = new Set<string>(['r']);
    let r = checkAlerts(rep, { NVDA: { last: 181, chgPct: 0 } }, armed2, 1);
    expect(r.fired).toHaveLength(1);
    r = checkAlerts(r.next, { NVDA: { last: 182, chgPct: 0 } }, armed2, 2); // still above: no second ring
    expect(r.fired).toHaveLength(0);
    r = checkAlerts(r.next, { NVDA: { last: 175, chgPct: 0 } }, armed2, 3); // dipped below: re-armed
    r = checkAlerts(r.next, { NVDA: { last: 181, chgPct: 0 } }, armed2, 4);
    expect(r.fired).toHaveLength(1);
    expect(r.next[0].active).toBe(true);
  });
  it('words', () => {
    expect(describeAlert(a({}))).toBe('NVDA price at or above $180');
    expect(describeAlert(a({ kind: 'chgUp', value: 3 }))).toBe('NVDA up on the day by 3%');
    expect(distance(a({}), { last: 170, chgPct: 0 })).toBe('$10.00 away (5.9%)');
    expect(distance(a({}), { last: 185, chgPct: 0 })).toBe('met');
  });
});
