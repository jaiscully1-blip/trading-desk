import { describe, expect, it } from 'vitest';
(globalThis as any).location = { origin: 'https://desk.test' };
const { sharedKey } = await import('../src/lib/fetchCache');

describe('shared request layer', () => {
  it('shares only plain GETs to the desk API', () => {
    expect(sharedKey('/api/quotes?symbols=SPY')).toBe('/api/quotes?symbols=SPY');
    expect(sharedKey('/api/research?fn=bars&symbol=SPY&tf=1d')).toBe('/api/research?fn=bars&symbol=SPY&tf=1d');
    expect(sharedKey('/api/quotes', { method: 'POST', body: '{}' })).toBeNull();
    expect(sharedKey('/api/webull-order')).toBeNull();
    expect(sharedKey('/api/research?fn=webull&x=1')).toBeNull();
    expect(sharedKey('https://example.com/api/quotes')).toBeNull();
    expect(sharedKey('/assets/x.js')).toBeNull();
  });
});
