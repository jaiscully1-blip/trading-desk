import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as research } from '../api/research';
import { _clearCache, _resetLimits, noteError, noteOk } from '../api/_lib/core';
import { PROVIDER_INFO, stateOf } from '../shared/providers';

const base = { keyed: true, hasKey: true, min: { used: 0, limit: 8 }, day: { used: 0, limit: 800 }, health: {}, now: 1_000_000_000 };

describe('provider status rule', () => {
  it('needs a key when a keyed provider has none', () => {
    expect(stateOf({ ...base, hasKey: false })).toBe('no-key');
    expect(stateOf({ ...base, keyed: false, hasKey: true })).toBe('idle');
  });
  it('limited when a budget is nearly spent or the last error was a rate limit', () => {
    expect(stateOf({ ...base, min: { used: 8, limit: 8 } })).toBe('limited');
    expect(stateOf({ ...base, day: { used: 760, limit: 800 } })).toBe('limited');
    expect(stateOf({ ...base, health: { lastErrorAt: base.now - 60_000, lastError: 'twelvedata: HTTP 429 rate limited' } })).toBe('limited');
  });
  it('failing when it errored recently and has not worked since; working when it worked after', () => {
    expect(stateOf({ ...base, health: { lastErrorAt: base.now - 60_000, lastError: 'timeout' } })).toBe('error');
    expect(stateOf({ ...base, health: { lastErrorAt: base.now - 120_000, lastError: 'timeout', lastOk: base.now - 30_000 } })).toBe('ok');
  });
  it('an old error is forgotten', () => {
    expect(stateOf({ ...base, health: { lastErrorAt: base.now - 3_600_000, lastError: 'timeout' } })).toBe('idle');
  });
  it('every provider the server knows has a label, what it feeds, and a backup line', () => {
    for (const k of ['twelvedata', 'finnhub', 'yahoo', 'nasdaq', 'fred', 'cboe', 'alpaca']) { expect(PROVIDER_INFO[k].label).toBeTruthy(); expect(PROVIDER_INFO[k].feeds).toBeTruthy(); expect(PROVIDER_INFO[k].fallback).toBeTruthy(); }
  });
});

describe('/api/research?fn=status', () => {
  beforeEach(() => { _clearCache(); _resetLimits(); process.env.FINNHUB_API_KEY = 'fh-key'; delete process.env.TWELVEDATA_API_KEY; });
  afterEach(() => vi.unstubAllGlobals());
  it('lists every provider with its state and never leaks a key', async () => {
    noteOk('finnhub'); noteError('yahoo', 'yahoo: HTTP 429 rate limited');
    const j = await (await research(new Request('http://x/api/research?fn=status'))).json();
    const by = Object.fromEntries(j.rows.map((r: { id: string }) => [r.id, r]));
    expect(j.rows.length).toBeGreaterThan(18);
    expect(by.twelvedata.state).toBe('no-key');
    expect(by.finnhub.state).toBe('ok');
    expect(by.yahoo.state).toBe('limited');
    expect(by.yahoo.unofficial).toBe(true);
    expect(JSON.stringify(j)).not.toContain('fh-key');
  });
});
