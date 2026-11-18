// Live, free "customer voice" feeds for Quant Lab, mapped to tickers: Steam player reviews (game publishers),
// CFPB consumer complaints (banks, card issuers, credit bureaus), NHTSA vehicle recalls (carmakers, RV and truck
// makers) and openFDA recalls (food, drug and device makers). Ids and names were checked against each API.
// Pure helpers (tested); the route does the fetching.

/** Steam app ids per publisher's ticker (biggest PC games each company owns). */
export const STEAM_GAMES: Record<string, [number, string][]> = {
  TTWO: [[271590, 'GTA V'], [1174180, 'Red Dead Redemption 2'], [397540, 'Borderlands 3'], [289070, 'Civilization VI'], [2338770, 'NBA 2K24']],
  EA: [[1172470, 'Apex Legends'], [2669320, 'EA Sports FC 25'], [1517290, 'Battlefield 2042'], [1222670, 'The Sims 4'], [1774580, 'Star Wars Jedi: Survivor']],
  UBSFY: [[359550, 'Rainbow Six Siege'], [2208920, "Assassin's Creed Valhalla"], [646910, 'The Crew 2'], [304390, 'For Honor']],
  MSFT: [[976730, 'Halo MCC'], [1551360, 'Forza Horizon 5'], [813780, 'Age of Empires II DE'], [1172620, 'Sea of Thieves'], [1938090, 'Call of Duty'], [1716740, 'Starfield']],
  SONY: [[553850, 'Helldivers 2'], [1593500, 'God of War'], [1151640, 'Horizon Zero Dawn'], [1817070, "Marvel's Spider-Man"], [2215430, 'Ghost of Tsushima']],
  CCOEY: [[2246340, 'Monster Hunter Wilds'], [2050650, 'Resident Evil 4'], [1364780, 'Street Fighter 6'], [582010, 'Monster Hunter: World']],
  NTES: [[2767030, 'Marvel Rivals'], [1203220, 'Naraka: Bladepoint']],
  WBD: [[990080, 'Hogwarts Legacy'], [1971870, 'Mortal Kombat 1']],
};
/** CFPB complaint database company names. */
export const CFPB_CO: Record<string, string> = {
  JPM: 'JPMORGAN CHASE & CO.', BAC: 'BANK OF AMERICA, NATIONAL ASSOCIATION', WFC: 'WELLS FARGO & COMPANY', C: 'CITIBANK, N.A.', COF: 'CAPITAL ONE FINANCIAL CORPORATION',
  AXP: 'AMERICAN EXPRESS COMPANY', DFS: 'DISCOVER BANK', SYF: 'SYNCHRONY FINANCIAL', USB: 'U.S. BANCORP', ALLY: 'ALLY FINANCIAL INC.', EFX: 'EQUIFAX, INC.',
  TRU: 'TRANSUNION INTERMEDIATE HOLDINGS, INC.', EXPGY: 'Experian Information Solutions Inc.', NAVI: 'Navient Solutions, LLC.', XYZ: 'Block, Inc.', COIN: 'Coinbase, Inc.',
  TFC: 'TRUIST FINANCIAL CORPORATION', PNC: 'PNC Bank N.A.',
};
/** NHTSA recall "manufacturer" patterns (SQL LIKE, upper case). */
export const NHTSA_MFR: Record<string, string[]> = {
  F: ['FORD MOTOR%'], GM: ['GENERAL MOTORS%'], STLA: ['CHRYSLER (FCA%', 'FCA US%'], TSLA: ['TESLA%'], HMC: ['HONDA%'], TM: ['TOYOTA%'], NSANY: ['NISSAN NORTH%'],
  RIVN: ['RIVIAN%'], LCID: ['LUCID%'], HOG: ['HARLEY-DAVIDSON%'], WGO: ['WINNEBAGO%', 'NEWMAR%', 'GRAND DESIGN%'], THO: ['THOR %', 'KEYSTONE RV%', 'JAYCO%', 'HEARTLAND RECREATIONAL%', 'AIRSTREAM%', 'DUTCHMEN%'],
  PCAR: ['PACCAR%', 'KENWORTH%', 'PETERBILT%'], PII: ['POLARIS%'], BMWYY: ['BMW OF NORTH%'], VWAGY: ['VOLKSWAGEN GROUP%'], MBGYY: ['MERCEDES-BENZ USA%'],
};
/** openFDA enforcement (recall) searches: endpoint and firm word. */
export const FDA_FIRM: Record<string, ['food' | 'drug' | 'device', string]> = {
  HSY: ['food', 'hershey'], KHC: ['food', 'kraft'], GIS: ['food', 'general mills'], MDLZ: ['food', 'mondelez'], PEP: ['food', 'pepsico'], CAG: ['food', 'conagra'], TSN: ['food', 'tyson'],
  HRL: ['food', 'hormel'], CPB: ['food', 'campbell'], SJM: ['food', 'smucker'], KDP: ['food', 'keurig'], MKC: ['food', 'mccormick'], KO: ['food', 'coca-cola'], SBUX: ['food', 'starbucks'],
  PFE: ['drug', 'pfizer'], MRK: ['drug', 'merck'], JNJ: ['drug', 'janssen'], LLY: ['drug', 'lilly'], ABBV: ['drug', 'abbvie'], BMY: ['drug', 'bristol'], TEVA: ['drug', 'teva'], VTRS: ['drug', 'viatris'], AMGN: ['drug', 'amgen'], GILD: ['drug', 'gilead'],
  MDT: ['device', 'medtronic'], ABT: ['device', 'abbott'], BSX: ['device', 'boston scientific'], SYK: ['device', 'stryker'], BDX: ['device', 'becton'], BAX: ['device', 'baxter'], ZBH: ['device', 'zimmer'], EW: ['device', 'edwards lifesciences'], ISRG: ['device', 'intuitive surgical'], DXCM: ['device', 'dexcom'], PODD: ['device', 'insulet'],
};
export const LIVE_TICKERS = [...new Set([...Object.keys(STEAM_GAMES), ...Object.keys(CFPB_CO), ...Object.keys(NHTSA_MFR), ...Object.keys(FDA_FIRM)])].sort();

