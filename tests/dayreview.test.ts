import { describe, expect, it } from 'vitest';
import { reviewGrade } from '../src/lib/dayReview';

describe('end-of-day review grade', () => {
  const best = { plan: 'Every trade', risk: 'Yes, all of them', state: 'Calm, focused', stop: 'Yes' };
  const worst = { plan: 'None', risk: 'Moved or ignored stops', state: 'FOMO or revenge', stop: 'Kept going' };
  it('weights the answers to a score out of 100', () => {
    expect(reviewGrade(best, -100)).toMatchObject({ score: 100, grade: 'A+' });
    expect(reviewGrade(worst, -100)).toMatchObject({ score: 0, grade: 'F' });
  });
  it('a green day is at least B+', () => {
    expect(reviewGrade(worst, 6333).grade).toBe('B+');
    expect(reviewGrade(best, 6333).grade).toBe('A+');
  });
});
