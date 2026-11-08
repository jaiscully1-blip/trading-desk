// Which scanner symbols are worth asking the server for. The scan fills at about 5 tickers a minute on the free Twelve Data
// tier, so the browser keeps the last results and only asks for what it is missing; while the market is closed and the saved
// copy was taken after the last close, nothing changes and no credits are spent. Pure + tested.
export interface ScanNeedInput {
  universe: string[];
  /** symbols already saved in this browser */
  have: string[];
  /** when the saved copy was taken (ms), or null if there is none */
  savedAt: number | null;
  now: number;
  /** the market is closed (overnight, weekend, holiday) */
  closed: boolean;
  /** ms timestamp of the most recent regular-session close */
  lastCloseMs: number;
}

export function scanNeeds(i: ScanNeedInput): string[] {
  const have = new Set(i.have);
  const missing = i.universe.filter((s) => !have.has(s));
  // closed market + saved copy taken after the last close: daily bars cannot have changed, ask only for symbols never fetched
  if (i.closed && i.savedAt != null && i.savedAt >= i.lastCloseMs) return missing;
  return i.universe;
}
