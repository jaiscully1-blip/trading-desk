// SEC Form 4 (insider transactions) parsing. Source: the filing's own XML on sec.gov.
export interface InsiderTx { date: string; filed: string; who: string; role: string; code: string; kind: string; shares: number; price: number | null; value: number | null; after: number | null; url: string }

const CODE: Record<string, string> = { P: 'Buy', S: 'Sell', M: 'Option exercise', A: 'Award', F: 'Tax withholding', G: 'Gift', D: 'Returned to company', C: 'Conversion', X: 'Option exercise', W: 'Will/inheritance' };
const tag = (xml: string, t: string) => new RegExp(`<${t}>\\s*(?:<value>)?\\s*([^<]*?)\\s*(?:</value>)?\\s*</${t}>`, 'i').exec(xml)?.[1]?.trim() ?? '';
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');

/** submissions JSON -> newest Form 4 filings with the URL of their raw XML. */
export function form4List(j: any, cik: number, max = 15): { filed: string; url: string; index: string }[] {
  const r = j?.filings?.recent;
  const out: { filed: string; url: string; index: string }[] = [];
  if (!r?.form) return out;
  for (let i = 0; i < r.form.length && out.length < max; i++) {
    if (r.form[i] !== '4') continue;
    const acc = String(r.accessionNumber[i]).replace(/-/g, '');
    const doc = String(r.primaryDocument[i]).replace(/^xslF345X\d+\//, ''); // the raw XML, not the styled view
    out.push({ filed: r.filingDate[i], url: `https://www.sec.gov/Archives/edgar/data/${cik}/${acc}/${doc}`, index: `https://www.sec.gov/Archives/edgar/data/${cik}/${acc}/` });
  }
  return out;
}

/** One Form 4 XML -> its non-derivative transactions (common stock bought, sold, awarded…). */
export function parseForm4(xml: string, filed: string, url: string): InsiderTx[] {
  const who = decode(tag(xml, 'rptOwnerName')) || 'Unknown';
  const roles: string[] = [];
  if (/<isDirector>\s*(1|true)\s*</i.test(xml)) roles.push('Director');
  const title = decode(tag(xml, 'officerTitle'));
  if (title) roles.push(title); else if (/<isOfficer>\s*(1|true)\s*</i.test(xml)) roles.push('Officer');
  if (/<isTenPercentOwner>\s*(1|true)\s*</i.test(xml)) roles.push('10% owner');
  const out: InsiderTx[] = [];
  for (const m of xml.matchAll(/<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/gi)) {
    const t = m[1];
    const code = tag(t, 'transactionCode');
    const shares = parseFloat(tag(t, 'transactionShares'));
    const priceRaw = parseFloat(tag(t, 'transactionPricePerShare'));
    const price = Number.isFinite(priceRaw) && priceRaw > 0 ? priceRaw : null;
    const after = parseFloat(tag(t, 'sharesOwnedFollowingTransaction'));
    const ad = tag(t, 'transactionAcquiredDisposedCode');
    if (!Number.isFinite(shares) || shares <= 0) continue;
    out.push({
      date: tag(t, 'transactionDate').slice(0, 10) || filed, filed, who: who.replace(/\s+/g, ' '), role: roles.join(', '),
      code, kind: CODE[code] ?? (ad === 'D' ? 'Disposed' : 'Acquired'), shares, price, value: price != null ? shares * price : null,
      after: Number.isFinite(after) ? after : null, url,
    });
  }
  return out;
}

/** Open-market buys and sells only (codes P and S): the ones that show what insiders chose to do with their own money. */
export function insiderSummary(txs: InsiderTx[], sinceDay: string) {
  const recent = txs.filter((t) => t.date >= sinceDay);
  const sum = (c: string) => recent.filter((t) => t.code === c).reduce((a, t) => a + (t.value ?? 0), 0);
  return { buys: recent.filter((t) => t.code === 'P').length, sells: recent.filter((t) => t.code === 'S').length, buyValue: sum('P'), sellValue: sum('S') };
}