export type QPoint = [string, number];
export interface LiveSeries { id: string; label: string; group: string; source: string; points: QPoint[] }
export interface LiveEvent { date: string; group: string; label: string }
export interface LiveBlock { kind: string; source: string; series: LiveSeries[]; events: LiveEvent[]; latest: { label: string; value: string; note?: string }[]; error?: string }

export const quarterOf = (iso: string) => `${iso.slice(0, 4)}Q${Math.floor((+iso.slice(5, 7) - 1) / 3) + 1}`;
const sortQ = (m: Map<string, number>) => [...m].sort((a, b) => a[0].localeCompare(b[0])) as QPoint[];
/** Quarters from start (inclusive) up to the last complete one before now. */
export function quarterRange(startYear: number, now = Date.now()): { q: string; from: string; to: string }[] {
  const out = [], d = new Date(now), curQ = `${d.getUTCFullYear()}Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
  for (let y = startYear; y <= d.getUTCFullYear(); y++) for (let k = 0; k < 4; k++) {
    const q = `${y}Q${k + 1}`; if (q >= curQ) break;
    const m0 = k * 3 + 1, to = new Date(Date.UTC(y, m0 + 2, 1)).toISOString().slice(0, 10);
    out.push({ q, from: `${y}-${String(m0).padStart(2, '0')}-01`, to });
  }
  return out;
}

/** Steam histogram rollups (all games summed) -> quarterly % positive and review volume. */
export function steamQuarterly(games: { rollups: { date: number; recommendations_up: number; recommendations_down: number }[] }[], now = Date.now()): { pos: QPoint[]; vol: QPoint[] } {
  const up = new Map<string, number>(), dn = new Map<string, number>(), d = new Date(now), cur = `${d.getUTCFullYear()}Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
  for (const g of games) for (const r of g.rollups) { const q = quarterOf(new Date(r.date * 1000).toISOString()); if (q >= cur) continue; up.set(q, (up.get(q) ?? 0) + r.recommendations_up); dn.set(q, (dn.get(q) ?? 0) + r.recommendations_down); }
  const pos = new Map<string, number>(), vol = new Map<string, number>();
  for (const [q, u] of up) { const t = u + (dn.get(q) ?? 0); if (t >= 200) { pos.set(q, (u / t) * 100); vol.set(q, t); } }
  return { pos: sortQ(pos), vol: sortQ(vol) };
}
/** Dated rows -> quarterly counts (and optional summed value), filling empty quarters with 0 from the first row on. */
export function countByQuarter(dates: { date: string; v?: number }[], now = Date.now()): { n: QPoint[]; sum: QPoint[] } {
  if (!dates.length) return { n: [], sum: [] };
  const first = dates.map((x) => x.date).sort()[0], n = new Map<string, number>(), s = new Map<string, number>();
  for (const r of quarterRange(+first.slice(0, 4), now)) { n.set(r.q, 0); s.set(r.q, 0); }
  for (const x of dates) { const q = quarterOf(x.date); if (!n.has(q)) continue; n.set(q, n.get(q)! + 1); s.set(q, s.get(q)! + (x.v ?? 0)); }
  return { n: sortQ(n), sum: sortQ(s) };
}
/** openFDA dates are YYYYMMDD. */
export const fdaDate = (s: string) => (/^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : '');
