// Drives the REAL QuizPage: resume a saved draft, answer every question, finish.
// Proves the component has ONE persistence authority (persistCompletedQuiz) and that a
// double-tap on "See Results" cannot create a second session identity.
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

const auth = vi.hoisted(() => ({ profile: { id: 'u1', xp: 0, streak_count: 0, full_name: 'T' } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));

const chain = () => { const c: Record<string, unknown> = {}; for (const k of ['select', 'eq', 'order', 'limit', 'insert']) c[k] = () => c; c.maybeSingle = () => Promise.resolve({ data: null }); c.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(r); return c; };
const from = vi.fn((_table: string) => chain());
const rpc = vi.fn<(name: string, ...rest: unknown[]) => unknown>();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...a: unknown[]) => (from as (...x: unknown[]) => unknown)(...a),
    rpc: (n: string, ...a: unknown[]) => rpc(n, ...a),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    auth: {
      getUser: async () => ({ data: { user: { user_metadata: {} } } }),
      getSession: async () => ({ data: { session: null } }),
      updateUser: () => Promise.resolve({}),
    },
  },
}));

const persist = vi.hoisted(() => vi.fn<(input: Record<string, any>) => Promise<unknown>>()); // eslint-disable-line @typescript-eslint/no-explicit-any
vi.mock('@/lib/quizPersistence', async () => {
  const actual = await vi.importActual<typeof import('@/lib/quizPersistence')>('@/lib/quizPersistence');
  return { ...actual, persistCompletedQuiz: (a: Record<string, any>) => persist(a) }; // eslint-disable-line @typescript-eslint/no-explicit-any
});

import QuizPage from '@/pages/QuizPage';

const QUESTIONS = [
  { id: 'a', question: 'Question one?', options: ['A0', 'A1', 'A2', 'A3'], correct_answer: 0, explanation: 'because' },
  { id: 'b', question: 'Question two?', options: ['B0', 'B1', 'B2', 'B3'], correct_answer: 1, explanation: 'because' },
];

beforeEach(() => {
  persist.mockReset(); from.mockClear(); rpc.mockReset();
  persist.mockResolvedValue({ status: 'saved', xpAwarded: 10 });
  localStorage.clear();
  localStorage.setItem('edora_quiz_draft_u1', JSON.stringify({ topic: 'Physics', count: 2, questions: QUESTIONS, current: 0, answers: [], savedAt: Date.now() }));
});

async function answerQuestion(optionText: string, buttonLabel: RegExp) {
  fireEvent.click(await screen.findByText(optionText));
  fireEvent.click(await screen.findByRole('button', { name: /sure|guessing/i, hidden: false }));
  return screen.findByRole('button', { name: buttonLabel });
}

describe('QuizPage — one persistence authority, exactly one session per run', () => {
  it('completing a quiz persists ONCE through persistCompletedQuiz and never writes quiz_sessions / increment_xp directly', async () => {
    render(<MemoryRouter><QuizPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Resume'));
    fireEvent.click(await answerQuestion('A0', /next question/i));        // correct
    fireEvent.click(await answerQuestion('B1', /see results/i));           // correct
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    const arg = persist.mock.calls[0][0];
    expect(arg.score).toBe(2);
    expect(arg.userId).toBe('u1');
    expect(arg.questions).toHaveLength(2);
    expect(typeof arg.sessionId).toBe('string');
    expect(from.mock.calls.some(c => c[0] === 'quiz_sessions')).toBe(false);
    expect(rpc.mock.calls.some(c => c[0] === 'increment_xp')).toBe(false);
  });

  it('a double-tap on "See Results" reuses the SAME session id (server dedupes); it can never mint two identities', async () => {
    render(<MemoryRouter><QuizPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Resume'));
    fireEvent.click(await answerQuestion('A0', /next question/i));
    const finish = await answerQuestion('B1', /see results/i);
    await act(async () => { finish.click(); finish.click(); });
    await waitFor(() => expect(persist).toHaveBeenCalled());
    console.log('[double-tap] persist calls:', persist.mock.calls.length);
    const ids = new Set(persist.mock.calls.map(c => c[0].sessionId));
    expect(ids.size).toBe(1);
  });
});
