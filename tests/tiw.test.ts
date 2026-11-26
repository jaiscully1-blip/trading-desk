// Real DTCC files (downloaded 2026-11-26): quarterly single-name activity Q3 2026, the six-month Top 1,000 analysis
// (6 Mar to 28 Aug 2026), and the link snippets from dtcc.com/repository-otc-data.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { unzipFile } from '../api/_lib/research/cds';
import { parseQuarter, parseSixMonth, tiwKey, tiwLinks, xlsxRows } from '../shared/tiw';

const book = (f: string) => { const b = readFileSync(new URL(`./fixtures/${f}`, import.meta.url)); return xlsxRows(unzipFile(b, 'xl/worksheets/sheet1.xml'), unzipFile(b, 'xl/sharedStrings.xml')); };

describe('DTCC weekly activity files', () => {
  it('reads the quarterly file by its header names', () => {
    const q = parseQuarter(book('dtcc-tiw-quarter.xlsx'));
    expect(q.length).toBeGreaterThan(700);
    expect(q.find((x) => x.name === 'ADVANCED MICRO DEVICES, INC.')).toEqual({ name: 'ADVANCED MICRO DEVICES, INC.', region: 'AMERICAS', inIndex: true, dealers: 11, notionalDay: 100000000, tradesDay: 11 });
    expect(q.find((x) => x.name === 'ABBOTT LABORATORIES')?.inIndex).toBe(false);
  });
  it('reads the six-month file and compares the last 8 weeks with the average', () => {
    const s = parseSixMonth(book('dtcc-tiw-6month.xlsx'));
    expect(s.length).toBeGreaterThan(800);
    const cn = s.find((x) => x.name === "PEOPLE'S REPUBLIC OF CHINA")!;
    expect(cn).toMatchObject({ sector: 'GOVERNMENT', type: 'SOV', notionalWeek: 2182591409, tradesWeek: 82, notional8w: 8013660000, trades8w: 402 });
    expect(cn.recentVsAvg).toBe(0.46); // 8.01B / 8 weeks vs 2.18B a week on average
  });
  it('finds the newest files on the page, whatever their random ids', () => {
    const l = tiwLinks(readFileSync(new URL('./fixtures/dtcc-tiw-page.txt', import.meta.url), 'utf8'));
    expect(l.quarter?.url).toMatch(/Final-Single-Name-Q3-2026\.xlsx\/4c4df36c/);
    expect(l.quarter?.label).toBe('June 27, 2026 to September 26, 2026');
    expect(l.sixMonth?.url).toMatch(/Index-Roll-Report-06-Mar-26-through-28-Aug-26/);
  });
  it('matches the tape spelling to DTCC spelling', () => {
    expect(tiwKey('Federative Republic of Brazil')).toBe(tiwKey('FEDERATIVE REPUBLIC OF BRAZIL'));
    expect(tiwKey('COREWEAVE, INC')).toBe('COREWEAVE INC');
  });
});
