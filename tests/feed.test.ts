import { describe, expect, it } from 'vitest';
import { earningsMessages, parseEdgar8k, parseYoutubeLive } from '../shared/feed';

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>8-K - NVIDIA CORP (0001045810) (Filer)</title><link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/1045810/000104581026000123/0001045810-26-000123-index.htm"/>
<summary type="html"> &lt;b&gt;Filed:&lt;/b&gt; 2026-11-19 &lt;b&gt;AccNo:&lt;/b&gt; 0001045810-26-000123 &lt;b&gt;Size:&lt;/b&gt; 1 MB&lt;br&gt;Item 2.02: Results of Operations and Financial Condition&lt;br&gt;Item 9.01: Financial Statements and Exhibits</summary>
<updated>2026-11-19T16:21:07-05:00</updated></entry>
<entry><title>8-K/A - SOME CO &amp; SONS INC (0000000123) (Filer)</title><link href="https://x/y"/><summary>Item 5.02: Departure of Directors</summary><updated>2026-11-19T16:00:00-05:00</updated></entry>
<entry><title>4 - Someone (0000000999) (Reporting)</title><updated>2026-11-19T16:00:00-05:00</updated></entry>
</feed>`;

describe('messages feed parsers', () => {
  it('reads 8-K entries with their item numbers', () => {
    const r = parseEdgar8k(ATOM);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ cik: 1045810, company: 'NVIDIA CORP', items: ['2.02', '9.01'] });
    expect(r[0].t).toBe(Date.parse('2026-11-19T21:21:07Z'));
    expect(r[1]).toMatchObject({ company: 'SOME CO & SONS INC', items: ['5.02'] });
  });
  it('detects a live YouTube stream only when the page says it is live', () => {
    const live = '<link rel="canonical" href="https://www.youtube.com/watch?v=AbCdEfGhIjK">..."isLiveNow":true...';
    expect(parseYoutubeLive(live)).toBe('AbCdEfGhIjK');
    expect(parseYoutubeLive('<link rel="canonical" href="https://www.youtube.com/@WhiteHouse">')).toBeNull();
  });
  it('earnings rows become "reports today" and "beat / missed" messages', () => {
    const m = earningsMessages([
      { sym: 'NVDA', date: '2026-11-19', hour: 'amc', epsEst: 1.25, epsAct: null, revEst: 5.4e10, revAct: null },
      { sym: 'TGT', date: '2026-11-19', hour: 'bmo', epsEst: 2.1, epsAct: 1.9, revEst: 2.6e10, revAct: 2.55e10 },
    ], '2026-11-19', Date.parse('2026-11-19T22:00:00Z'));
    expect(m[0]).toMatchObject({ kind: 'earnings', title: 'NVDA reports today after the close', text: 'EPS est 1.25 · revenue est $54.00B' });
    expect(m[1]).toMatchObject({ kind: 'result', tone: 'down', title: 'TGT missed on EPS' });
    expect(m[1].text).toContain('EPS 1.90 vs 2.10 expected. Revenue $25.50B vs $26.00B est.');
  });
});
