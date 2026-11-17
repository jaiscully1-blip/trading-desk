// "Smart money" trackers: big investors' 13F filings (SEC), ARK's daily trades, and politicians' disclosed trades.
// Pure parsers and math only; the fetching lives in api/_lib/research/smart.ts.

/* ---------------- 13F superinvestors ---------------- */
export interface Fund { cik: string; who: string; firm: string; style: string; cat?: string }
// CIKs from SEC EDGAR. The page shows SEC's own filer name next to each, so a wrong CIK is obvious.
export const FUNDS: Fund[] = [
  { cik: '1067983', who: 'Warren Buffett', firm: 'Berkshire Hathaway', style: 'Value, concentrated, holds for decades', cat: 'Famous managers' },
  { cik: '1649339', who: 'Michael Burry', firm: 'Scion Asset Management', style: 'Contrarian, deep value, often bearish', cat: 'Famous managers' },
  { cik: '1336528', who: 'Bill Ackman', firm: 'Pershing Square', style: '~10 big concentrated bets, activist', cat: 'Famous managers' },
  { cik: '1536411', who: 'Stanley Druckenmiller', firm: 'Duquesne Family Office', style: 'Macro + growth momentum, moves fast', cat: 'Famous managers' },
  { cik: '1656456', who: 'David Tepper', firm: 'Appaloosa', style: 'Macro-driven, big tech and China swings', cat: 'Famous managers' },
  { cik: '1350694', who: 'Ray Dalio', firm: 'Bridgewater Associates', style: 'Macro, very diversified (hundreds of names)', cat: 'Famous managers' },
  { cik: '1709323', who: 'Li Lu', firm: 'Himalaya Capital', style: 'Buffett-style value, very concentrated', cat: 'Famous managers' },
  { cik: '1061768', who: 'Seth Klarman', firm: 'Baupost Group', style: 'Deep value, margin of safety', cat: 'Famous managers' },
  { cik: '1040273', who: 'Dan Loeb', firm: 'Third Point', style: 'Event-driven, activist', cat: 'Famous managers' },
  { cik: '1079114', who: 'David Einhorn', firm: 'Greenlight Capital', style: 'Value long/short', cat: 'Famous managers' },
  { cik: '921669', who: 'Carl Icahn', firm: 'Icahn Capital', style: 'Activist, few huge stakes', cat: 'Famous managers' },
  { cik: '1167483', who: 'Chase Coleman', firm: 'Tiger Global', style: 'Growth / tech', cat: 'Famous managers' },
  { cik: '1135730', who: 'Philippe Laffont', firm: 'Coatue', style: 'Growth / tech, AI-heavy', cat: 'Famous managers' },
  { cik: '1697748', who: 'Cathie Wood', firm: 'ARK Investment Mgmt', style: 'Disruptive innovation, high beta', cat: 'Famous managers' },
  { cik: '1037389', who: 'Renaissance', firm: 'Renaissance Technologies', style: 'Quant, thousands of small positions, model-driven', cat: 'Quant & multi-strategy' },
  { cik: '1179392', who: 'Two Sigma', firm: 'Two Sigma Investments', style: 'Quant, data-driven, very diversified', cat: 'Quant & multi-strategy' },
  { cik: '1423053', who: 'Citadel', firm: 'Citadel Advisors', style: 'Multi-strategy, high turnover', cat: 'Quant & multi-strategy' },
  { cik: '1009207', who: 'D. E. Shaw', firm: 'D. E. Shaw & Co.', style: 'Quant and discretionary, very diversified', cat: 'Quant & multi-strategy' },
  { cik: '1273087', who: 'Millennium', firm: 'Millennium Management', style: 'Multi-manager pod shop, high turnover', cat: 'Quant & multi-strategy' },
  { cik: '1167557', who: 'AQR', firm: 'AQR Capital Management', style: 'Factor and quant investing', cat: 'Quant & multi-strategy' },
  { cik: '1603466', who: 'Point72', firm: 'Point72 Asset Management', style: 'Multi-manager, long/short equity', cat: 'Quant & multi-strategy' },
  { cik: '1595888', who: 'Jane Street', firm: 'Jane Street Group', style: 'Market maker and trader, mostly hedged', cat: 'Quant & multi-strategy' },
  { cik: '1218710', who: 'Balyasny', firm: 'Balyasny Asset Management', style: 'Multi-manager pod shop', cat: 'Quant & multi-strategy' },
  { cik: '1642575', who: 'Squarepoint', firm: 'Squarepoint Ops', style: 'Quant, systematic', cat: 'Quant & multi-strategy' },
  { cik: '1103804', who: 'Viking Global', firm: 'Viking Global Investors', style: 'Long/short equity, fundamental', cat: 'Hedge funds' },
  { cik: '1029160', who: 'Soros', firm: 'Soros Fund Management', style: 'Macro and equities', cat: 'Hedge funds' },
  { cik: '1035674', who: 'Paulson', firm: 'Paulson & Co.', style: 'Event-driven, concentrated', cat: 'Hedge funds' },
  { cik: '1061165', who: 'Lone Pine', firm: 'Lone Pine Capital', style: 'Long/short growth, Tiger cub', cat: 'Hedge funds' },
  { cik: '934639', who: 'Maverick', firm: 'Maverick Capital', style: 'Long/short equity, Tiger cub', cat: 'Hedge funds' },
  { cik: '1138995', who: 'Glenview', firm: 'Glenview Capital Management', style: 'Healthcare-heavy long/short', cat: 'Hedge funds' },
  { cik: '1056831', who: 'Fairholme', firm: 'Fairholme Capital', style: 'Concentrated value', cat: 'Hedge funds' },
  { cik: '1535392', who: 'Mangrove', firm: 'Mangrove Partners', style: 'Activist, small and mid caps', cat: 'Hedge funds' },
  { cik: '1581811', who: 'Egerton', firm: 'Egerton Capital', style: 'London long/short, concentrated', cat: 'Hedge funds' },
  { cik: '1569049', who: 'Light Street', firm: 'Light Street Capital', style: 'Tech and internet focus', cat: 'Hedge funds' },
  { cik: '1633313', who: 'Avoro', firm: 'Avoro Capital Advisors', style: 'Biotech', cat: 'Hedge funds' },
  { cik: '1791786', who: 'Elliott', firm: 'Elliott Investment Management', style: 'Activist, large stakes with campaigns', cat: 'Activists' },
  { cik: '1517137', who: 'Starboard', firm: 'Starboard Value', style: 'Activist', cat: 'Activists' },
  { cik: '1345471', who: 'Trian', firm: 'Trian Fund Management', style: 'Activist, few big stakes', cat: 'Activists' },
  { cik: '1418814', who: 'ValueAct', firm: 'ValueAct Holdings', style: 'Activist, collaborative, concentrated', cat: 'Activists' },
  { cik: '2012383', who: 'BlackRock', firm: 'BlackRock, Inc.', style: 'Largest asset manager, mostly index funds', cat: 'Asset managers' },
  { cik: '315066', who: 'Fidelity', firm: 'FMR LLC (Fidelity)', style: 'Active and index, very large', cat: 'Asset managers' },
  { cik: '80255', who: 'T. Rowe Price', firm: 'T. Rowe Price Associates', style: 'Active growth, very large', cat: 'Asset managers' },
  { cik: '1422849', who: 'Capital World', firm: 'Capital World Investors (Capital Group)', style: 'Active, long-term, global', cat: 'Asset managers' },
  { cik: '1422848', who: 'Capital Research', firm: 'Capital Research Global Investors (Capital Group)', style: 'Active, long-term', cat: 'Asset managers' },
  { cik: '914208', who: 'Invesco', firm: 'Invesco Ltd.', style: 'Active and ETFs', cat: 'Asset managers' },
  { cik: '354204', who: 'Dimensional', firm: 'Dimensional Fund Advisors', style: 'Factor and index-like, thousands of names', cat: 'Asset managers' },
  { cik: '1088875', who: 'Baillie Gifford', firm: 'Baillie Gifford & Co', style: 'Long-term growth', cat: 'Asset managers' },
  { cik: '53417', who: 'Jennison', firm: 'Jennison Associates', style: 'Growth equity', cat: 'Asset managers' },
  { cik: '1096343', who: 'Markel', firm: 'Markel Group', style: 'Insurer and investor, Buffett-style', cat: 'Asset managers' },
  { cik: '19617', who: 'JPMorgan', firm: 'JPMorgan Chase & Co', style: 'Bank: asset management and trading books', cat: 'Banks & insurers' },
  { cik: '886982', who: 'Goldman Sachs', firm: 'Goldman Sachs Group', style: 'Bank: asset management and trading books', cat: 'Banks & insurers' },
  { cik: '895421', who: 'Morgan Stanley', firm: 'Morgan Stanley', style: 'Bank: wealth and asset management', cat: 'Banks & insurers' },
  { cik: '70858', who: 'Bank of America', firm: 'Bank of America Corp', style: 'Bank: wealth management and trading', cat: 'Banks & insurers' },
  { cik: '72971', who: 'Wells Fargo', firm: 'Wells Fargo & Company', style: 'Bank: wealth and asset management', cat: 'Banks & insurers' },
  { cik: '831001', who: 'Citigroup', firm: 'Citigroup Inc', style: 'Bank: trading and wealth', cat: 'Banks & insurers' },
  { cik: '1610520', who: 'UBS', firm: 'UBS Group AG', style: 'Bank: wealth management', cat: 'Banks & insurers' },
  { cik: '312069', who: 'Barclays', firm: 'Barclays PLC', style: 'Bank: trading and asset management', cat: 'Banks & insurers' },
  { cik: '948046', who: 'Deutsche Bank', firm: 'Deutsche Bank AG', style: 'Bank: trading and asset management', cat: 'Banks & insurers' },
  { cik: '1390777', who: 'BNY Mellon', firm: 'Bank of New York Mellon', style: 'Bank: custody and asset management', cat: 'Banks & insurers' },
  { cik: '93751', who: 'State Street', firm: 'State Street Corp', style: 'Bank: custody and index funds', cat: 'Banks & insurers' },
  { cik: '73124', who: 'Northern Trust', firm: 'Northern Trust Corp', style: 'Bank: custody and asset management', cat: 'Banks & insurers' },
  { cik: '1099219', who: 'MetLife', firm: 'MetLife Inc', style: 'Insurer', cat: 'Banks & insurers' },
  { cik: '1137774', who: 'Prudential', firm: 'Prudential Financial', style: 'Insurer', cat: 'Banks & insurers' },
  { cik: '820027', who: 'Ameriprise', firm: 'Ameriprise Financial', style: 'Wealth manager', cat: 'Banks & insurers' },
  { cik: '884546', who: 'Schwab Investment Mgmt', firm: 'Charles Schwab Investment Management', style: 'Index funds and ETFs', cat: 'Banks & insurers' },
  { cik: '71633', who: 'New York Life', firm: 'New York Life Insurance', style: 'Insurer', cat: 'Banks & insurers' },
  { cik: '919079', who: 'CalPERS', firm: 'California Public Employees Retirement System', style: 'Largest US public pension', cat: 'Pensions & retirement' },
  { cik: '1081019', who: 'CalSTRS', firm: 'California State Teachers Retirement System', style: 'Public teachers pension', cat: 'Pensions & retirement' },
  { cik: '810265', who: 'NY State Common', firm: 'New York State Common Retirement Fund', style: 'Public pension', cat: 'Pensions & retirement' },
  { cik: '796848', who: 'Texas Teachers', firm: 'Teacher Retirement System of Texas', style: 'Public teachers pension', cat: 'Pensions & retirement' },
  { cik: '854157', who: 'Wisconsin', firm: 'State of Wisconsin Investment Board', style: 'Public pension', cat: 'Pensions & retirement' },
  { cik: '1107314', who: 'Oregon PERS', firm: 'Oregon Public Employees Retirement Fund', style: 'Public pension', cat: 'Pensions & retirement' },
  { cik: '943712', who: 'Washington State', firm: 'Washington State Investment Board', style: 'Public pension', cat: 'Pensions & retirement' },
  { cik: '1083190', who: 'Pennsylvania PSERS', firm: 'Pennsylvania Public School Employees Retirement', style: 'Public pension', cat: 'Pensions & retirement' },
  { cik: '1007280', who: 'Ohio PERS', firm: 'Public Employees Retirement System of Ohio', style: 'Public pension', cat: 'Pensions & retirement' },
  { cik: '937567', who: 'Ontario Teachers', firm: 'Ontario Teachers Pension Plan', style: 'Canadian pension', cat: 'Pensions & retirement' },
  { cik: '1283718', who: 'CPP Investments', firm: 'Canada Pension Plan Investment Board', style: 'Canadian pension', cat: 'Pensions & retirement' },
  { cik: '1396318', who: 'PSP Investments', firm: 'Public Sector Pension Investment Board', style: 'Canadian pension', cat: 'Pensions & retirement' },
  { cik: '1374170', who: 'Norway (NBIM)', firm: 'Norges Bank', style: 'Norway sovereign wealth fund, owns about 1% of global stocks', cat: 'Sovereign & central banks' },
  { cik: '1582202', who: 'Swiss National Bank', firm: 'Swiss National Bank', style: 'Central bank reserves', cat: 'Sovereign & central banks' },
  { cik: '1918181', who: 'Saudi Central Bank', firm: 'Saudi Central Bank', style: 'Central bank', cat: 'Sovereign & central banks' },
  { cik: '1021944', who: 'Temasek', firm: 'Temasek Holdings', style: 'Singapore sovereign investor', cat: 'Sovereign & central banks' },
  { cik: '1582681', who: 'Alaska Permanent Fund', firm: 'Alaska Permanent Fund Corp', style: 'State sovereign wealth fund', cat: 'Sovereign & central banks' },
  { cik: '1223779', who: 'Texas Permanent School', firm: 'Texas Permanent School Fund Corp', style: 'State education fund', cat: 'Sovereign & central banks' },
  { cik: '1082621', who: 'Harvard', firm: 'Harvard Management Company', style: 'University endowment', cat: 'Endowments' },
];

