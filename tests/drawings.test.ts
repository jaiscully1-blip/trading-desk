import { describe, expect, it } from 'vitest';
import { FIB_LEVELS, NEEDS, fibPrice, geom, type Pt, type Shape } from '../shared/drawings';

const pt = (x: number, p: number): Pt => ({ t: x, d: 0, p });
const px = (q: Pt) => ({ x: q.t, y: 200 - q.p });
const sh = (kind: Shape['kind'], pts: Pt[], text?: string): Shape => ({ id: 'a', kind, pts, ink: 'accent', text });

describe('chart drawings', () => {
  it('fib retracement: 0 on the end of the move, 1 on the start', () => {
    expect(fibPrice(100, 150, 0)).toBe(150);
    expect(fibPrice(100, 150, 1)).toBe(100);
    expect(fibPrice(100, 150, 0.5)).toBe(125);
    expect(fibPrice(150, 100, 0.618)).toBeCloseTo(130.9);
  });
  it('fib draws a line and a label per level', () => {
    const g = geom(sh('fib', [pt(10, 100), pt(60, 150)]), px, 500);
    expect(g.filter((x) => x.k === 'line')).toHaveLength(FIB_LEVELS.length + 1); // + the faint diagonal
    expect(g.filter((x) => x.k === 'text').map((x) => (x as { text: string }).text)).toContain('0.618 · 119.10');
  });
  it('ray runs from the point to the right edge, level with the point', () => {
    const [l] = geom(sh('ray', [pt(30, 120)]), px, 500);
    expect(l).toMatchObject({ k: 'line', x1: 30, y1: 80, x2: 500, y2: 80 });
  });
  it('trend, rect, triangle, free and text give the expected primitives', () => {
    expect(geom(sh('trend', [pt(0, 0), pt(10, 10)]), px, 500)[0]).toMatchObject({ k: 'line', x2: 10, y2: 190 });
    expect(geom(sh('rect', [pt(50, 10), pt(20, 40)]), px, 500)[0]).toMatchObject({ k: 'rect', x: 20, w: 30, h: 30 });
    expect(geom(sh('tri', [pt(0, 0), pt(10, 5), pt(20, 0)]), px, 500)[0]).toMatchObject({ k: 'poly', closed: true, fill: true });
    expect(geom(sh('free', [pt(0, 0), pt(1, 1), pt(2, 0)]), px, 500)[0]).toMatchObject({ k: 'poly', closed: false });
    expect(geom(sh('text', [pt(5, 5)], 'gap fill'), px, 500)[0]).toMatchObject({ k: 'text', text: 'gap fill' });
    expect(geom(sh('text', [pt(5, 5)]), px, 500)).toEqual([]);
    expect(NEEDS.tri).toBe(3);
  });
  it('draws nothing when a point is off the chart', () => {
    expect(geom(sh('trend', [pt(0, 0), pt(10, 10)]), (q) => (q.t === 10 ? null : { x: 1, y: 1 }), 500)).toEqual([]);
  });
});
