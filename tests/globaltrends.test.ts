// Real responses (2026-11-27) from Apple, Wikimedia, Steam, Kworb, Hugging Face, GitHub, SEC EDGAR and Product Hunt.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addRaises, appleTop, emptyDb, formdDoc, formdHits, ghRising, hfTrending, kworbTop, mergeNight, phFeed, prune, spreading, steamTop, wikiTop, type Item } from '../shared/globaltrends';

const fx = (f: string) => readFileSync(new URL(`./fixtures/gt/${f}`, import.meta.url), 'utf8');
const js = (f: string) => JSON.parse(fx(f));

describe('global trends: sources', () => {
  it('reads Apple top apps per country', () => {
    const a = appleTop(js('apple-kr.json'), 'kr', 'apps-free');
    expect(a.length).toBe(25);
    expect(a[0]).toMatchObject({ src: 'apps-free', where: 'kr', id: 'apple:6795790129', rank: 1, by: 'Pickle Company' });
  });
  it('reads Wikipedia top pages, dropping the front page and search pages', () => {
    const w = wikiTop(js('wiki-ko.json'), 'ko');
    expect(w[0].name).toBe('문화방송');
    expect(w.some((x) => /대문|검색/.test(x.name))).toBe(false);
    expect(w.every((x) => x.where === 'wiki:ko')).toBe(true);
    const en = wikiTop(js('wiki-en.json'), 'en');
    expect(en.some((x) => x.name === 'Main Page')).toBe(false);
  });
  it('reads Steam top sellers and Kworb Spotify charts', () => {
    const s = steamTop(js('steam-kr.json'), 'kr');
    expect(s[0]).toMatchObject({ id: 'steam:4435490', rank: 1 });
    const m = kworbTop(fx('kworb-kr.html'), 'kr');
    expect(m[0]).toMatchObject({ name: 'NEON', by: 'A2O', id: 'spotify:5PvLNQRNRj61y3CU4SFIY4', rank: 1 });
    expect(m.length).toBe(50);
  });
  it('reads Hugging Face, GitHub and Product Hunt (global lists)', () => {
    expect(hfTrending(js('hf.json'))[0]).toMatchObject({ id: 'hf:thinkingmachines/Inkling-2-Mini', where: 'world' });
    expect(ghRising(js('gh.json'))[0]).toMatchObject({ name: 'Marvisak/VIctory', where: 'world' });
    const p = phFeed(fx('ph.xml'));
    expect(p[0]).toMatchObject({ id: 'ph:1330866', name: 'Transept AI' });
    expect(p[0].note).toMatch(/^Translate your book/);
  });
  it('reads Form D: new filings only, then industry and amounts from the filing', () => {
    const h = formdHits(js('formd.json'));
    expect(h.length).toBeGreaterThan(0);
    expect(h.every((x) => /^\d+$/.test(x.cik))).toBe(true);
    const d = formdDoc(fx('formd-doc.xml'), { adsh: '0002166928-26-000001', cik: '2166928', date: '2026-11-25' })!;
    expect(d).toMatchObject({ name: 'Jerico Music LLC', industry: 'Other Technology', state: 'TX', offering: 350000, sold: 25000, yearInc: '2021', fund: false });
  });
});

describe('global trends: database', () => {
  const it1 = (where: string, rank: number, id = 'apple:1'): Item => ({ src: 'apps-free', where, id, name: 'Pickle', rank });
  it('keeps first / last seen per country and spots a spread', () => {
    let db = mergeNight(emptyDb(), [it1('kr', 5)], '2026-11-01');
    db = mergeNight(db, [it1('kr', 2)], '2026-11-02');
    db = mergeNight(db, [it1('kr', 1), it1('us', 40)], '2026-11-20');
    const s = db.items['apple:1'].seen;
    expect(s.kr).toMatchObject({ first: '2026-11-01', last: '2026-11-20', days: 3, best: 1 });
    expect(s.us).toMatchObject({ first: '2026-11-20', days: 1, best: 40 });
    const sp = spreading(db);
    expect(sp[0]).toMatchObject({ origin: 'kr', originFirst: '2026-11-01', later: [{ where: 'us', first: '2026-11-20', best: 40 }] });
  });
  it('the first night shows no spread (everything starts the same day)', () => {
    const db = mergeNight(emptyDb(), [it1('kr', 1), it1('us', 3)], '2026-11-27');
    expect(spreading(db)).toEqual([]);
  });
  it('the same night twice does not double count', () => {
    let db = mergeNight(emptyDb(), [it1('kr', 5)], '2026-11-01');
    db = mergeNight(db, [it1('kr', 3)], '2026-11-01');
    expect(db.items['apple:1'].seen.kr).toMatchObject({ days: 1, best: 3, r: [['2026-11-01', 3]] });
  });
  it('prunes things not seen for a long time, and old raises', () => {
    let db = mergeNight(emptyDb(), [it1('kr', 1)], '2026-01-01');
    db = addRaises(db, [{ adsh: 'a', cik: '1', name: 'X', industry: '', state: '', offering: null, sold: null, yearInc: '', date: '2026-01-01', fund: false }]);
    db = prune(db, '2026-11-27');
    expect(Object.keys(db.items)).toHaveLength(0);
    expect(db.raises).toHaveLength(0);
  });
});
