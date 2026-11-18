import { describe, expect, it } from 'vitest';
import { DIAGRAMS, DIAGRAM_FOR } from '../shared/diagrams';
import { STRATS } from '../shared/lessons';

describe('teaching diagrams', () => {
  it('every strategy has a diagram and every mapping exists', () => {
    for (const s of STRATS) expect(DIAGRAMS[DIAGRAM_FOR[s.id] ?? s.id], s.id).toBeTruthy();
    for (const v of Object.values(DIAGRAM_FOR)) expect(DIAGRAMS[v], v).toBeTruthy();
  });
  it('candles are well formed and the FVG diagram really has a gap', () => {
    for (const d of Object.values(DIAGRAMS)) for (const c of d.candles) { expect(c.h).toBeGreaterThanOrEqual(Math.max(c.o, c.c)); expect(c.l).toBeLessThanOrEqual(Math.min(c.o, c.c)); }
    const f = DIAGRAMS.fvg.candles;
    expect(f[0].h).toBeLessThan(f[2].l);
  });
});
