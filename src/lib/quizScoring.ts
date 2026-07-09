// Pure scoring logic extracted from QuizPage so it can be unit tested
// independent of React state and side effects (haptics, tracking, DB writes).

export interface ScorableQuestion {
  correct_answer: number;
}

export interface QuizScore {
  score: number;
  total: number;
  pct:   number;
  xpGain: number;
}

export function scoreQuiz(finalAnswers: number[], questions: ScorableQuestion[]): QuizScore {
  const score = finalAnswers.filter((a, i) => a === questions[i].correct_answer).length;
  const total = questions.length;
  const pct   = total > 0 ? Math.round((score / total) * 100) : 0;
  return { score, total, pct, xpGain: score * 10 };
}
