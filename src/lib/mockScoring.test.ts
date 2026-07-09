import { describe, it, expect } from 'vitest';
import { scoreMockExam, type ScorableMockQuestion } from './mockScoring';

function mcq(overrides: Partial<ScorableMockQuestion> = {}): ScorableMockQuestion {
  return {
    id: 'q1', subject: 'Physics', question_type: 'mcq',
    correct_idx: 1, correct_value: null,
    marks_positive: 4, marks_negative: 1,
    ...overrides,
  };
}

function tita(overrides: Partial<ScorableMockQuestion> = {}): ScorableMockQuestion {
  return {
    id: 'q2', subject: 'QA', question_type: 'integer',
    correct_idx: -1, correct_value: '42',
    marks_positive: 3, marks_negative: 0,
    ...overrides,
  };
}

describe('scoreMockExam', () => {
  it('awards positive marks for a correct MCQ', () => {
    const q = mcq();
    const result = scoreMockExam([{ subject: 'Physics', questions: [q] }], { [q.id]: 1 });
    expect(result.totalScore).toBe(4);
    expect(result.subjectScores.Physics).toEqual({ correct: 1, score: 4, total: 1 });
    expect(result.wrongQuestions).toHaveLength(0);
  });

  it('deducts negative marks for a wrong MCQ', () => {
    const q = mcq();
    const result = scoreMockExam([{ subject: 'Physics', questions: [q] }], { [q.id]: 0 });
    expect(result.totalScore).toBe(0); // clamped: -1 -> 0
    expect(result.subjectScores.Physics.score).toBe(0);
    expect(result.wrongQuestions).toEqual([q]);
  });

  it('never lets total score go negative even across multiple wrong answers', () => {
    const q1 = mcq({ id: 'a' });
    const q2 = mcq({ id: 'b' });
    const result = scoreMockExam([{ subject: 'Physics', questions: [q1, q2] }], { a: 0, b: 0 });
    expect(result.totalScore).toBe(0);
  });

  it('skips unanswered questions entirely (no penalty)', () => {
    const q = mcq();
    const result = scoreMockExam([{ subject: 'Physics', questions: [q] }], {});
    expect(result.totalScore).toBe(0);
    expect(result.wrongQuestions).toHaveLength(0);
    expect(result.subjectScores.Physics.correct).toBe(0);
  });

  it('scores TITA (integer) questions by string match, case/whitespace-insensitive', () => {
    const q = tita();
    const result = scoreMockExam([{ subject: 'QA', questions: [q] }], { [q.id]: ' 42 ' });
    expect(result.totalScore).toBe(3);
  });

  it('applies zero negative marking to a wrong TITA answer, even in a negative-marked section', () => {
    const q = tita();
    const result = scoreMockExam([{ subject: 'QA', questions: [q] }], { [q.id]: '7' });
    expect(result.totalScore).toBe(0);
    expect(result.subjectScores.QA.score).toBe(0);
    expect(result.wrongQuestions).toEqual([q]);
  });

  it('computes maxScore as the sum of positive marks regardless of answers given', () => {
    const questions = [mcq({ id: 'a', marks_positive: 4 }), mcq({ id: 'b', marks_positive: 4 })];
    const result = scoreMockExam([{ subject: 'Physics', questions }], { a: 1 });
    expect(result.maxScore).toBe(8);
  });

  it('aggregates totalScore and maxScore across multiple sections independently', () => {
    const physics = mcq({ id: 'p1', subject: 'Physics', marks_positive: 4, marks_negative: 1 });
    const qa = tita({ id: 'q1', subject: 'QA', marks_positive: 3, marks_negative: 0 });
    const result = scoreMockExam(
      [{ subject: 'Physics', questions: [physics] }, { subject: 'QA', questions: [qa] }],
      { p1: 1, q1: '42' },
    );
    expect(result.totalScore).toBe(7);
    expect(result.maxScore).toBe(7);
    expect(result.subjectScores.Physics.score).toBe(4);
    expect(result.subjectScores.QA.score).toBe(3);
  });
});
