// "Conveyor belt" ordering for filter chips: only the first few show; a new or picked one jumps to the front and the
// others shift down one place (the last visible one rolls off into "More"). Pure + tested.

/** Merge a saved order with the ids that exist now: unknown ids (newly added) go to the front, gone ids drop out. */
export function beltOrder(stored: string[], ids: string[]): string[] {
  const have = new Set(ids);
  const kept = stored.filter((id, i) => have.has(id) && stored.indexOf(id) === i);
  const fresh = ids.filter((id) => !kept.includes(id));
  return stored.length ? [...fresh.reverse(), ...kept] : ids; // first run keeps the natural order
}

/** Move one id to the front; everything that was ahead of it shifts back one place. */
export function toFront(order: string[], id: string): string[] {
  return order.includes(id) ? [id, ...order.filter((x) => x !== id)] : order;
}

export function splitBelt<T extends { id: string }>(items: T[], order: string[], size: number): { shown: T[]; more: T[] } {
  const byId = new Map(items.map((i) => [i.id, i]));
  const sorted = order.map((id) => byId.get(id)).filter((x): x is T => !!x);
  return { shown: sorted.slice(0, size), more: sorted.slice(size) };
}
