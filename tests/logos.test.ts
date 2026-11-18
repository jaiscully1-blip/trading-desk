import { describe, expect, it } from 'vitest';
import { knockout, lighten } from '../src/components/Logos';

describe('logo backdrop removal', () => {
  it('clears white touching the edge but keeps white inside the logo', () => {
    const w = 8, h = 8, px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) { px.set([255, 255, 255, 255], i * 4); }
    // a blue ring from (2,2) to (5,5) with a white center at (3..4,3..4)
    for (let y = 2; y <= 5; y++) for (let x = 2; x <= 5; x++) if (x === 2 || x === 5 || y === 2 || y === 5) px.set([0, 80, 200, 255], (y * w + x) * 4);
    expect(knockout(px, w, h)).toBe(true);
    expect(px[(0 * w + 0) * 4 + 3]).toBe(0);         // corner backdrop cleared
    expect(px[(2 * w + 2) * 4 + 3]).toBe(255);       // ring kept
    expect(px[(3 * w + 3) * 4 + 3]).toBe(255);       // white inside the ring kept
  });
  it('leaves logos without a white backdrop alone', () => {
    const px = new Uint8ClampedArray(16 * 4).fill(0);
    expect(knockout(px, 4, 4)).toBe(false);
  });
});

describe('dark logos', () => {
  it('lightens a dark logo shape but not a filled badge', () => {
    const shape = new Uint8ClampedArray(100 * 4); for (let i = 0; i < 20; i++) shape.set([10, 20, 60, 255], i * 4);
    expect(lighten(shape)).toBe(true); expect(shape[0]).toBe(226);
    const badge = new Uint8ClampedArray(100 * 4); for (let i = 0; i < 100; i++) badge.set([10, 20, 60, 255], i * 4);
    expect(lighten(badge)).toBe(false); expect(badge[0]).toBe(10);
  });
});
