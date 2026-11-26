import { describe, expect, it } from 'vitest';
import { exhibitFromIndex, briefChoices, briefNumbers, briefText, checkBrief, insiderSummary, keySentences } from '../shared/filingBrief';

const P = (end: string, revenue: number) => ({ end, label: end, revenue, netIncome: null, eps: null, grossMargin: null, opMargin: null, netMargin: null, fcf: null, shares: null, cash: null, debt: null });

describe('filing brief helpers', () => {
  it('lists 10-Qs, 10-Ks and earnings releases only', () => {
    const rows = [{ form: '4', date: 'd', acc: 'a', file: 'f', items: '' }, { form: '8-K', date: 'd', acc: 'b', file: 'f', items: '2.02,9.01' }, { form: '8-K', date: 'd', acc: 'c', file: 'f', items: '5.02' }, { form: '10-Q', date: 'd', acc: 'e', file: 'f', items: '' }];
    expect(briefChoices(rows).map((r) => [r.acc, r.kind])).toEqual([['b', 'earnings'], ['e', '10-Q']]);
  });
  it('reads MD&A out of a 10-Q', () => {
    const body = 'x '.repeat(900);
    const t = `Item 1. Financial Statements ... Item 2. Management's Discussion and Analysis ${body} Revenue increased 12% to $4.1 billion. Item 3. Quantitative and Qualitative Disclosures`;
    expect(briefText(t, '10-Q')).toContain('Revenue increased 12%');
    expect(briefText(t, '10-Q')).not.toContain('Quantitative and Qualitative Disclosures');
  });
  it('keeps sentences with numbers and key words, in order', () => {
    const t = 'In some cases, you can identify forward-looking statements by terms such as expect, which may increase 10%. We are a company that makes many different things for people around the world. Revenue increased 12% to $4.1 billion compared with the prior year period. We expect fiscal 2027 revenue growth of about 8 percent on continued demand.';
    expect(keySentences(t)).toEqual(['Revenue increased 12% to $4.1 billion compared with the prior year period.', 'We expect fiscal 2027 revenue growth of about 8 percent on continued demand.']);
  });
  it('drops points whose quotes are not in the filing', () => {
    const text = 'Revenue increased 12% to $4.1 billion compared with the prior year period.';
    const r = checkBrief({ headline: 'Sales up', points: [
      { topic: 'Results', text: 'Revenue up 12%', quote: 'Revenue increased 12% to $4.1 billion compared with the prior year period.' },
      { topic: 'Guidance', text: 'Raised outlook', quote: 'We raised our full-year outlook to $20 billion.' },
      { topic: 'Weird', text: 'x', quote: 'Revenue increased 12% to $4.1 billion compared with the prior year period.' },
    ] }, text);
    expect(r.points.map((p) => p.topic)).toEqual(['Results', 'Other']);
    expect(r.dropped).toBe(1);
  });
  it('lines up the quarter with a year ago and the quarter before', () => {
    const fs = { annual: [], quarterly: [P('2025-09-30', 80), P('2025-12-31', 85), P('2026-03-31', 90), P('2026-06-30', 95), P('2026-09-30', 100)] };
    const n = briefNumbers(fs, '10-Q', '2026-09-28')!;
    expect([n.cur.revenue, n.yearAgo?.revenue, n.prior?.revenue, n.basis]).toEqual([100, 80, 95, 'quarter']);
  });
  it('sums open-market insider buys and sells in the last 90 days', () => {
    const tx = (date: string, code: string, value: number) => ({ date, filed: date, who: 'A', role: 'CEO', code, kind: '', shares: 1, price: 1, value, after: null, url: '' });
    const s = insiderSummary([tx('2026-11-01', 'S', 500), tx('2026-10-01', 'P', 100), tx('2026-01-01', 'S', 999), tx('2026-11-02', 'M', 50)], new Date('2026-11-26'));
    expect([s.buys, s.sells]).toEqual([{ n: 1, value: 100, priced: 1 }, { n: 1, value: 500, priced: 1 }]);
  });
});

describe('earnings release exhibit', () => {
  it('finds EX-99.1 by type on the index page, whatever the file name', () => {
    const html = '<tr><td scope="row">1</td><td scope="row">8-K</td><td scope="row"><a href="/x/nvda-20261117.htm">a</a></td></tr><tr><td scope="row">EX-99.1</td><td scope="row"><a href="/x/q3fy27pr.htm">q3fy27pr.htm</a></td></tr><tr><td scope="row">EX-99.2</td><td scope="row"><a href="/x/cfo.htm">c</a></td></tr>';
    expect(exhibitFromIndex(html, /^EX-99(\.1)?$/i)).toBe('/x/q3fy27pr.htm');
    expect(exhibitFromIndex(html, /^EX-21/i)).toBeNull();
  });
});
