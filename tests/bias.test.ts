import { describe, expect, it } from 'vitest';
import { isPolitical, leanColor, leanOf, outletLean, titleKey } from '../shared/bias';

describe('news political lean', () => {
  it('finds an outlet by domain or by source name', () => {
    expect(outletLean('Reuters', 'https://www.reuters.com/markets/x')?.lean).toBe('C');
    expect(outletLean('Fox Business', '')?.lean).toBe('LR');
    expect(outletLean('Some Unknown Blog', 'https://nope.example/x')).toBeNull();
  });
  it('plain market news is not political; election and tariff stories are', () => {
    expect(isPolitical('Nvidia beats earnings as data center sales jump')).toBe(false);
    expect(isPolitical('Senate Republicans push tariff bill ahead of election')).toBe(true);
  });
  it('colors: neutral = gray, left = blue, right = red; the article read beats the outlet for political stories', () => {
    expect(leanColor(leanOf('Reuters', '', 'Chip maker raises guidance'))).toBe('gray');
    expect(leanColor(leanOf('Fox Business', '', 'Chip maker raises guidance'))).toBe('red');
    expect(leanColor(leanOf('Reuters', '', 'Senate passes tariff bill', undefined, { lean: 'left', why: 'x' }))).toBe('blue');
    expect(leanColor(leanOf('Unknown', '', 'Chip maker raises guidance'))).toBeNull();
    // the AI read is ignored for non-political stories
    expect(leanOf('Reuters', '', 'Chip maker raises guidance', undefined, { lean: 'right', why: 'x' }).article).toBeUndefined();
  });
  it('title keys are stable and whitespace/case-insensitive', () => {
    expect(titleKey('Hello  World')).toBe(titleKey(' hello world '));
  });
});
