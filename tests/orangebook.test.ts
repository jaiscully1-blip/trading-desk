import { describe, expect, it } from 'vitest';
import { companyDrugs, fdaIndex, obDate, parseOrangeBook, patentKey } from '../shared/orangeBook';

const PAT = `Appl_Type~Appl_No~Product_No~Patent_No~Patent_Expire_Date_Text~Drug_Substance_Flag~Drug_Product_Flag~Patent_Use_Code~Delist_Flag~Submission_Date
N~203188~001~8410274~Mar 26, 2027~Y~Y~U-1~~
N~203188~001~8410274~Sep 26, 2027~Y~Y~U-1~~
N~203188~001~RE46284~Jun 11, 2031~~Y~~~
N~203188~001~9999999~Jan 1, 2030~~~~Y~
N~999999~001~1234567~Jan 1, 2030~~~~~`;
const PROD = `Ingredient~DF;Route~Trade_Name~Applicant~Strength~Appl_Type~Appl_No~Product_No~TE_Code~Approval_Date~RLD~RS~Type~Applicant_Full_Name
IVACAFTOR~TABLET;ORAL~KALYDECO~VERTEX PHARMS~150MG~N~203188~001~~Jan 31, 2012~Yes~Yes~RX~VERTEX PHARMACEUTICALS INC
IVACAFTOR~TABLET;ORAL~IVACAFTOR~SOMEGENERIC~150MG~A~211111~001~AB~Jan 1, 2025~No~No~RX~SOME GENERIC CO`;

describe('Orange Book', () => {
  it('reads FDA dates and patent numbers', () => {
    expect(obDate('Aug 24, 2026')).toBe('2026-08-24');
    expect(obDate('not a date')).toBeNull();
    expect(patentKey('RE46,284')).toBe('RE46284');
  });
  it('keeps brand drugs, drops delisted patents and unknown products, keeps the latest expiry', () => {
    const f = parseOrangeBook(PAT, PROD, '2026-11-25');
    expect(f.rows).toHaveLength(2);
    expect(f.rows.find((r) => r.p === '8410274')).toMatchObject({ e: '2027-09-26', t: 'KALYDECO', a: 'VERTEX PHARMACEUTICALS INC' });
    expect(f.rows.some((r) => r.p === '9999999')).toBe(false);
  });
  it('groups a company\'s drugs with their patents, soonest final expiry first', () => {
    const f = parseOrangeBook(PAT, PROD, '2026-11-25');
    const d = companyDrugs(f, ['Vertex Pharmaceuticals']);
    expect(d).toEqual([{ trade: 'KALYDECO', ingredient: 'IVACAFTOR', applicant: 'VERTEX PHARMACEUTICALS INC', patents: [{ no: '8410274', expires: '2027-09-26' }, { no: 'RE46284', expires: '2031-06-11' }], lastExpiry: '2031-06-11' }]);
    expect(companyDrugs(f, ['Moderna'])).toEqual([]);
    expect(fdaIndex(f).get('RE46284')).toEqual(['KALYDECO']);
  });
});
