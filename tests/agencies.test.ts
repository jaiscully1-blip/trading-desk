import { describe, expect, it } from 'vitest';
import { AGENCY_FEEDS, allowedUrl, checkPoints, keywordHits, mergePubs } from '../shared/agencies';

describe('agency publications', () => {
  it('only lets Summarize read the agencies own sites over https', () => {
    expect(allowedUrl('https://www.bis.org/publ/qtrpdf/r_qt2612.htm')).toBe(true);
    expect(allowedUrl('https://libertystreeteconomics.newyorkfed.org/2026/11/x/')).toBe(true);
    expect(allowedUrl('https://evil.example/bis.org')).toBe(false);
    expect(allowedUrl('https://bis.org.evil.example/')).toBe(false);
    expect(allowedUrl('http://www.bis.org/x')).toBe(false);
    expect(allowedUrl('file:///etc/passwd')).toBe(false);
    for (const f of AGENCY_FEEDS) expect(allowedUrl(f.url)).toBe(true);
  });
  it('merges joint releases into one item, newest first, inside the window', () => {
    const p = (title: string, t: number, agency: string) => ({ title, url: `https://x/${agency}`, t, agencies: [agency], type: 'Press' as const, feed: agency });
    const out = mergePubs([[p('Agencies announce dollar thresholds', 2e12, 'Fed')], [p('Agencies Announce Dollar Thresholds!', 2e12 + 3600e3, 'OCC'), p('Old item', 1e12, 'OCC')], [p('Newer', 3e12, 'ECB')]], 1.5e12);
    expect(out.map((x) => [x.title, x.agencies])).toEqual([['Newer', ['ECB']], ['Agencies announce dollar thresholds', ['Fed', 'OCC']]]);
  });
  it('matches your keywords as whole words', () => {
    expect(keywordHits('FSB publishes 2026 G-SIB list', ['G-SIB', 'stablecoin', 'sib'])).toEqual(['G-SIB', 'sib']); // a hyphen is a word break
    expect(keywordHits('Basel committee update', ['base'])).toEqual([]); // not inside a longer word
    expect(keywordHits('Basel III endgame update', ['basel iii'])).toEqual(['basel iii']);
  });
  it('drops summary points whose quotes are not in the publication', () => {
    const text = 'The FSB published the 2026 list of global systemically important banks. Two banks moved to a higher bucket.';
    const r = checkPoints({ points: [{ text: 'New G-SIB list out.', quote: 'The FSB published the 2026 list of global systemically important banks.' }, { text: 'Rates cut.', quote: 'The FSB cut rates by 50 basis points.' }] }, text);
    expect(r.points).toHaveLength(1);
    expect(r.dropped).toBe(1);
  });
});

describe('feeds without a date field', () => {
  it('uses the datetime inside the description (ESMA)', async () => {
    const { parseFeed } = await import('../shared/news');
    const xml = '<rss><channel><item><title>DRSP update</title><link>https://www.esma.europa.eu/x</link><description>&lt;time datetime="2026-11-18T09:51:52+01:00" class="datetime"&gt;18 November 2026&lt;/time&gt;</description></item></channel></rss>';
    const [i] = parseFeed(xml, 'ESMA');
    expect(new Date(i.t).toISOString()).toBe('2026-11-18T08:51:52.000Z');
  });
});
