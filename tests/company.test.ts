import { describe, expect, it } from 'vitest';
import { cleanFacts, htmlToText, latestAnnual, matchTicker, normName, parseSecTickers, tenKExcerpt } from '../shared/company';

const LIST = parseSecTickers({
  0: { cik_str: 1045810, ticker: 'NVDA', title: 'NVIDIA CORP' },
  1: { cik_str: 1046179, ticker: 'TSM', title: 'TAIWAN SEMICONDUCTOR MANUFACTURING CO LTD' },
  2: { cik_str: 789019, ticker: 'MSFT', title: 'MICROSOFT CORP' },
  3: { cik_str: 1652044, ticker: 'GOOGL', title: 'Alphabet Inc.' },
  4: { cik_str: 1652044, ticker: 'GOOG', title: 'Alphabet Inc.' },
  5: { cik_str: 2488, ticker: 'AMD', title: 'ADVANCED MICRO DEVICES INC' },
  6: { cik_str: 723125, ticker: 'MU', title: 'MICRON TECHNOLOGY INC' },
});

describe('10-K text', () => {
  it('strips tags, entities and inline XBRL headers', () => {
    expect(htmlToText('<ix:header>junk</ix:header><p>NVIDIA&#8217;s data&nbsp;center</p><div>Next</div>')).toBe('NVIDIA’s data center\nNext');
  });
  it('skips the table of contents and takes the real Item 1 body', () => {
    const body = 'We design GPUs. '.repeat(200);
    const text = `Table of Contents\nItem 1. Business 4\nItem 1A. Risk Factors 12\nItem 7. Management's Discussion 40\n\nItem 1. Business\n${body}\nItem 1A. Risk Factors\nRisks here.`;
    const ex = tenKExcerpt(text);
    expect(ex).toContain('== ITEM 1. BUSINESS ==');
    expect(ex).toContain('We design GPUs.');
    expect(ex).not.toContain('Risks here.');
  });
  it('collects customer and supplier sentences', () => {
    const ex = tenKExcerpt('Filler. Customer A accounted for 12% of total revenue. We rely on TSMC as our foundry partner. Unrelated line.');
    expect(ex).toContain('Customer A accounted for 12%');
    expect(ex).toContain('foundry partner');
  });
});

describe('names -> tickers', () => {
  it('normalizes legal suffixes', () => {
    expect(normName('Micron Technology, Inc.')).toBe('micron technology');
    expect(normName('ADVANCED MICRO DEVICES INC')).toBe('advanced micro devices');
  });
  it('matches exact and unique-prefix names, one CIK with two share classes counts once', () => {
    expect(matchTicker('Micron Technology, Inc.', LIST)).toBe('MU');
    expect(matchTicker('Taiwan Semiconductor Manufacturing Company Limited', LIST)).toBe('TSM');
    expect(matchTicker('Alphabet', LIST)).toBe('GOOGL');
    expect(matchTicker('Customer A', LIST)).toBeUndefined();
    expect(matchTicker('Some Private Supplier', LIST)).toBeUndefined();
  });
  it('cleans an AI answer: dedupes, drops itself, attaches tickers', () => {
    const f = cleanFacts({
      summary: ' Makes chips. ', products: [{ name: 'Data Center', share: '88%' }, { name: '' }],
      suppliers: [{ name: 'TSMC' }, { name: 'Taiwan Semiconductor Manufacturing Company Limited', what: 'wafers' }, { name: 'Micron Technology, Inc.', what: 'memory' }],
      customers: [{ name: 'Customer A', share: '12%' }, { name: 'Microsoft Corporation' }, { name: 'microsoft corp' }],
      competitors: [{ name: 'NVIDIA Corporation' }, { name: 'Advanced Micro Devices' }],
    }, 'NVDA', LIST);
    expect(f.summary).toBe('Makes chips.');
    expect(f.products).toEqual([{ name: 'Data Center', share: '88%', note: undefined }]);
    expect(f.suppliers.map((x) => x.sym)).toEqual([undefined, 'TSM', 'MU']);
    expect(f.customers.map((x) => x.name)).toEqual(['Customer A', 'Microsoft Corporation']);
    expect(f.customers[1].sym).toBe('MSFT');
    expect(f.competitors.map((x) => x.sym)).toEqual(['AMD']);
  });
});

describe('SEC submissions', () => {
  it('finds the newest annual report and builds its URL', () => {
    const j = { filings: { recent: { form: ['8-K', '10-Q', '10-K', '10-K'], accessionNumber: ['a', 'b', '0001045810-26-000023', 'old'], filingDate: ['2026-11-01', '2026-08-27', '2026-02-26', '2025-02-26'], primaryDocument: ['x.htm', 'y.htm', 'nvda-20260125.htm', 'z.htm'] } } };
    expect(latestAnnual(j, 1045810)).toEqual({ form: '10-K', date: '2026-02-26', url: 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000023/nvda-20260125.htm' });
  });
});

import { filingQuotes as _fq, cleanFacts as _cf } from '../shared/company';
describe('company page without named customers', () => {
  it('keeps who the buyers are, in the report\u2019s words, when no customer company is named', () => {
    const f = _cf({ summary: 'Makes electric vehicles.', products: [], suppliers: [], customers: [], competitors: [], customerBase: 'consumers, through company-owned stores and online' }, 'TSLA', []);
    expect(f.customers).toEqual([]);
    expect(f.customerBase).toBe('consumers, through company-owned stores and online');
  });
  it('quotes the filing\u2019s own sentences about customer concentration and single-source suppliers, with no AI', () => {
    const text = 'We design and sell vehicles. No single customer accounted for more than 10% of our total revenues in 2025. We are dependent on our suppliers, many of which are single-source suppliers, and the inability of these suppliers to deliver components could harm us. The weather was fine that year and nothing else of note happened here.';
    const q = _fq(text);
    expect(q.customers[0]).toMatch(/No single customer accounted for more than 10%/);
    expect(q.suppliers[0]).toMatch(/single-source suppliers/);
    expect(_fq('Nothing relevant in this text at all, only a long sentence about other matters entirely.')).toEqual({ customers: [], suppliers: [] });
  });
});
