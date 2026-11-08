// Chart drawings for the Patterns page: trendline, horizontal ray, Fibonacci retracement, rectangle, triangle, text, free draw.
// Points are stored as { t: time of the nearest bar, d: bar offset from it, p: price } so they follow the chart when it is
// zoomed or scrolled and still work past the last bar. `geom` turns a shape into pixel primitives; the SVG overlay and the
// saved PNG both paint from the same primitives. Pure + tested.
export type Tool = 'cursor' | 'trend' | 'ray' | 'fib' | 'rect' | 'tri' | 'text' | 'free';
export type Ink = 'accent' | 'up' | 'down' | 'text' | 'demo';
export interface Pt { t: number; d: number; p: number }
export interface Shape { id: string; kind: Exclude<Tool, 'cursor'>; pts: Pt[]; ink: Ink; text?: string }

/** points needed before a shape is complete (free draw takes as many as the drag collects) */
export const NEEDS: Record<Exclude<Tool, 'cursor'>, number> = { trend: 2, ray: 1, fib: 2, rect: 2, tri: 3, text: 1, free: 2 };
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

export type Prim =
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; dash?: boolean; faint?: boolean }
  | { k: 'rect'; x: number; y: number; w: number; h: number }
  | { k: 'poly'; pts: [number, number][]; closed: boolean; fill?: boolean }
  | { k: 'text'; x: number; y: number; text: string; right?: boolean };

export type Px = (p: Pt) => { x: number; y: number } | null;

/** price at a Fibonacci level: 0 sits on the second point, 1 on the first (retracement of the move p1 → p2) */
export const fibPrice = (p1: number, p2: number, lvl: number) => p2 - (p2 - p1) * lvl;

export function geom(s: Shape, px: Px, width: number, fmt: (n: number) => string = (n) => n.toFixed(2)): Prim[] {
  const q = s.pts.map(px);
  if (q.some((x) => !x)) return [];
  const a = q[0]!, b = q[1];
  switch (s.kind) {
    case 'trend': return b ? [{ k: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y }] : [];
    case 'ray': return [{ k: 'line', x1: a.x, y1: a.y, x2: width, y2: a.y }, { k: 'text', x: width - 4, y: a.y - 4, text: fmt(s.pts[0].p), right: true }];
    case 'rect': return b ? [{ k: 'rect', x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }] : [];
    case 'tri': return q.length >= 2 ? [{ k: 'poly', pts: q.map((x) => [x!.x, x!.y] as [number, number]), closed: q.length === 3, fill: q.length === 3 }] : [];
    case 'free': return q.length >= 2 ? [{ k: 'poly', pts: q.map((x) => [x!.x, x!.y] as [number, number]), closed: false }] : [];
    case 'text': return s.text ? [{ k: 'text', x: a.x, y: a.y, text: s.text }] : [];
    case 'fib': {
      if (!b) return [];
      const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x);
      const out: Prim[] = [{ k: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, dash: true, faint: true }];
      for (const l of FIB_LEVELS) {
        const price = fibPrice(s.pts[0].p, s.pts[1].p, l);
        const y = px({ ...s.pts[1], p: price })?.y;
        if (y == null) continue;
        out.push({ k: 'line', x1, y1: y, x2, y2: y, faint: l === 0 || l === 1 });
        out.push({ k: 'text', x: x2 + 4, y: y + 3.5, text: `${l} · ${fmt(price)}` });
      }
      return out;
    }
  }
}

export const uid = () => Math.random().toString(36).slice(2, 9);
