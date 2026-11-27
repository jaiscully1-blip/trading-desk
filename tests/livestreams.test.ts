import { describe, expect, it } from 'vitest';
import { CHANNELS, liveDiag, liveStreamsOf, streamList } from '../shared/livestreams';

describe('live streams', () => {
  it('offers every 24/7 channel, by its live video when confirmed, else by the channel embed', () => {
    const s = streamList([{ name: 'C-SPAN', videoId: 'KHXsEA4Pg18' }, { name: 'Sky News', videoId: '53SxFKpbKDE' }]);
    expect(s.find((x) => x.name === 'Sky News')).toMatchObject({ key: '53SxFKpbKDE', confirmed: true, src: 'https://www.youtube-nocookie.com/embed/53SxFKpbKDE' });
    expect(s.find((x) => x.name === 'Bloomberg TV')).toMatchObject({ confirmed: false, src: 'https://www.youtube-nocookie.com/embed/live_stream?channel=UCIALMKvObZNtJ6AmdCLP7Lg' });
    expect(s.find((x) => x.name === 'C-SPAN')?.confirmed).toBe(true); // event channel: only when live
    expect(s.some((x) => x.name === 'White House')).toBe(false);
    expect(s.length).toBe(CHANNELS.filter((c) => c.allDay).length + 1);
    expect(s.map((x) => x.name)).toEqual(CHANNELS.filter((c) => s.some((x) => x.name === c.name)).map((c) => c.name)); // channel order kept
  });
  it('plays Sky News by its known 24/7 video when the server cannot confirm it', () => {
    expect(streamList([]).find((x) => x.name === 'Sky News')).toMatchObject({ key: '53SxFKpbKDE', confirmed: false, src: 'https://www.youtube-nocookie.com/embed/53SxFKpbKDE' });
  });
  it('every channel has a proper channel id (except Fox Business, which has none to embed)', () => {
    for (const c of CHANNELS) if (c.handle !== 'FoxBusiness') expect(c.id).toMatch(/^UC[\w-]{22}$/);
  });
  it('says why a live page gave no stream', () => {
    expect(liveDiag(429, '')).toBe('HTTP 429');
    expect(liveDiag(200, '<form action="https://consent.youtube.com/save">')).toBe('consent page');
    expect(liveDiag(200, 'Sign in to confirm you&#39;re not a bot')).toBe('bot check');
    expect(liveDiag(200, '{"isLiveContent":false}')).toBe('not live');
  });
  it('reads the feed live items (TV windows and the Home widget use this)', () => {
    const s = liveStreamsOf([{ kind: 'live', text: 'C-SPAN', url: 'https://www.youtube.com/watch?v=KHXsEA4Pg18' }, { kind: 'fed', text: 'Fed', url: 'https://x' }]);
    expect(s.find((x) => x.name === 'C-SPAN')?.src).toBe('https://www.youtube-nocookie.com/embed/KHXsEA4Pg18');
    expect(s.filter((x) => x.confirmed).length).toBe(1);
  });
});
