import { describe, it, expect } from 'vitest';
import { decideQuizBack } from '@/lib/quizExit';

describe('decideQuizBack — never silently abandons an answer', () => {
  it('confirm sheet open: Back closes the sheet first', () => expect(decideQuizBack({ phase: 'quiz', selected: 2, confirmOpen: true })).toBe('close_confirm'));
  it('between questions (nothing unsaved; draft is resumable): leave to setup safely', () => expect(decideQuizBack({ phase: 'quiz', selected: null, confirmOpen: false })).toBe('leave_to_setup'));
  it('an unsaved answer on the current question: ask first', () => expect(decideQuizBack({ phase: 'quiz', selected: 0, confirmOpen: false })).toBe('confirm_leave'));
  it('setup / loading / result are not an active answer session: default route back', () => {
    for (const phase of ['setup', 'loading', 'result'] as const) expect(decideQuizBack({ phase, selected: 1, confirmOpen: false })).toBe('default');
  });
});
