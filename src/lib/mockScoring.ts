// Pure scoring logic extracted from MockTestPage so CAT/UPSC/JEE/NEET mock
// scoring — including TITA (no negative marking) and per-section negative
// marking — can be unit tested independent of React state and DB writes.

export interface ScorableMockQuestion {
  id: string;
  subject: string;
  question_type: 'mcq' | 'integer';
  correct_idx: number;
  correct_value: string | null;
  marks_positive: number;
  marks_negative: number;
}

export interface MockScoreResult<Q extends ScorableMockQuestion> {
  totalScore: number;
  maxScore: number;
  subjectScores: Record<string, { correct: number; score: number; total: number }>;
  wrongQuestions: Q[];
}

export function scoreMockExam<Q extends ScorableMockQuestion>(
  sections: { subject: string; questions: Q[] }[],
  finalAnswers: Record<string, number | string>,
): MockScoreResult<Q> {
  const subjectScores: Record<string, { correct: number; score: number; total: number }> = {};
  let totalScore = 0;
  let maxScore = 0;
  const wrongQuestions: Q[] = [];

  for (const sec of sections) {
    let correct = 0;
    let secScore = 0;
    for (const q of sec.questions) {
      const ans = finalAnswers[q.id];
      if (ans === undefined) continue;
      const isCorrect = q.question_type === 'integer'
        ? String(ans).trim().toLowerCase() === (q.correct_value ?? '').trim().toLowerCase()
        : ans === q.correct_idx;
      // TITA questions carry no negative marking even in a section that
      // negative-marks MCQs — marks_negative is already 0 for those rows.
      if (isCorrect) { correct++; secScore += q.marks_positive; totalScore += q.marks_positive; }
      else { secScore -= q.marks_negative; totalScore -= q.marks_negative; wrongQuestions.push(q); }
    }
    maxScore += sec.questions.reduce((s, q) => s + q.marks_positive, 0);
    subjectScores[sec.subject] = { correct, score: Math.max(0, secScore), total: sec.questions.length };
  }

  return { totalScore: Math.max(0, totalScore), maxScore, subjectScores, wrongQuestions };
}
