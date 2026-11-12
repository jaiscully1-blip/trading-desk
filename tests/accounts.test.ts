import { beforeEach, describe, expect, it, vi } from 'vitest';

// node has no localStorage or location: a small in-memory stand-in
class Mem { m = new Map<string, string>(); get length() { return this.m.size; } key(i: number) { return [...this.m.keys()][i] ?? null; } getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, String(v)); } removeItem(k: string) { this.m.delete(k); } clear() { this.m.clear(); } }
const ls = new Mem();
vi.stubGlobal('localStorage', ls);
vi.stubGlobal('location', { reload: vi.fn() });

const fresh = async () => { vi.resetModules(); return import('../src/lib/accounts'); };

describe('desk accounts', () => {
  beforeEach(() => ls.clear());

  it('the first account in a browser with an old desk adopts it; the owner is the one with the desk password', async () => {
    ls.setItem('td.page2', '"home"');
    ls.setItem('td.deskKey', '"secret"');
    const A = await fresh();
    expect(A.hasLegacyDesk()).toBe(true);
    const jai = await A.createAccount({ name: 'Jai', color: A.COLORS[0], pin: '1234' });
    expect(jai.legacy).toBe(true);
    expect(jai.owner).toBe(true);
    expect(A.prefixFor(jai)).toBe('td.');
    expect(A.hasLegacyDesk()).toBe(false);

    const friend = await A.createAccount({ name: 'Marcus', color: A.COLORS[1], pin: '987654' });
    expect(friend.legacy).toBe(false);
    expect(friend.owner).toBe(false);
    expect(A.prefixFor(friend)).toBe(`td.u.${friend.id}.`);
    expect(friend.hash).not.toContain('987654');
  });

  it('a fresh device gets a fresh desk, and no account is the owner without the password', async () => {
    const A = await fresh();
    expect(A.hasLegacyDesk()).toBe(false);
    const a = await A.createAccount({ name: 'Dev', color: A.COLORS[2], pin: '4321' });
    expect(a.legacy).toBe(false);
    expect(a.owner).toBe(false);
  });

  it('PINs: 4 to 6 digits, names unique, wrong tries lock the account', async () => {
    const A = await fresh();
    await expect(A.createAccount({ name: 'X', color: '#000', pin: '123' })).rejects.toThrow(/4 to 6/);
    await expect(A.createAccount({ name: 'X', color: '#000', pin: '1234567' })).rejects.toThrow(/4 to 6/);
    const a = await A.createAccount({ name: 'Sam', color: '#000', pin: '2468' });
    expect(A.validName('sam')).toMatch(/taken/);
    expect(await A.checkPin(a.id, '2468')).toBe('ok');
    for (let i = 0; i < 4; i++) expect(await A.checkPin(a.id, '0000')).toBe('wrong');
    expect(await A.checkPin(a.id, '0000')).toBe('locked');
    expect(await A.checkPin(a.id, '2468')).toBe('locked'); // even the right PIN waits out the minute
    expect(A.lockedFor(a.id)).toBeGreaterThan(0);
  });

  it('signing in is remembered: the session picks the account and its storage prefix on the next load', async () => {
    let A = await fresh();
    const a = await A.createAccount({ name: 'Lee', color: '#000', pin: '1111' });
    expect(A.currentAccount()).toBeNull();
    A.enter(a.id);
    A = await fresh();
    expect(A.currentAccount()?.id).toBe(a.id);
    expect(A.storagePrefix()).toBe(`td.u.${a.id}.`);
    expect(A.isOwner()).toBe(false);
    A.leave('new');
    A = await fresh();
    expect(A.currentAccount()).toBeNull();
    expect(A.gateNext()).toBe('new');
  });

  it('owner unlock marks the account and keeps the desk password inside that account only', async () => {
    const A = await fresh();
    const a = await A.createAccount({ name: 'Jai', color: '#000', pin: '1234' });
    A.makeOwner(a, 'pw');
    expect(A.listAccounts()[0].owner).toBe(true);
    expect(ls.getItem(`td.u.${a.id}.deskKey`)).toBe('"pw"');
    expect(ls.getItem('td.deskKey')).toBeNull();
  });
});
