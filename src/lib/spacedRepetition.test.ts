import { describe, it, expect } from 'vitest';
import { sm2, tapToQuality, isDue, daysUntilDue } from './spacedRepetition';
import type { SRCard } from './spacedRepetition';

describe('sm2', () => {
  it('resets repetitions and interval on failure (quality < 3)', () => {
    const result = sm2(1, 2.5, 10, 3);
    expect(result.interval).toBe(1);
    expect(result.repetitions).toBe(0);
  });

  it('first success sets interval to 1 day', () => {
    const result = sm2(4, 2.5, 0, 0);
    expect(result.interval).toBe(1);
    expect(result.repetitions).toBe(1);
  });

  it('second success sets interval to 6 days', () => {
    const result = sm2(4, 2.5, 1, 1);
    expect(result.interval).toBe(6);
    expect(result.repetitions).toBe(2);
  });

  it('subsequent successes multiply interval by easiness factor', () => {
    const result = sm2(5, 2.5, 6, 2);
    expect(result.interval).toBe(Math.round(6 * result.ef));
    expect(result.repetitions).toBe(3);
  });

  it('easiness factor never drops below 1.3', () => {
    let ef = 1.3;
    for (let i = 0; i < 20; i++) {
      ef = sm2(0, ef, 1, 0).ef;
    }
    expect(ef).toBeGreaterThanOrEqual(1.3);
  });

  it('clamps out-of-range quality values', () => {
    const high = sm2(99, 2.5, 1, 1);
    const low  = sm2(-5, 2.5, 1, 1);
    expect(high.repetitions).toBe(2); // treated as quality 5 (success)
    expect(low.repetitions).toBe(0);  // treated as quality 0 (failure)
  });
});

describe('tapToQuality', () => {
  it('maps difficulty taps to SM-2 quality scores', () => {
    expect(tapToQuality('easy')).toBe(5);
    expect(tapToQuality('good')).toBe(4);
    expect(tapToQuality('hard')).toBe(3);
    expect(tapToQuality('again')).toBe(1);
  });
});

function makeCard(nextReviewDate: string): SRCard {
  return {
    id: '1', user_id: 'u1', subject: 'Physics', topic: 'Motion',
    source_type: 'manual', source_id: null, front: 'Q', back: 'A',
    easiness_factor: 2.5, interval_days: 1, repetitions: 0,
    last_quality: null, next_review_date: nextReviewDate, last_reviewed_at: null,
    total_reviews: 0, correct_reviews: 0, created_at: new Date().toISOString(),
  };
}

describe('isDue / daysUntilDue', () => {
  it('treats past due dates as due', () => {
    expect(isDue(makeCard('2020-01-01'))).toBe(true);
  });

  it('treats future due dates as not due', () => {
    const future = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    expect(isDue(makeCard(future))).toBe(false);
  });
});
