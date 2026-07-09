import { describe, it, expect } from 'vitest';
import { nextDifficulty, masteryColour, masteryLabel } from './adaptiveDifficulty';

describe('nextDifficulty', () => {
  it('levels up after 3+ consecutive correct with high mastery', () => {
    const level = nextDifficulty({ difficulty_level: 2, mastery_score: 0.85, consecutive_correct: 3, consecutive_wrong: 0 });
    expect(level).toBe(3);
  });

  it('caps level-up at 5 (max difficulty)', () => {
    const level = nextDifficulty({ difficulty_level: 5, mastery_score: 0.9, consecutive_correct: 4, consecutive_wrong: 0 });
    expect(level).toBe(5);
  });

  it('levels down after 2+ consecutive wrong', () => {
    const level = nextDifficulty({ difficulty_level: 3, mastery_score: 0.5, consecutive_correct: 0, consecutive_wrong: 2 });
    expect(level).toBe(2);
  });

  it('levels down when mastery drops below 0.35 even without a wrong streak', () => {
    const level = nextDifficulty({ difficulty_level: 3, mastery_score: 0.2, consecutive_correct: 0, consecutive_wrong: 1 });
    expect(level).toBe(2);
  });

  it('caps level-down at 1 (min difficulty)', () => {
    const level = nextDifficulty({ difficulty_level: 1, mastery_score: 0.1, consecutive_correct: 0, consecutive_wrong: 3 });
    expect(level).toBe(1);
  });

  it('holds steady in the middle zone (no strong signal either way)', () => {
    const level = nextDifficulty({ difficulty_level: 3, mastery_score: 0.6, consecutive_correct: 1, consecutive_wrong: 0 });
    expect(level).toBe(3);
  });

  it('does not level up on high mastery alone without the consecutive-correct streak', () => {
    const level = nextDifficulty({ difficulty_level: 3, mastery_score: 0.95, consecutive_correct: 1, consecutive_wrong: 0 });
    expect(level).toBe(3);
  });
});

describe('masteryColour / masteryLabel', () => {
  it('bands match at the documented thresholds', () => {
    expect(masteryLabel(80)).toBe('Mastered');
    expect(masteryLabel(60)).toBe('Developing');
    expect(masteryLabel(40)).toBe('Learning');
    expect(masteryLabel(39)).toBe('Needs Work');
    expect(masteryLabel(0)).toBe('Needs Work');
  });

  it('colour bands match the same thresholds as the labels', () => {
    expect(masteryColour(80)).toBe('#10B981');
    expect(masteryColour(60)).toBe('#F59E0B');
    expect(masteryColour(40)).toBe('#F97316');
    expect(masteryColour(39)).toBe('#EF4444');
  });
});
