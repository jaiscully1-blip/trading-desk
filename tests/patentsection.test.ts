import { describe, expect, it } from 'vitest';
import { PATENT_ALIASES, aliasNames, ex21FromIndex, coreToken, countBody, cpcArea, exhibit21Names, grantTrend, lastQuarters, ownerQ, parseRows, statusKind, techMix } from '../shared/patents';

describe('patent name matching', () => {
  it('finds subsidiaries that carry the core name (Moderna -> ModernaTX)', () => {
    expect(coreToken('Moderna, Inc.')).toBe('Moderna');
    expect(aliasNames('Moderna, Inc.', ['ModernaTX, Inc.', 'Moderna Biotech Spain, S.L.', 'Acme Holdings LLC'])).toEqual(['Moderna', 'ModernaTX', 'Moderna Biotech Spain, S.L.']);
  });
  it('finds Exhibit 21 by document type when the file name does not say so', () => {
    const html = '<tr><td scope="row">3</td><td scope="row">EX-21.1</td><td scope="row"><a href="/Archives/edgar/data/1045810/000104581026000021/subsidiariesofregistrantfy.htm">x</a></td></tr>';
    expect(ex21FromIndex(html)).toBe('/Archives/edgar/data/1045810/000104581026000021/subsidiariesofregistrantfy.htm');
    expect(ex21FromIndex('<td>EX-31.1</td><td><a href="/a.htm">a</a></td>')).toBeNull();
  });
  it('adds known aliases right after the company name', () => {
    expect(aliasNames('Broadcom Inc.', ['Broadcom International Pte. Ltd.'], PATENT_ALIASES.AVGO)).toEqual(['Broadcom', 'Avago Technologies', 'Broadcom International']);
  });
  it('uses the whole name when the first word is generic', () => {
    expect(coreToken('Advanced Micro Devices, Inc.')).toBe('Advanced Micro Devices');
    expect(aliasNames('Advanced Micro Devices, Inc.', ['Advanced Analytics LLC', 'ATI Technologies ULC'])).toEqual(['Advanced Micro Devices']);
  });
  it('cuts the jurisdiction off flattened table rows', () => {
    expect(exhibit21Names('ModernaTX, Inc. Delaware\nModerna Switzerland GmbH Switzerland\nModerna Biotech Spain, S.L. Spain')).toEqual(['ModernaTX, Inc.', 'Moderna Switzerland GmbH', 'Moderna Biotech Spain, S.L.']);
  });
  it('reads entity lines from an Exhibit 21', () => {
    expect(exhibit21Names('Name   Jurisdiction\nModernaTX, Inc.   Delaware\nModerna Switzerland GmbH   Switzerland\nSome heading')).toEqual(['ModernaTX, Inc.', 'Moderna Switzerland GmbH']);
  });
  it('builds an applicant-or-assignee query and strips quotes', () => {
    expect(ownerQ(['A"B'])).toBe('applicationMetaData.applicantBag.applicantNameText:"AB" OR assignmentBag.assigneeBag.assigneeNameText:"AB"');
    expect(countBody('q', 'granted', '2025-01-01', '2025-03-31').rangeFilters[0].field).toBe('applicationMetaData.grantDate');
    expect(countBody('q', 'filed', '2025-01-01', '2025-03-31').rangeFilters[0].field).toBe('applicationMetaData.filingDate');
  });
});

describe('quarters, status, areas, trend', () => {
  it('lists the last 20 quarters, oldest first, current one not done', () => {
    const qs = lastQuarters(new Date('2026-11-25T12:00:00Z'));
    expect(qs).toHaveLength(20);
    expect(qs[19]).toMatchObject({ label: '2026 Q4', from: '2026-10-01', to: '2026-12-31', done: false });
    expect(qs[18]).toMatchObject({ label: '2026 Q3', to: '2026-09-30', done: true });
    expect(qs[0].label).toBe('2022 Q1');
  });
  it('classifies status text', () => {
    expect(statusKind('Patented Case')).toBe('granted');
    expect(statusKind('Patent Expired Due to NonPayment of Maintenance Fees Under 37 CFR 1.362')).toBe('expired');
    expect(statusKind('Abandoned  --  Failure to Respond to an Office Action')).toBe('abandoned');
    expect(statusKind('Non Final Action Mailed')).toBe('pending');
  });
  it('names tech areas', () => {
    expect(cpcArea('G06N 3/08')).toBe('AI and machine learning');
    expect(cpcArea('C12N15/11')).toBe('Biotech, genes, mRNA');
    expect(cpcArea('F02B 37/00')).toBe('Mechanical, engines, heating');
  });
  it('parses rows and finds a new tech area', () => {
    const rows = parseRows({ patentFileWrapperDataBag: [
      { applicationNumberText: '1', applicationMetaData: { inventionTitle: 'X', filingDate: '2026-02-01', applicationStatusDescriptionText: 'Docketed New Case - Ready for Examination', cpcClassificationBag: ['B25J 9/16'] } },
      { applicationNumberText: '2', applicationMetaData: { inventionTitle: 'Y', filingDate: '2024-02-01', grantDate: '2025-05-01', patentNumber: '12345678', applicationStatusDescriptionText: 'Patented Case', cpcClassificationBag: ['G06N 3/04'] } },
    ] });
    expect(rows[1]).toMatchObject({ kind: 'granted', patentNo: '12345678', areas: ['AI and machine learning'] });
    expect(techMix(rows, 2026).find((m) => m.area === 'Robotics')?.isNew).toBe(true);
  });
  it('compares the last four finished quarters with the four before', () => {
    const qs = Array.from({ length: 9 }, (_, i) => ({ done: i < 8, granted: i < 4 ? 10 : 15 }));
    expect(grantTrend(qs)).toMatchObject({ last: 60, prior: 40, pct: 50, word: 'speeding up' });
    expect(grantTrend(qs.slice(0, 5))).toBeNull();
  });
});

describe('name clean-up from real nightly run 2026-11-26', () => {
  it('drops a dangling "&" and table fragments', async () => {
    const { applicantName, exhibit21Names, aliasNames } = await import('../shared/patents');
    expect(applicantName('ELI LILLY & Co')).toBe('ELI LILLY');
    expect(applicantName('Vertex Holdings, Inc., a Delaware corporation')).toBe('Vertex'); // 'Holdings' is a suffix the cleaner already drops
    expect(exhibit21Names('(2) a subsidiary of Vertex Pharmaceuticals Incorporated\nVertex Pharmaceuticals (Europe) Limited England')).toEqual(['Vertex Pharmaceuticals (Europe) Limited']);
    expect(aliasNames('Eli Lilly & Co', ['Eli Lilly Asia, Inc.'])).toEqual(['Eli Lilly', 'Eli Lilly Asia']);
  });
});
