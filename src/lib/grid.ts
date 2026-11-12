// Home page layout engine: a big canvas of columns (one screen = 12 columns, the canvas is 4 screens wide and grows down).
// Widgets stay where you put them; whatever a moved or resized widget lands on gets pushed down. Pure + tested.
export type WidgetType = 'stock' | 'messages' | 'bets' | 'claims' | 'spotify' | 'x' | 'crypto' | 'commodities' | 'risk' | 'sessions' | 'browser' | 'news' | 'options' | 'clock' | 'notes' | 'starred' | 'movers' | 'calendar' | 'webull' | 'discord' | 'congress' | 'insider' | 'polymarket' | 'sim' | 'agents' | 'backtest' | 'rules' | 'macro' | 'earnipo' | 'kronos' | 'distress' | 'daycases'
  | 'macroclock' | 'tape' | 'housing' | 'hisi' | 'world' | 'halts' | 'idxmovers' | 'optactive' | 'rates' | 'perps' | 'analysis' | 'trending' | 'fund' | 'alerts';
export interface Widget { id: string; type: WidgetType; x: number; y: number; w: number; h: number; cfg: Record<string, any>; pinned?: boolean }
export const COLS = 12;
/** canvas width in columns: 4 screens side by side */
export const CANVAS_COLS = 48;

const hit = (a: Widget, b: Widget) => a.id !== b.id && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Pinned widgets never move. Keep `fixedId` where it is (unless it lands on a pinned one); push anything overlapping
 *  it (and so on) down, then float everything up. */
