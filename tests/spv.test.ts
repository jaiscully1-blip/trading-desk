import { describe, expect, it } from 'vitest';
import { spvSentences, vehicleNames, vieFacts } from '../shared/spv';

describe('SPVs, SPEs and VIEs', () => {
  it('takes every VIE concept with the SEC label, latest value and a year earlier', () => {
    const j = { facts: { 'us-gaap': {
      VariableInterestEntityConsolidatedCarryingAmountAssets: { label: 'Variable Interest Entity, Consolidated, Carrying Amount, Assets', units: { USD: [
        { end: '2024-12-31', val: 90e9, form: '10-K', filed: '2025-02-14' },
        { end: '2025-12-31', val: 100e9, form: '10-K', filed: '2026-02-13' },
        { end: '2025-12-31', val: 1, form: '8-K', filed: '2026-01-15' },
      ] } },
      VariableInterestEntityMaximumLossExposureAmount: { label: 'Variable Interest Entity, Maximum Loss Exposure, Amount', units: { USD: [{ end: '2025-09-30', val: 5e9, form: '10-Q' }] } },
      Revenues: { label: 'Revenues', units: { USD: [{ end: '2025-12-31', val: 1, form: '10-K' }] } },
    } } };
    const f = vieFacts(j);
    expect(f.map((x) => x.concept)).toEqual(['VariableInterestEntityConsolidatedCarryingAmountAssets', 'VariableInterestEntityMaximumLossExposureAmount']);
    expect(f[0]).toMatchObject({ value: 100e9, prior: 90e9, end: '2025-12-31', form: '10-K', label: 'Variable Interest Entity, Consolidated, Carrying Amount, Assets' });
    expect(f[1].prior).toBeNull();
  });
  it('hides concepts the company stopped using', () => {
    const j = { facts: { 'us-gaap': {
      VariableInterestEntityConsolidatedCarryingAmountAssets: { label: 'VIE, Consolidated, Assets (Deprecated 2020-01-31)', units: { USD: [{ end: '2019-12-31', val: 35e9, form: '10-K' }] } },
      VariableInterestEntityReportingEntityInvolvementMaximumLossExposureAmount: { label: 'VIE, Maximum Loss Exposure', units: { USD: [{ end: '2023-09-30', val: 6e9, form: '10-Q' }] } },
    } } };
    const f = vieFacts(j, '2024-06-30');
    expect(f).toHaveLength(0);
    expect(f.hidden).toBe(2);
  });
  it('drops page headers and glossary lines, substance first', () => {
    const t = 'Financial Statements and Supplementary Data—Note 16—Income Taxes. 73 Capital One Financial Corporation (COF) Table of Contents off-balance sheet arrangements are described. '
      + 'For purposes of this report, “Ford,” the “Company,” “we,” “our,” “VIE” and similar references mean Ford Motor Company and its VIEs. '
      + 'We have relationships with variable interest entities in the ordinary course of our business operations. '
      + 'The consolidated VIEs held $42 billion of auto loans at year end that back our securitization debt.';
    const g = spvSentences(t);
    expect(g.find((x) => x.topic.startsWith('Off-balance'))).toBeUndefined();
    expect(g[0].sentences).toEqual(['The consolidated VIEs held $42 billion of auto loans at year end that back our securitization debt.', 'We have relationships with variable interest entities in the ordinary course of our business operations.']);
  });
  it('quotes the filing sentences by topic and skips boilerplate', () => {
    const t = 'We consolidate certain variable interest entities that hold auto loans used in our securitization programs. '
      + 'Our forward-looking statements about VIEs may differ materially from actual results in the future periods. '
      + 'We sell receivables to special purpose entities that issue asset-backed securities to investors in the market. '
      + 'We do not have any off-balance sheet arrangements that have or are reasonably likely to have a material effect.';
    const g = spvSentences(t);
    expect(g.map((x) => x.topic)).toEqual(['Variable interest entities (VIEs)', 'Special purpose entities / vehicles', 'Securitizations', 'Off-balance-sheet arrangements']);
    expect(g[0].sentences).toEqual(['We consolidate certain variable interest entities that hold auto loans used in our securitization programs.']);
  });
  it('picks subsidiary names that look like financing vehicles', () => {
    expect(vehicleNames(['Ford Credit Auto Receivables Two LLC', 'Ford Motor Company of Canada, Limited', 'CAB East LLC', 'Ford Credit Floorplan Master Owner Trust A', 'Tesla Energy Operations, Inc.']))
      .toEqual(['Ford Credit Auto Receivables Two LLC', 'Ford Credit Floorplan Master Owner Trust A']);
    expect(vehicleNames(['Ford Credit Auto Owner Trust 2023-REV1 Delaware, U.S.A.'])).toEqual(['Ford Credit Auto Owner Trust 2023-REV1']);
  });
});
