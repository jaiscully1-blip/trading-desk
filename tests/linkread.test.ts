import { describe, expect, it } from 'vitest';
import { cleanAnalysis, extractArticle, parseCaptions, parseWatchPage, privateIp, publicUrl, youTubeId } from '../shared/linkread';

describe('link reader: which links it will open', () => {
  it('public http(s) only', () => {
    expect(publicUrl('https://www.reuters.com/markets/x')?.hostname).toBe('www.reuters.com');
    for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'http://localhost:3000', 'http://127.0.0.1/', 'http://10.0.0.5/', 'http://192.168.1.1/', 'http://169.254.169.254/latest', 'http://[::1]/', 'http://intranet/', 'https://user:pw@site.com/', 'https://site.com:8080/', 'http://printer.local/'])
      expect(publicUrl(bad), bad).toBeNull();
  });
  it('private addresses after DNS', () => {
    expect(privateIp('10.1.2.3')).toBe(true);
    expect(privateIp('172.20.0.1')).toBe(true);
    expect(privateIp('::ffff:127.0.0.1')).toBe(true);
    expect(privateIp('fd00::1')).toBe(true);
    expect(privateIp('8.8.8.8')).toBe(false);
  });
  it('YouTube ids from every link shape', () => {
    const id = (s: string) => youTubeId(new URL(s));
    expect(id('https://www.youtube.com/watch?v=PYhvtsK-0JU')).toBe('PYhvtsK-0JU');
    expect(id('https://youtu.be/PYhvtsK-0JU?t=30')).toBe('PYhvtsK-0JU');
    expect(id('https://m.youtube.com/shorts/PYhvtsK-0JU')).toBe('PYhvtsK-0JU');
    expect(id('https://www.youtube.com/live/PYhvtsK-0JU')).toBe('PYhvtsK-0JU');
    expect(id('https://www.reuters.com/watch?v=PYhvtsK-0JU')).toBeNull();
  });
});

describe('link reader: page parsing', () => {
  it('article title, source, date and paragraphs (scripts and navigation dropped)', () => {
    const html = `<html><head><title>Fallback</title><meta property="og:title" content="Fed holds rates &amp; signals cuts"><meta property="og:site_name" content="Reuters"><meta property="article:published_time" content="2026-11-12T14:00:00Z"></head>
      <body><nav><p>Menu link that is long enough to count as a paragraph in theory</p></nav><script>var x = "<p>nope</p>"</script>
      <article><p>The Federal Reserve kept its benchmark rate unchanged on Wednesday, as expected by markets.</p><p>Short.</p><p>Chair Powell said two cuts were still likely next year if inflation keeps easing.</p></article></body></html>`;
    const a = extractArticle(html, 'www.reuters.com');
    expect(a.title).toBe('Fed holds rates & signals cuts');
    expect(a.source).toBe('Reuters');
    expect(a.published).toBe('2026-11-12T14:00:00Z');
    expect(a.text.split('\n')).toHaveLength(2);
    expect(a.text).not.toContain('Menu');
    expect(a.text).not.toContain('nope');
  });
  it('YouTube watch page and captions', () => {
    const pr = { videoDetails: { title: 'DOJ live', author: 'Fox Business', shortDescription: 'Live coverage' }, captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ languageCode: 'es', baseUrl: 'https://www.youtube.com/api/timedtext?lang=es' }, { languageCode: 'en', kind: 'asr', baseUrl: 'https://www.youtube.com/api/timedtext?lang=en' }] } } };
    const w = parseWatchPage(`<script>var ytInitialPlayerResponse = ${JSON.stringify(pr)};var meta = 1;</script>`);
    expect(w).toEqual({ title: 'DOJ live', channel: 'Fox Business', description: 'Live coverage', captionUrl: 'https://www.youtube.com/api/timedtext?lang=en' });
    expect(parseCaptions('<transcript><text start="0">Rates are &amp;#39;on hold&amp;#39;</text><text start="2">for now</text></transcript>')).toBe("Rates are 'on hold' for now");
  });
});

describe('link reader: answer clean-up', () => {
  it('keeps the schema, drops advice and bad tickers, keeps plain news verbs', () => {
    const a = cleanAnalysis({
      summary: 'Microsoft agreed to buy a game studio. Investors should buy the dip now.',
      keyPoints: ['Deal worth $10B', 'You should sell calls on it.'],
      effects: [{ area: 'stocks', tone: 'positive', text: 'Could lift MSFT.' }, { area: 'stocks', tone: 'negative', text: 'Duplicate area' }, { area: 'aliens', tone: 'weird', text: 'Odd' }],
      tickers: [{ sym: '$msft', effect: 'up', why: 'buyer' }, { sym: 'not a ticker!', effect: 'up', why: 'x' }],
      sectors: [], timeframe: 'eventually', confidence: 'very', opinion: 'yes', watch: [], caveats: '',
    });
    expect(a.summary).toBe('Microsoft agreed to buy a game studio.');
    expect(a.keyPoints).toEqual(['Deal worth $10B']);
    expect(a.effects.map((e) => e.area)).toEqual(['stocks', 'market']);
    expect(a.effects[1].tone).toBe('neutral');
    expect(a.tickers).toEqual([{ sym: 'MSFT', effect: 'up', why: 'buyer' }]);
    expect(a.timeframe).toBe('days');
    expect(a.confidence).toBe('low');
    expect(a.opinion).toBe(false);
  });
});
