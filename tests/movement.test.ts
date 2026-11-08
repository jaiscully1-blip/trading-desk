import { describe, expect, it } from 'vitest';
import { movementRead } from '../shared/movement';

// closes that move by a fixed % a day, alternating up and down
const closes = (pct: number, n = 70) => { const out = [100]; for (let k = 1; k < n; k++) out.push(out[k - 1] * (1 + (k % 2 ? pct : -pct))); return out; };
const base = { spot: 100, iv: 0.2, minutesLeft: 390, gamma: null as 'positive' | 'negative' | null };

describe('movement watch', () => {
  it('needs enough history and a real implied vol', () => {
    expect(movementRead({ ...base, closes: closes(0.01, 10) })).toBeNull();
    expect(movementRead({ ...base, iv: 0, closes: closes(0.01) })).toBeNull();
  });
  it('priced-in move is spot x iv / sqrt(252)', () => {
    const r = movementRead({ ...base, closes: closes(0.01) })!;
    expect(r.priced.usd).toBeCloseTo(100 * 0.2 / Math.sqrt(252), 6);
  });
  it('a tape moving far less than priced in reads as theta risk, with every day a chop day', () => {
    const r = movementRead({ ...base, closes: closes(0.001) })!;
    expect(r.tone).toBe('theta');
    expect(r.chop.n).toBe(r.chop.of);
    expect(r.big.n).toBe(0);
  });
  it('a tape moving far more than priced in reads as movement beating theta, with big days', () => {
    const r = movementRead({ ...base, closes: closes(0.03) })!;
    expect(r.tone).toBe('move');
    expect(r.big.n).toBe(r.big.of);
    expect(r.latest!.kind).toBe('big');
  });
  it('0DTE ATM decay follows the square root of time left: slow early, fast late', () => {
    const r = movementRead({ ...base, closes: closes(0.01) })!;
    const g = r.decay0.map((d) => d.gonePct);
    expect(g[0]).toBeCloseTo((1 - Math.sqrt(300 / 390)) * 100, 4); // by 11:00
    expect(g[1]).toBeCloseTo((1 - Math.sqrt(180 / 390)) * 100, 4); // by 1:00
    expect(g[2]).toBeGreaterThan(g[1]);
    expect(g[3]).toBeCloseTo(100, 0); // gone at the close
    expect(r.decay1[3].gonePct).toBeCloseTo((1 - Math.sqrt(0.5)) * 100, 1); // 1DTE keeps half its variance overnight
  });
  it('break-even shrinks as the day goes and uses the next session when closed', () => {
    const open = movementRead({ ...base, closes: closes(0.01) })!.breakEven;
    const late = movementRead({ ...base, minutesLeft: 60, closes: closes(0.01) })!.breakEven;
    const closed = movementRead({ ...base, minutesLeft: null, closes: closes(0.01) })!.breakEven;
    expect(late.usd).toBeLessThan(open.usd);
    expect(closed.forNext).toBe(true);
    expect(closed.usd).toBeCloseTo(open.usd, 6);
  });
});