export interface F13Row { cusip: string; name: string; cls: string; value: number; shares: number; putCall: '' | 'PUT' | 'CALL' }

const tag = (blk: string, t: string) => {
  const m = blk.match(new RegExp(`<(?:\\w+:)?${t}>\\s*([^<]*?)\\s*</(?:\\w+:)?${t}>`, 'i'));
  return m ? m[1] : '';
};
const unxml = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"');

/** 13F information table XML -> one row per CUSIP (+ put/call), rows from several managers summed. Values in dollars. */
export function parse13F(xml: string, valuesInThousands = false): F13Row[] {
  const by = new Map<string, F13Row>();
  for (const m of xml.matchAll(/<(?:\w+:)?infoTable>([\s\S]*?)<\/(?:\w+:)?infoTable>/gi)) {
    const b = m[1];
    const cusip = tag(b, 'cusip').toUpperCase();
    if (!cusip) continue;
    const pc = tag(b, 'putCall').toUpperCase();
    const putCall: F13Row['putCall'] = pc === 'PUT' || pc === 'CALL' ? pc : '';
    const k = putCall ? `${cusip}:${putCall}` : cusip;
    const value = (parseFloat(tag(b, 'value')) || 0) * (valuesInThousands ? 1000 : 1);
    const shares = parseFloat(tag(b, 'sshPrnamt')) || 0;
    const prev = by.get(k);
    if (prev) { prev.value += value; prev.shares += shares; }
    else by.set(k, { cusip, name: unxml(tag(b, 'nameOfIssuer')), cls: unxml(tag(b, 'titleOfClass')), value, shares, putCall });
  }
  return [...by.values()].sort((a, b) => b.value - a.value);
}

