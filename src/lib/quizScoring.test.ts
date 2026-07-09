import { describe, it, expect } from 'vitest';
import { scoreQuiz } from './quizScoring';

describe('scoreQuiz', () => {
  it('scores all-correct as 100%', () => {
    const questions = [{ correct_answer: 0 }, { correct_answer: 1 }, { correct_answer: 2 }];
    const result = scoreQuiz([0, 1, 2], questions);
    expect(result).toEqual({ score: 3, total: 3, pct: 100, xpGain: 30 });
  });

  it('scores all-wrong as 0%', () => {
    const questions = [{ correct_answer: 0 }, { correct_answer: 1 }];
    const result = scoreQuiz([1, 0], questions);
    expect(result).toEqual({ score: 0, total: 2, pct: 0, xpGain: 0 });
  });

  it('rounds partial scores correctly', () => {
    const questions = [{ correct_answer: 0 }, { correct_answer: 1 }, { correct_answer: 2 }];
    const result = scoreQuiz([0, 1, 9], questions);
    expect(result.score).toBe(2);
    expect(result.pct).toBe(67); // 2/3 = 66.67 -> rounds to 67
    expect(result.xpGain).toBe(20);
  });

  it('handles empty quiz without dividing by zero', () => {
    const result = scoreQuiz([], []);
    expect(result).toEqual({ score: 0, total: 0, pct: 0, xpGain: 0 });
  });

  it('does not award credit for out-of-range answer indices', () => {
    const questions = [{ correct_answer: 0 }];
    const result = scoreQuiz([-1], questions);
    expect(result.score).toBe(0);
  });
});
