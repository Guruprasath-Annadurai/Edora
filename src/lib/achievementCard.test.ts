import { describe, it, expect } from 'vitest';
import { streakMilestoneCard, levelMilestoneCard, mockScoreCard } from './achievementCard';

describe('streakMilestoneCard', () => {
  it('fires on milestone days', () => {
    for (const days of [7, 14, 30, 50, 100, 365]) {
      const card = streakMilestoneCard(days, 'Test User');
      expect(card).not.toBeNull();
      expect(card!.value).toBe(String(days));
    }
  });

  it('does not fire on non-milestone days', () => {
    for (const days of [1, 5, 8, 29, 31, 99]) {
      expect(streakMilestoneCard(days, 'Test User')).toBeNull();
    }
  });
});

describe('levelMilestoneCard', () => {
  it('fires every 5 levels', () => {
    expect(levelMilestoneCard(5, 'Test')).not.toBeNull();
    expect(levelMilestoneCard(10, 'Test')).not.toBeNull();
    expect(levelMilestoneCard(25, 'Test')).not.toBeNull();
  });

  it('does not fire on non-multiples of 5', () => {
    expect(levelMilestoneCard(3, 'Test')).toBeNull();
    expect(levelMilestoneCard(7, 'Test')).toBeNull();
  });

  it('does not fire at level 0', () => {
    expect(levelMilestoneCard(0, 'Test')).toBeNull();
  });
});

describe('mockScoreCard', () => {
  it('fires for strong scores (>=70%)', () => {
    expect(mockScoreCard(280, 300, 'JEE Main', 'Test')).not.toBeNull();
    expect(mockScoreCard(70, 100, 'JEE Main', 'Test')).not.toBeNull();
  });

  it('does not fire for weak scores (<70%)', () => {
    expect(mockScoreCard(50, 100, 'JEE Main', 'Test')).toBeNull();
    expect(mockScoreCard(0, 100, 'JEE Main', 'Test')).toBeNull();
  });
});
