// "Download my desk" / "Load a desk file": moves one account's desk (layout, watchlists, journal, alerts, notes, settings)
// between links (trading-desk-blot vs trading-desk-sooty), browsers, Chrome profiles or computers. Each of those keeps its
// own saved data, so this file is how a desk travels. The desk password is never written into the file.
import { currentAccount, storagePrefix } from './accounts';
import { idbAll, idbSet } from './idb';

export interface DeskFile { app: 'trade-desk'; v: 1; at: string; from: string; name: string; local: Record<string, string>; idb: Record<string, unknown> }

/** Account-system keys and secrets that never travel. */
const SKIP = /^(accounts|session|gateNext|verReload|deskKey|pinFails\..*|u\..*)$/;

function ownLocalKeys(): string[] {
  const p = storagePrefix(), out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? '';
      if (!k.startsWith(p)) continue;
      const rest = k.slice(p.length);
      if (!SKIP.test(rest)) out.push(rest);
    }
  } catch { /* storage blocked */ }
  return out;
}

export async function exportDesk(): Promise<DeskFile> {
  const p = storagePrefix(), local: Record<string, string> = {};
  for (const k of ownLocalKeys()) { const v = localStorage.getItem(p + k); if (v != null) local[k] = v; }
  return { app: 'trade-desk', v: 1, at: new Date().toISOString(), from: location.host, name: currentAccount()?.name ?? '', local, idb: await idbAll() };
}

export function downloadDesk(f: DeskFile) {
  const blob = new Blob([JSON.stringify(f)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `trade-desk-${(f.name || 'desk').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${f.at.slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function parseDeskFile(text: string): DeskFile {
  let j: any;
  try { j = JSON.parse(text); } catch { throw new Error("That isn't a desk file."); }
  if (j?.app !== 'trade-desk' || j?.v !== 1 || typeof j.local !== 'object' || !j.local) throw new Error("That isn't a desk file from Trade Desk.");
  for (const [k, v] of Object.entries(j.local)) if (typeof v !== 'string' || SKIP.test(k)) delete j.local[k];
  if (typeof j.idb !== 'object' || !j.idb) j.idb = {};
  return j as DeskFile;
}

/** Replace the signed-in account's desk with the file's (the account itself, its PIN and desk password stay). */
export async function importDesk(f: DeskFile) {
  const p = storagePrefix();
  for (const k of ownLocalKeys()) localStorage.removeItem(p + k);
  for (const [k, v] of Object.entries(f.local)) localStorage.setItem(p + k, v);
  for (const [k, v] of Object.entries(f.idb)) await idbSet(k, v);
}
