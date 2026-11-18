import { describe, expect, it } from 'vitest';
import { shortName } from '../src/components/Linked';

describe('company names in text', () => {
  it('makes short, safe names', () => {
    expect(shortName('NVIDIA Corp')).toBe('NVIDIA');
    expect(shortName('Apple Inc.')).toBe('Apple');
    expect(shortName('General Motors Company')).toBe('General Motors');
    expect(shortName('Bank of America Corporation')).toBe('Bank of America');
    expect(shortName('Block, Inc.')).toBeNull();
    expect(shortName('The Home Depot, Inc.')).toBe('Home Depot');
    expect(shortName('Texas Instruments Incorporated')).toBe('Texas Instruments');
  });
});