export type Change = 'new' | 'added' | 'trimmed' | 'sold' | 'same';
export interface F13Pos extends F13Row { key: string; weight: number; prevShares: number; prevValue: number; change: Change; chgPct: number | null }

/** Compare this quarter to last: new / added / trimmed / sold out. */
export function diff13F(cur: F13Row[], prev: F13Row[] | null): F13Pos[] {
  const keyOf = (r: F13Row) => (r.putCall ? `${r.cusip}:${r.putCall}` : r.cusip);
  const total = cur.reduce((s, r) => s + r.value, 0) || 1;
  const pm = new Map((prev ?? []).map((r) => [keyOf(r), r]));
  const out: F13Pos[] = cur.map((r) => {
    const p = pm.get(keyOf(r));
    pm.delete(keyOf(r));
    const chgPct = p && p.shares ? ((r.shares - p.shares) / p.shares) * 100 : null;
    const change: Change = !prev ? 'same' : !p ? 'new' : chgPct == null || Math.abs(chgPct) < 0.5 ? 'same' : chgPct > 0 ? 'added' : 'trimmed';
    return { ...r, key: keyOf(r), weight: r.value / total, prevShares: p?.shares ?? 0, prevValue: p?.value ?? 0, change, chgPct };
  });
  for (const p of pm.values()) out.push({ ...p, key: keyOf(p), value: 0, shares: 0, weight: 0, prevShares: p.shares, prevValue: p.value, change: 'sold', chgPct: -100 });
  return out;
}

