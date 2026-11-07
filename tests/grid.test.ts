import { describe, expect, it } from 'vitest';
import { addTop, settle, type Widget } from '../src/lib/grid';

const w = (id: string, x: number, y: number, ww = 4, h = 4): Widget => ({ id, type: 'clock', x, y, w: ww, h, cfg: {} });
const noOverlap = (ws: Widget[]) => ws.every((a) => ws.every((b) => a === b || a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y));

describe('home grid', () => {
  it('widgets stay where you put them on the canvas (no gravity)', () => {
    const r = settle([w('a', 30, 10)]);
    expect(r[0]).toMatchObject({ x: 30, y: 10 });
  });
  it('a dropped widget keeps its spot and pushes the other down', () => {
    const r = settle([w('a', 0, 0), w('b', 2, 1)], 'b');
    const a = r.find((x) => x.id === 'a')!, b = r.find((x) => x.id === 'b')!;
    expect(b).toMatchObject({ x: 2, y: 1 });
    expect(a.y).toBe(5);
    expect(noOverlap(r)).toBe(true);
  });
  it('side-by-side widgets stay side by side', () => {
    const r = settle([w('a', 0, 0), w('b', 4, 0), w('c', 8, 3)]);
    expect(r.map((x) => [x.id, x.y])).toEqual([['a', 0], ['b', 0], ['c', 3]]);
  });
  it('clamps to the canvas width', () => {
    const r = settle([w('a', 46, 0, 6)]);
    expect(r[0].x + r[0].w).toBe(48);
  });
  it('adds new widgets in the screen you are looking at', () => {
    const r = addTop([], w('a', 0, 0), 24, 10);
    expect(r[0]).toMatchObject({ x: 24, y: 10 });
  });
  it('new widgets fill across, then down, without overlaps', () => {
    let ws: Widget[] = [];
    for (let i = 0; i < 4; i++) ws = addTop(ws, w(`n${i}`, 0, 0, 4, 4));
    expect(ws.map((x) => [x.id, x.x, x.y])).toEqual([['n0', 0, 0], ['n1', 4, 0], ['n2', 8, 0], ['n3', 0, 4]]);
    for (let i = 4; i < 9; i++) ws = addTop(ws, w(`n${i}`, 0, 0, 3 + (i % 3), 3 + i));
    expect(noOverlap(ws)).toBe(true);
  });
  it('pinned widgets never move; others flow around them', () => {
    const r = settle([{ ...w('p', 0, 0), pinned: true }, w('a', 2, 1)], 'a');
    expect(r.find((x) => x.id === 'p')).toMatchObject({ x: 0, y: 0 });
    expect(r.find((x) => x.id === 'a')!.y).toBe(4);
    expect(noOverlap(r)).toBe(true);
  });
});
