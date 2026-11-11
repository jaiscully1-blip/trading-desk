import { describe, expect, it } from 'vitest';
import { searchCompanies } from '../shared/companySearch';

const L = [
  { sym: 'KO', name: 'Coca-Cola Company (The)' }, { sym: 'RKLB', name: 'Rocket Lab Corp' }, { sym: 'NVDA', name: 'Nvidia' },
  { sym: 'NVR', name: 'NVR, Inc.' }, { sym: 'BRK.B', name: 'Berkshire Hathaway' }, { sym: 'ROK', name: 'Rockwell Automation' },
];
describe('company search', () => {
  it('ticker first, then names, typo-tolerant', () => {
    expect(searchCompanies('nvda', L)[0].sym).toBe('NVDA');
    expect(searchCompanies('NV', L).map((h) => h.sym)).toEqual(['NVR', 'NVDA']);
    expect(searchCompanies('rocket', L)[0].sym).toBe('RKLB');
    expect(searchCompanies('coca', L)[0].sym).toBe('KO');
    expect(searchCompanies('berkshire', L)[0].sym).toBe('BRK.B');
    expect(searchCompanies('rockwel', L)[0].sym).toBe('ROK');
    expect(searchCompanies('zzzz', L)).toEqual([]);
  });
});
