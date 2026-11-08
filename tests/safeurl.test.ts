import { describe, expect, it } from 'vitest';
import { safeUrl } from '../shared/safeurl';
import { parseFeed } from '../shared/news';
import { parsePopupHtml } from '../shared/world';
describe('links from outside feeds', () => {
  it('only http(s) gets through', () => {
    expect(safeUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeUrl('  http://x.org ')).toBe('http://x.org');
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>', 'vbscript:x', '//evil.com', '', null, undefined, 'https://a.com/"onmouseover="x']) expect(safeUrl(bad)).toBe('');
  });
  it('RSS items with a javascript: link lose the link but keep the headline', () => {
    const xml = '<rss><channel><item><title>Fed holds</title><link>javascript:alert(1)</link><pubDate>Mon, 03 Nov 2025 14:00:00 GMT</pubDate></item><item><title>Ok</title><link>https://x.com/a</link><pubDate>Mon, 03 Nov 2025 15:00:00 GMT</pubDate></item></channel></rss>';
    const r = parseFeed(xml, 'T');
    expect(r.find((x) => x.title === 'Fed holds')?.url).toBe('');
    expect(r.find((x) => x.title === 'Ok')?.url).toBe('https://x.com/a');
  });
  it('GDELT popup links are filtered too', () => {
    expect(parsePopupHtml('<a href="javascript:alert(1)">bad</a><a href="https://ok.com/x">good</a>')).toEqual([{ url: 'https://ok.com/x', title: 'good' }]);
  });
});