/** "APPLE INC" / "Apple Inc." / "ALPHABET INC CL A" -> comparable key, for matching 13F names to SEC tickers. */
export function normName(s: string): string {
  return ` ${s.toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]/g, ' ')} `
    .replace(/ (INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|PLC|LLC|LP|L P|SA|NV|N V|AG|SE|HLDGS?|HOLDINGS?|GROUP|THE|NEW|DEL|COM|CL [A-C]|CLASS [A-C]|SHS|ORD|ADR|SPONSORED|SPON)(?= )/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

/* ---------------- ARK daily trades ---------------- */
export const ARK_FUNDS = ['ARKK', 'ARKW', 'ARKG', 'ARKQ', 'ARKF', 'ARKX'];
export interface ArkTrade { fund: string; date: string; sym: string; company: string; dir: 'Buy' | 'Sell'; shares: number; pct: number }
export function parseArkTrades(j: any): ArkTrade[] {
  const list: any[] = Array.isArray(j?.trades) ? j.trades : [];
  return list
    .map((t) => ({ fund: String(t.fund ?? ''), date: String(t.date ?? ''), sym: String(t.ticker ?? '').toUpperCase(), company: String(t.company ?? ''), dir: /sell/i.test(String(t.direction)) ? 'Sell' as const : 'Buy' as const, shares: Number(t.shares) || 0, pct: Number(t.etf_percent) || 0 }))
    .filter((t) => t.date && (t.sym || t.company))
    .sort((a, b) => b.date.localeCompare(a.date) || b.pct - a.pct);
}
/** Net ARK activity per ticker across all funds over the window: who they are buying and dumping. */
export function arkNet(trades: ArkTrade[]) {
  const by = new Map<string, { sym: string; company: string; buys: number; sells: number; netShares: number; days: Set<string>; last: string; funds: Set<string> }>();
  for (const t of trades) {
    const k = t.sym || t.company;
    const v = by.get(k) ?? { sym: t.sym, company: t.company, buys: 0, sells: 0, netShares: 0, days: new Set<string>(), last: t.date, funds: new Set<string>() };
    if (t.dir === 'Buy') { v.buys++; v.netShares += t.shares; } else { v.sells++; v.netShares -= t.shares; }
    v.days.add(t.date); v.funds.add(t.fund);
    if (t.date > v.last) v.last = t.date;
    by.set(k, v);
  }
  return [...by.values()].map((v) => ({ sym: v.sym, company: v.company, buys: v.buys, sells: v.sells, netShares: v.netShares, days: v.days.size, last: v.last, funds: [...v.funds].sort() }))
    .sort((a, b) => b.days - a.days || Math.abs(b.netShares) - Math.abs(a.netShares));
}

/* ---------------- politicians ---------------- */
// Members known for active, large or well-followed trading. Any other member is searchable.
export const FAMOUS_POLS = ['P000197', 'C001120', 'K000389', 'G000583', 'T000278', 'M001157', 'W000797', 'C001123', 'B001327', 'M001217', 'F000246', 'F000472', 'M001243', 'W000802', 'C001047', 'H001082', 'M001204', 'M001163'];

export interface PolTrade { sym: string | null; asset: string; type: string; traded: string; filed: string; min: number | null; max: number | null; owner: string; option: boolean }
export function parsePolTrades(j: any): { name: string; party: string; state: string; trades: PolTrade[] } {
  const list: any[] = Array.isArray(j?.trades) ? j.trades : [];
  const seen = new Set<string>();
  const trades: PolTrade[] = [];
  for (const t of list) {
    const r: PolTrade = {
      sym: t.symbol ? String(t.symbol).toUpperCase() : null, asset: String(t.asset_name ?? ''), type: String(t.transaction_type ?? '').toUpperCase(),
      traded: String(t.transaction_date ?? ''), filed: String(t.filed_date || t.notification_date || ''),
      min: Number.isFinite(parseFloat(t.amount_min)) ? parseFloat(t.amount_min) : null, max: Number.isFinite(parseFloat(t.amount_max)) ? parseFloat(t.amount_max) : null,
      owner: String(t.owner_code ?? ''), option: String(t.asset_type_code ?? '').toUpperCase() === 'OP',
    };
    const k = `${r.sym}|${r.asset}|${r.type}|${r.traded}|${r.min}|${r.owner}`;
    if (seen.has(k)) continue;
    seen.add(k); trades.push(r);
  }
  trades.sort((a, b) => b.traded.localeCompare(a.traded));
  const f = list[0] ?? {};
  return { name: String(f.politician_canonical || f.politician || ''), party: String(f.party ?? ''), state: String(f.state ?? ''), trades };
}

const mid = (t: PolTrade) => (t.min != null && t.max != null ? (t.min + t.max) / 2 : t.min ?? t.max ?? 0);
const isBuy = (type: string) => /BUY|PURCHASE/.test(type);
const isSell = (type: string) => /SELL|SALE/.test(type);

/** Rough book per ticker from disclosed ranges (midpoints). Disclosures give ranges, not exact amounts or prices. */
export function polBook(trades: PolTrade[]) {
  const by = new Map<string, { sym: string; asset: string; buys: number; sells: number; bought: number; sold: number; first: string; last: string; lastType: string; option: boolean }>();
  for (const t of trades) {
    if (!t.sym) continue;
    const v = by.get(t.sym) ?? { sym: t.sym, asset: t.asset, buys: 0, sells: 0, bought: 0, sold: 0, first: t.traded, last: '', lastType: '', option: false };
    if (isBuy(t.type)) { v.buys++; v.bought += mid(t); } else if (isSell(t.type)) { v.sells++; v.sold += mid(t); }
    if (t.traded > v.last) { v.last = t.traded; v.lastType = isBuy(t.type) ? 'BUY' : isSell(t.type) ? 'SELL' : t.type; }
    if (t.traded < v.first) v.first = t.traded;
    v.option ||= t.option;
    by.set(t.sym, v);
  }
  return [...by.values()].map((v) => ({ ...v, net: v.bought - v.sold, status: v.bought > v.sold * 1.05 ? 'likely held' as const : v.sold > 0 && v.lastType === 'SELL' ? 'sold' as const : 'mixed' as const }))
    .sort((a, b) => b.last.localeCompare(a.last));
}

export const usd = (n: number) => (Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`);
