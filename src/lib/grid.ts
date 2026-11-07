// Home page layout engine: a big canvas of columns (one screen = 12 columns, the canvas is 4 screens wide and grows down).
// Widgets stay where you put them; whatever a moved or resized widget lands on gets pushed down. Pure + tested.
export type WidgetType = 'stock' | 'messages' | 'bets' | 'claims' | 'spotify' | 'x' | 'crypto' | 'commodities' | 'risk' | 'sessions' | 'browser' | 'news' | 'options' | 'clock' | 'notes' | 'starred' | 'movers' | 'calendar' | 'webull' | 'discord' | 'congress' | 'insider' | 'polymarket' | 'sim' | 'agents' | 'backtest';
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
  notes: { w: 3, h: 6, side: 6 }, starred: { w: 3, h: 7, side: 7 }, movers: { w: 3, h: 8, side: 8 }, calendar: { w: 4, h: 8, side: 8 }, webull: { w: 5, h: 11, side: 12 }, discord: { w: 5, h: 12, side: 12 }, congress: { w: 5, h: 11, side: 12 }, insider: { w: 6, h: 11, side: 12 }, polymarket: { w: 4, h: 12, side: 12 }, sim: { w: 5, h: 13, side: 13 }, agents: { w: 5, h: 12, side: 12 }, backtest: { w: 6, h: 15, side: 14 },
};
