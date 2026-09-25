// Leaving an in-progress quiz (hardware Back or the in-page back arrow).
//
// Durable state: QuizPage writes a resumable draft when the quiz starts and after EVERY answered question
// (saveDraft on "next"), and the setup screen offers to resume it. So leaving between questions loses nothing.
// The only unsaved work is an option chosen on the CURRENT question before the learner moved on. In that
// case (and only that case) we ask before leaving. No new navigation framework: one pure decision.

export type QuizBackDecision = 'close_confirm' | 'confirm_leave' | 'leave_to_setup' | 'default';

export function decideQuizBack(s: { phase: 'setup' | 'loading' | 'quiz' | 'result'; selected: number | null; confirmOpen: boolean }): QuizBackDecision {
  if (s.confirmOpen) return 'close_confirm';            // Back closes the sheet first ("keep going")
  if (s.phase !== 'quiz') return 'default';             // setup/loading/result: normal route back
  return s.selected !== null ? 'confirm_leave' : 'leave_to_setup';
}

export const QUIZ_LEAVE_COPY = {
  title: 'Leave this quiz?',
  body: 'Your earlier answers are saved and you can resume later. The answer you just chose on this question is not saved yet.',
  keep: 'Keep going',
  leave: 'Leave',
} as const;