export function settle(ws: Widget[], fixedId?: string): Widget[] {
  const out = ws.map((w) => ({ ...w, x: Math.max(0, Math.min(CANVAS_COLS - Math.min(w.w, COLS), w.x)), w: Math.min(w.w, COLS), y: Math.max(0, w.y) }));
  const pinned = out.filter((w) => w.pinned);
  const fixed = out.find((w) => w.id === fixedId && !w.pinned);
  // place in order: pinned, then the one being dragged, then by y (top to bottom), x
  const order = [...pinned, ...(fixed ? [fixed] : []), ...out.filter((w) => w !== fixed && !w.pinned).sort((a, b) => a.y - b.y || a.x - b.x)];
  const placed: Widget[] = [];
  for (const w of order) {
    if (w.pinned) { placed.push(w); continue; }
    if (w === fixed) { while (placed.some((p) => hit({ ...w }, p))) w.y++; }
    else {
      // free canvas: stay put unless something now sits on top of you, then move down past it
      let y = w.y;
      while (placed.some((p) => hit({ ...w, y }, p))) y++;
      w.y = y;
    }
    placed.push(w);
  }
  return placed.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** New widgets take the first free spot in the screen you're looking at (from column x0, row y0), filling across before down. */
export function addTop(ws: Widget[], w: Widget, x0 = 0, y0 = 0): Widget[] {
  const ww = Math.min(w.w, COLS);
  for (let y = y0; ; y++) {
    for (let x = x0; x + ww <= x0 + COLS; x++) {
      const c = { ...w, w: ww, x, y };
      if (!ws.some((o) => hit(c, o))) return settle([...ws, c], c.id);
    }
  }
}

export const DEFAULT_SIZE: Record<WidgetType, { w: number; h: number; side: number }> = {
  stock: { w: 4, h: 8, side: 8 }, messages: { w: 4, h: 11, side: 11 }, crypto: { w: 4, h: 9, side: 9 }, commodities: { w: 4, h: 8, side: 8 },
  risk: { w: 4, h: 11, side: 12 }, bets: { w: 7, h: 11, side: 12 }, claims: { w: 5, h: 12, side: 12 }, spotify: { w: 4, h: 9, side: 9 }, x: { w: 4, h: 12, side: 12 }, sessions: { w: 4, h: 7, side: 8 }, browser: { w: 6, h: 13, side: 12 }, news: { w: 4, h: 9, side: 9 }, options: { w: 4, h: 11, side: 12 }, clock: { w: 3, h: 5, side: 5 },
  notes: { w: 3, h: 6, side: 6 }, starred: { w: 3, h: 7, side: 7 }, movers: { w: 3, h: 8, side: 8 }, calendar: { w: 4, h: 8, side: 8 }, webull: { w: 5, h: 11, side: 12 }, discord: { w: 5, h: 12, side: 12 }, congress: { w: 5, h: 11, side: 12 }, insider: { w: 6, h: 11, side: 12 }, polymarket: { w: 4, h: 12, side: 12 }, sim: { w: 5, h: 13, side: 13 }, agents: { w: 5, h: 12, side: 12 }, backtest: { w: 6, h: 15, side: 14 }, rules: { w: 4, h: 11, side: 12 }, macro: { w: 5, h: 9, side: 10 }, earnipo: { w: 6, h: 12, side: 12 }, kronos: { w: 5, h: 13, side: 13 }, distress: { w: 5, h: 12, side: 12 }, daycases: { w: 5, h: 14, side: 14 },
  macroclock: { w: 6, h: 4, side: 5 }, tape: { w: 4, h: 12, side: 12 }, housing: { w: 5, h: 8, side: 8 }, hisi: { w: 5, h: 12, side: 12 },
  world: { w: 4, h: 12, side: 12 }, halts: { w: 5, h: 10, side: 10 }, idxmovers: { w: 5, h: 11, side: 11 }, optactive: { w: 6, h: 12, side: 12 },
  rates: { w: 5, h: 13, side: 13 }, perps: { w: 5, h: 12, side: 12 }, analysis: { w: 6, h: 12, side: 12 }, trending: { w: 4, h: 12, side: 12 }, fund: { w: 7, h: 11, side: 11 }, alerts: { w: 5, h: 10, side: 10 },
};

export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export interface Metrics { colW: number; row: number; gap: number }
export interface Rect { left: number; top: number; width: number; height: number }

/** Pixel box of a widget on the canvas. */
export const rectOf = (w: Pick<Widget, 'x' | 'y' | 'w' | 'h'>, m: Metrics): Rect =>
  ({ left: w.x * (m.colW + m.gap), top: w.y * (m.row + m.gap), width: w.w * m.colW + (w.w - 1) * m.gap, height: w.h * m.row + (w.h - 1) * m.gap });

/**
 * Resize from any edge or corner. Returns the box that follows the pointer pixel for pixel (`live`) and the grid cells it
 * snaps to on release (`snap`). The opposite edge stays put; size never drops below 2 columns x 3 rows or past one screen wide.
 */
export function resizeFrom(start: Pick<Widget, 'x' | 'y' | 'w' | 'h'>, edge: Edge, dx: number, dy: number, m: Metrics): { live: Rect; snap: { x: number; y: number; w: number; h: number } } {
  const r0 = rectOf(start, m), cw = m.colW + m.gap, rh = m.row + m.gap;
  const minW = 2 * m.colW + m.gap, minH = 3 * m.row + 2 * m.gap, maxW = COLS * m.colW + (COLS - 1) * m.gap;
  let { left, top, width, height } = r0;
  if (edge.includes('e')) width = r0.width + dx;
  if (edge.includes('w')) width = r0.width - dx;
  if (edge.includes('s')) height = r0.height + dy;
  if (edge.includes('n')) height = r0.height - dy;
  width = Math.max(minW, Math.min(maxW, width));
  height = Math.max(minH, height);
  if (edge.includes('w')) { left = r0.left + r0.width - width; if (left < 0) { width += left; left = 0; } }
  if (edge.includes('n')) { top = r0.top + r0.height - height; if (top < 0) { height += top; top = 0; } }
  if (left + width > CANVAS_COLS * cw - m.gap) width = CANVAS_COLS * cw - m.gap - left;
  const w = Math.max(2, Math.min(COLS, Math.round((width + m.gap) / cw)));
  const h = Math.max(3, Math.round((height + m.gap) / rh));
  const x = edge.includes('w') ? Math.max(0, start.x + start.w - w) : start.x;
  const y = edge.includes('n') ? Math.max(0, start.y + start.h - h) : start.y;
  return { live: { left, top, width, height }, snap: { x, y, w: Math.min(w, CANVAS_COLS - x), h } };
}
