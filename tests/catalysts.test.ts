import { describe, expect, it } from 'vitest';
import { catalyst8k, insiderMessage, keywordHits, looksEnglish, nextMacro, pairFilings, parseEdgarCurrent, stakeMessage, wireMessages, wireTickers } from '../shared/catalysts';
import { etToUtc } from '../shared/clock';

const entry = (form: string, name: string, cik: string, role: string, acc: string, t = '2026-11-11T16:05:00-05:00') =>
  `<entry><title>${form} - ${name} (${cik}) (${role})</title><link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc.replace(/-/g, '')}/${acc}-index.htm"/><summary type="html">Filed</summary><updated>${t}</updated></entry>`;

describe('catalysts', () => {
  it('8-K: names the biggest item and its tone, skips earnings-only filings', () => {
    const m = catalyst8k({ cik: 1, company: 'ACME CORP', t: 1, url: 'u', items: ['8.01', '5.02', '9.01'] }, 'ACME')!;
    expect(m.title).toBe('ACME had an executive or director change');
    expect(m.text).toContain('8-K item 5.02, 8.01');
    expect(catalyst8k({ cik: 1, company: 'X', t: 1, url: 'u', items: ['2.02', '9.01'] }, 'X')).toBeNull();
    expect(catalyst8k({ cik: 1, company: 'X', t: 1, url: 'u', items: ['2.05'] }, 'X')!.tone).toBe('down');
  });

  it('EDGAR current feed: parses parties and pairs subject with filer', () => {
    const xml = entry('SCHEDULE 13D/A', 'Hoge Brett Widney', '0001966393', 'Filed by', '0001966393-26-000004')
      + entry('SCHEDULE 13D/A', 'Newton Golf Company, Inc.', '0001934245', 'Subject', '0001966393-26-000004')
      + entry('4', 'LanzaTech Global, Inc.', '0001843724', 'Issuer', '0001032453-26-000010')
      + entry('4', 'KHOSLA VINOD', '0001032453', 'Reporting', '0001032453-26-000010');
    const es = parseEdgarCurrent(xml);
    expect(es).toHaveLength(4);
    expect(es[1]).toMatchObject({ form: 'SCHEDULE 13D/A', name: 'Newton Golf Company, Inc.', cik: 1934245, role: 'Subject', acc: '0001966393-26-000004' });
    const ps = pairFilings(es);
    expect(ps).toHaveLength(2);
    const d = ps.find((p) => /13D/.test(p.form))!;
    expect(d.subject.cik).toBe(1934245);
    expect(d.filer?.name).toBe('Hoge Brett Widney');
    expect(stakeMessage(d, 'NWTG').title).toBe('Hoge Brett Widney updated a 13D (active 5%+ stake) on NWTG');
    const f4 = ps.find((p) => p.form === '4')!;
    expect(f4.subject.name).toBe('LanzaTech Global, Inc.');
    expect(f4.filer?.name).toBe('KHOSLA VINOD');
  });

  it('Form 4: buys and sells only, with dollar amounts', () => {
    const tx = (code: string, shares: number, price: number) => ({ code, who: 'DOE JANE', role: 'CEO', shares, price, value: shares * price });
    const sell = insiderMessage([tx('S', 10000, 150), tx('F', 500, 150)], 'ACME', 'a', 1, 'u')!;
    expect(sell.title).toBe('Doe Jane (CEO) sold $1.5M of ACME');
    expect(sell.tone).toBe('down');
    expect(insiderMessage([tx('P', 2000, 50)], 'ACME', 'b', 1, 'u')!.title).toBe('Doe Jane (CEO) bought $100K of ACME');
    expect(insiderMessage([tx('A', 2000, 0), tx('M', 100, 10)], 'ACME', 'c', 1, 'u')).toBeNull();
  });

  it('newswires: US tickers only, English only', () => {
    expect(wireTickers('Acme Inc. (NYSE: ACME) and Beta (Nasdaq: BETA) today said… (NASDAQ:GAMA)')).toEqual(['ACME', 'BETA', 'GAMA']);
    expect(wireTickers('Antengene ("Antengene", SEHK: 6996.HK)')).toEqual([]);
    expect(looksEnglish('Mouser explora las tecnologías informáticas más recientes')).toBe(false);
    expect(looksEnglish('Acme Announces Third Quarter 2026 Results')).toBe(true);
    const out = wireMessages([
      { title: 'Acme Announces Third Quarter 2026 Results', url: 'a', t: 1, summary: 'NEW YORK--(BUSINESS WIRE)--Acme Inc. (NYSE: ACME) today…' },
      { title: 'Local insurance expert explains risk', url: 'b', t: 2, summary: 'no ticker here' },
    ], 'Business Wire');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'wire', sym: 'ACME', text: 'Business Wire' });
  });

  it('keyword alerts: whole words, any case, tickers', () => {
    const m = { title: 'ACME signed a material agreement', text: 'Acquisition of Beta Corp', sym: 'ACME' };
    expect(keywordHits(m, ['acquisition', 'merger', 'ACME', '$beta'])).toEqual(['acquisition', 'ACME']);
    expect(keywordHits({ title: 'FDA approves drug', sym: undefined }, ['fda'])).toEqual(['fda']);
    expect(keywordHits({ title: 'Data center buildout', sym: undefined }, ['data c'])).toEqual([]);
    expect(keywordHits({ title: 'Fedex earnings', sym: undefined }, ['fed'])).toEqual([]);
  });

  it('macro countdowns: next of each release plus the Fed, in time order', () => {
    const econ = [
      { key: 'cpi', label: 'CPI', date: '2026-11-13', time: '08:30', impact: 3 as const, note: '' },
      { key: 'cpi', label: 'CPI', date: '2026-12-10', time: '08:30', impact: 3 as const, note: '' },
      { key: 'claims', label: 'Jobless claims', date: '2026-11-12', time: '08:30', impact: 2 as const, note: '' },
      { key: 'umich', label: 'UMich', date: '2026-11-12', time: '10:00', impact: 1 as const, note: '' },
    ];
    const now = etToUtc(2026, 11, 12, 8, 50); // 20 min after claims: still shown as "out now" until 9:00
    const out = nextMacro(econ, [{ date: '2026-12-09', sep: true }], now, etToUtc);
    expect(out.map((x) => x.key)).toEqual(['claims', 'cpi', 'fomc']);
    expect(out[1].at).toBe(etToUtc(2026, 11, 13, 8, 30));
    expect(out[2].label).toBe('Fed decision + dot plot');
    expect(nextMacro(econ, [], now + 11 * 60_000, etToUtc).map((x) => x.key)).toEqual(['cpi']);
  });
});

describe('catalysts: edge cases', () => {
  it('Form 4 with no price says shares; law-firm releases are dropped', () => {
    const m = insiderMessage([{ code: 'S', who: 'X Y', role: '', shares: 1200, price: null, value: null }], 'ACME', 'a', 1, 'u')!;
    expect(m.title).toBe('X Y sold 1,200 shares of ACME');
    expect(wireMessages([{ title: 'Investigation of MDGL Reminder: Madrigal Pharmaceuticals, Inc. Investors are Encouraged to Contact Kessler Topaz', url: 'x', t: 1, summary: '(NASDAQ: MDGL)' }], 'Business Wire')).toEqual([]);
  });
});
