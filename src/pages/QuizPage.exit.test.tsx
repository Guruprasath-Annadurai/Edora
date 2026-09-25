// Real QuizPage: hardware Back during an in-progress answer session.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } }));
vi.mock('@capacitor/haptics', () => ({ Haptics: { impact: vi.fn().mockResolvedValue(undefined), notification: vi.fn().mockResolvedValue(undefined) }, ImpactStyle: { Light: 'LIGHT' }, NotificationType: { Success: 'S', Warning: 'W' } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }) } }));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/gemini', () => ({ geminiJSON: vi.fn(), geminiCall: vi.fn() }));
vi.mock('@/lib/offlineCache', () => ({ OfflineCache: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('@/lib/achievements', () => ({ loadUnlockedIds: vi.fn().mockResolvedValue(new Set()), checkAchievements: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/dailyMission', () => ({ markMissionTaskComplete: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark' }) }));
vi.mock('@/components/quiz/PeerPercentile', () => ({ PeerPercentile: () => null }));
vi.mock('@/components/ui/ReportButton', () => ({ ReportButton: () => null }));
vi.mock('@/lib/quizPersistence', async () => ({ ...(await vi.importActual<typeof import('@/lib/quizPersistence')>('@/lib/quizPersistence')), persistCompletedQuiz: vi.fn().mockResolvedValue({ status: 'saved' }) }));
const auth = vi.hoisted(() => ({ profile: { id: 'u1', xp: 0, streak_count: 0, full_name: 'T' } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
const chain = () => { const c: Record<string, unknown> = {}; for (const k of ['select', 'eq', 'order', 'limit', 'insert']) c[k] = () => c; c.maybeSingle = () => Promise.resolve({ data: null }); c.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(r); return c; };
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => chain(), rpc: vi.fn(), functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    auth: { getUser: async () => ({ data: { user: { user_metadata: {} } } }), getSession: async () => ({ data: { session: null } }), updateUser: () => Promise.resolve({}) },
  },
}));

import QuizPage from '@/pages/QuizPage';
import { handleBack, resetBackStack } from '@/lib/backStack';

const QUESTIONS = [
  { id: 'a', question: 'Question one?', options: ['A0', 'A1', 'A2', 'A3'], correct_answer: 0, explanation: 'because' },
  { id: 'b', question: 'Question two?', options: ['B0', 'B1', 'B2', 'B3'], correct_answer: 1, explanation: 'because' },
];
const DRAFT_KEY = 'edora_quiz_draft_u1';

beforeEach(() => {
  resetBackStack(); localStorage.clear();
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ topic: 'Physics', count: 2, questions: QUESTIONS, current: 0, answers: [], savedAt: Date.now() }));
});

async function startResumed() {
  render(<MemoryRouter><QuizPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: /resume/i }));
  await screen.findByText('Question one?');
}
const back = async () => { let r = false; await act(async () => { r = handleBack(); }); return r; };

describe('QuizPage — hardware Back in an active answer session', () => {
  it('nothing unsaved (no option chosen yet): Back returns to setup, and the draft is still there to resume', async () => {
    await startResumed();
    expect(await back()).toBe(true);
    expect(await screen.findByRole('button', { name: /resume/i })).toBeTruthy();   // work is resumable
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('an option was chosen but not saved: Back asks before leaving (no silent loss)', async () => {
    await startResumed();
    fireEvent.click(await screen.findByText('A1'));
    expect(await back()).toBe(true);
    expect(await screen.findByRole('dialog', { name: /Leave this quiz/i })).toBeTruthy();
    expect(screen.getByText('Question one?')).toBeTruthy();       // still on the question
  });

  it('Back on the confirm sheet closes it ("keep going"), staying in the quiz', async () => {
    await startResumed();
    fireEvent.click(await screen.findByText('A1'));
    await back();
    await screen.findByRole('dialog');
    expect(await back()).toBe(true);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('Question one?')).toBeTruthy();
  });

  it('"Leave" from the sheet goes to setup; earlier answers stay saved as a draft', async () => {
    await startResumed();
    fireEvent.click(await screen.findByText('A1'));
    await back();
    fireEvent.click(await screen.findByRole('button', { name: /^Leave$/ }));
    expect(await screen.findByRole('button', { name: /resume/i })).toBeTruthy();
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
  });

  it('the in-page back arrow follows the same rule', async () => {
    await startResumed();
    fireEvent.click(await screen.findByText('A1'));
    fireEvent.click(screen.getByRole('button', { name: /Go back/i }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('on the setup screen Back is not consumed by the quiz (falls through to route navigation)', async () => {
    render(<MemoryRouter><QuizPage /></MemoryRouter>);
    await screen.findByRole('button', { name: /resume/i });
    expect(handleBack()).toBe(false);
  });
});
