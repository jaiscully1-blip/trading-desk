import { describe, expect, it, vi } from 'vitest';

class Mem { m = new Map<string, string>(); get length() { return this.m.size; } key(i: number) { return [...this.m.keys()][i] ?? null; } getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, String(v)); } removeItem(k: string) { this.m.delete(k); } clear() { this.m.clear(); } }
const ls = new Mem();
vi.stubGlobal('localStorage', ls);
vi.stubGlobal('location', { reload: vi.fn(), host: 'trading-desk-blot.vercel.app' });

describe('desk file: moving a desk between links and devices', () => {
  it('exports only this account, never the desk password; import replaces the desk and keeps the account', async () => {
    ls.clear();
    // first account (old desk adopted, prefix "td.") with a friend's account beside it
    ls.setItem('td.accounts', JSON.stringify([{ id: 'a1', name: 'Jai', color: '#000', salt: 's', hash: 'h', owner: true, legacy: true, createdAt: 1 }, { id: 'b2', name: 'Sam', color: '#111', salt: 's', hash: 'h', owner: false, legacy: false, createdAt: 2 }]));
    ls.setItem('td.session', '"a1"');
    ls.setItem('td.boards', '{"NVDA":"watching"}');
    ls.setItem('td.deskKey', '"secret"');
    ls.setItem('td.pinFails.a1', '{"n":1}');
    ls.setItem('td.u.b2.boards', '{"AMD":"watching"}');
    vi.resetModules();
    const D = await import('../src/lib/deskfile');
    const f = await D.exportDesk();
    expect(f.local).toEqual({ boards: '{"NVDA":"watching"}' });
    expect(JSON.stringify(f)).not.toContain('secret');
    expect(f.from).toBe('trading-desk-blot.vercel.app');

    // on another link: a fresh account loads the file
    ls.clear();
    ls.setItem('td.accounts', JSON.stringify([{ id: 'c3', name: 'Jai', color: '#000', salt: 's', hash: 'h', owner: false, legacy: false, createdAt: 3 }]));
    ls.setItem('td.session', '"c3"');
    ls.setItem('td.u.c3.boards', '{"SPY":"watching"}');
    ls.setItem('td.u.c3.deskKey', '"keep-me"');
    vi.resetModules();
    const D2 = await import('../src/lib/deskfile');
    await D2.importDesk(D2.parseDeskFile(JSON.stringify(f)));
    expect(ls.getItem('td.u.c3.boards')).toBe('{"NVDA":"watching"}');
    expect(ls.getItem('td.u.c3.deskKey')).toBe('"keep-me"');
    expect(ls.getItem('td.session')).toBe('"c3"');
  });
  it('rejects files that are not desk files, and strips account keys from them', async () => {
    const { parseDeskFile } = await import('../src/lib/deskfile');
    expect(() => parseDeskFile('not json')).toThrow();
    expect(() => parseDeskFile('{"app":"other"}')).toThrow();
    const f = parseDeskFile(JSON.stringify({ app: 'trade-desk', v: 1, at: '2026-11-12', from: 'x', name: 'J', local: { boards: '{}', session: '"evil"', deskKey: '"x"', 'u.zz.boards': '{}' } }));
    expect(Object.keys(f.local)).toEqual(['boards']);
  });
});
