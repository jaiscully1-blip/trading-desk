import { describe, expect, it } from 'vitest';
import { rectOf, resizeFrom } from '../src/lib/grid';

const m = { colW: 60, row: 36, gap: 8 };
const w = { x: 4, y: 5, w: 4, h: 6 };

describe('resize from any edge', () => {
  it('follows the pointer and snaps to the nearest cell', () => {
    const r = resizeFrom(w, 'se', 100, 50, m);
    expect(r.live.width).toBe(rectOf(w, m).width + 100);
    expect(r.snap).toEqual({ x: 4, y: 5, w: 5, h: 7 }); // +100px = 1.47 cols -> 1, +50px = 1.14 rows -> 1
  });
  it('left and top edges keep the right / bottom edge fixed', () => {
    const r = resizeFrom(w, 'nw', -68, -44, m); // one column and one row bigger
    expect(r.snap).toEqual({ x: 3, y: 4, w: 5, h: 7 });
    expect(r.live.left + r.live.width).toBe(rectOf(w, m).left + rectOf(w, m).width);
  });
  it('never smaller than 2 x 3, never wider than one screen, never off the canvas', () => {
    expect(resizeFrom(w, 'e', -1000, 0, m).snap.w).toBe(2);
    expect(resizeFrom(w, 's', 0, -1000, m).snap.h).toBe(3);
    expect(resizeFrom(w, 'e', 5000, 0, m).snap.w).toBe(12);
    const r = resizeFrom(w, 'w', -2000, 0, m);
    expect(r.snap.x).toBe(0);
    expect(r.live.left).toBe(0);
  });
  it('an edge handle only changes its own direction', () => {
    expect(resizeFrom(w, 'n', 300, -88, m).snap).toEqual({ x: 4, y: 3, w: 4, h: 8 });
    expect(resizeFrom(w, 'e', 68, 300, m).snap).toEqual({ x: 4, y: 5, w: 5, h: 6 });
  });
});
