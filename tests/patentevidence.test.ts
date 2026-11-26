import { describe, expect, it } from 'vitest';
import { candidateSentences, checkRollout, gpAbstract, gpId, quoteFound, titleWords } from '../shared/patentEvidence';

const TENK = 'Our mRNA platform uses lipid nanoparticles to deliver mRNA into cells. We sell Spikevax, our COVID-19 vaccine, in the United States and Europe. Our RSV vaccine candidate is in Phase 3 clinical trials. We lease office space in Cambridge, Massachusetts for our headquarters and labs.';

describe('rollout evidence', () => {
  it('pulls content words from a title', () => {
    expect(titleWords('Lipid nanoparticle compositions and methods of using same')).toEqual(['lipid', 'nanoparticle']);
  });
  it('keeps only 10-K sentences that share words with a title', () => {
    const s = candidateSentences(TENK, ['Lipid nanoparticle delivery', 'Respiratory syncytial virus (RSV) vaccine']);
    expect(s).toContain('Our mRNA platform uses lipid nanoparticles to deliver mRNA into cells.');
    expect(s.some((x) => x.includes('office space'))).toBe(false);
  });
  it('checks quotes against the 10-K and drops invented ones', () => {
    expect(quoteFound('our RSV vaccine candidate is in Phase 3 clinical trials', TENK)).toBe(true);
    const r = checkRollout({ items: [
      { i: 0, verdict: 'in_products', quote: 'Our mRNA platform uses lipid nanoparticles to deliver mRNA into cells.' },
      { i: 1, verdict: 'in_products', quote: 'We sell our RSV vaccine in 40 countries.' },
      { i: 7, verdict: 'in_products', quote: 'x' },
    ] }, 3, TENK);
    expect(r[0]).toMatchObject({ verdict: 'in_products', dropped: false });
    expect(r[1]).toEqual({ verdict: 'no_evidence', quote: '', dropped: true });
    expect(r[2]).toEqual({ verdict: 'no_evidence', quote: '', dropped: false });
  });
  it('builds Google Patents ids and reads the abstract', () => {
    expect(gpId('12345678', null)).toBe('US12345678');
    expect(gpId('RE46284', null)).toBe('USRE46284');
    expect(gpId(null, 'US20240123456A1')).toBe('US20240123456A1');
    expect(gpId(null, '20240123456A1')).toBe('US20240123456A1');
    expect(gpId(null, null)).toBeNull();
    expect(gpAbstract('<meta name="description" content="\n  A frequency modulated laser detection system includes an array &amp; more.\n">')).toBe('A frequency modulated laser detection system includes an array & more.');
  });
});
