// The REAL normal Chat send path (typed message -> sendMessage) with ai_generation_enabled off/on.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const flags = vi.hoisted(() => ({ aiGen: true }));
vi.mock('@/hooks/useAppFlags', () => ({ useAppFlag: (n: string) => (n === 'ai_generation_enabled' ? flags.aiGen : true), useAppFlags: () => ({}) }));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } }));
vi.mock('@capacitor/toast', () => ({ Toast: { show: vi.fn() } }));
vi.mock('@capacitor/camera', () => ({ Camera: { getPhoto: vi.fn() }, CameraResultType: { DataUrl: 'dataUrl' }, CameraSource: { Camera: 'CAMERA', Photos: 'PHOTOS' } }));
vi.mock('@capacitor/haptics', () => ({ Haptics: { impact: vi.fn().mockResolvedValue(undefined), notification: vi.fn() }, ImpactStyle: { Light: 'L' }, NotificationType: { Success: 'S' } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }) } }));
vi.mock('@capacitor-community/speech-recognition', () => ({ SpeechRecognition: { available: vi.fn().mockResolvedValue({ available: false }), requestPermissions: vi.fn(), addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }) } }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark' }) }));

const auth = vi.hoisted(() => ({
  user: { id: 'u1', created_at: '2020-01-01T00:00:00Z', email: 't@e.st', user_metadata: {} },
  profile: { id: 'u1', full_name: 'Test Learner', is_pro: false, pro_expires_at: null, exam_name: 'GENERAL', study_level: 'school', preferred_language: 'en', streak_count: 0, novo_personality: 'teacher' },
  refetchProfile: () => Promise.resolve(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/useNovoTTS', () => ({ useNovoTTS: () => ({ speak: vi.fn(), getState: () => 'idle', stop: vi.fn() }) }));
vi.mock('@/hooks/useLanguage', () => ({ useLanguage: () => ({ language: 'en', langOption: { code: 'en', native: 'English', label: 'English', flag: 'E' }, setLanguage: vi.fn(), saving: false }), SUPPORTED_LANGUAGES: [] }));
vi.mock('@/hooks/useStudyContext', () => ({
  useStudyContext: () => ({ ctx: { recentLessons: [], recentQuizTopics: [] }, loading: false }),
  buildStudyContextBlock: () => '', getPersonalisedChips: () => [],
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), Events: new Proxy({}, { get: () => vi.fn() }) }));
vi.mock('@/lib/dailyMission', () => ({ markMissionTaskComplete: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/ragCache', () => ({ writeSessionCache: vi.fn(), getOfflineFallback: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/fallbackQA', () => ({ getBestFallbackAnswer: vi.fn().mockReturnValue(null) }));
vi.mock('@/plugins/SmartReplyPlugin', () => ({ getSmartReplies: vi.fn().mockResolvedValue([]) }));
vi.mock('@/components/ui/AIFeedback', () => ({ AIFeedback: () => null, logAIInteraction: vi.fn().mockResolvedValue(null) }));
vi.mock('@/components/voice/VoiceStudyOverlay', () => ({ default: () => null }));
vi.mock('@/components/novo/NovoEmptyState', () => ({ NovoEmptyState: () => null }));
vi.mock('@/lib/offlineModel', () => ({ inferOffline: vi.fn(), isModelReady: () => false, initOfflineModel: vi.fn(), onStatusChange: () => () => {}, onProgress: () => () => {} }));

const stream = vi.hoisted(() => ({ streamMessage: vi.fn(), fetchSpy: vi.fn() }));
vi.mock('@/lib/useGeminiStream', () => ({ useGeminiStream: () => ({ streamMessage: stream.streamMessage, isStreaming: false, streamingText: '', cancelStream: vi.fn() }) }));

const invoke = vi.hoisted(() => vi.fn());
const chain = () => { const c: Record<string, unknown> = {}; for (const k of ['select', 'eq', 'order', 'limit', 'insert', 'update', 'in', 'gte', 'lte', 'is', 'neq']) c[k] = () => c; c.maybeSingle = () => Promise.resolve({ data: null, error: null }); c.single = () => Promise.resolve({ data: null, error: null }); c.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r); return c; };
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => chain(), rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }), getUser: async () => ({ data: { user: null } }) },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: vi.fn(),
  },
}));

import ChatPage from '@/pages/ChatPage';
import { AI_PAUSED_MESSAGE } from '@/lib/aiGeneration';

const usageKey = () => `edora_ai_daily_u1_${new Date().toISOString().slice(0, 10)}`;
const composer = () => screen.findByPlaceholderText(/Ask Novo/i);

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();   // jsdom lacks it
  flags.aiGen = true; stream.streamMessage.mockReset(); stream.fetchSpy.mockReset(); invoke.mockReset();
  invoke.mockResolvedValue({ data: null, error: null });
  localStorage.clear();
  vi.stubGlobal('fetch', stream.fetchSpy);
  stream.streamMessage.mockResolvedValue('Sure — here is the explanation.');
});

async function send(text: string) {
  render(<MemoryRouter><ChatPage /></MemoryRouter>);
  const box = await composer();
  await act(async () => { await new Promise(r => setTimeout(r, 60)); });   // let async history load settle, as it would before a human types
  fireEvent.change(box, { target: { value: text } });
  await act(async () => { fireEvent.keyDown(box, { key: 'Enter' }); });
}
const generationCalls = () => invoke.mock.calls.filter(c => ['gemini-chat', 'gemini-vision', 'novo-proactive'].includes(c[0] as string) && (c[1] as { body?: { action?: string } })?.body?.action !== 'get_pending');

describe('normal Chat send honours ai_generation_enabled', () => {
  it('false: no stream, no fetch, no gemini-chat request, calm paused reply, usage NOT incremented, user message NOT persisted', async () => {
    flags.aiGen = false;
    await send('Explain photosynthesis');
    expect(await screen.findByText(AI_PAUSED_MESSAGE)).toBeTruthy();
    expect(stream.streamMessage).not.toHaveBeenCalled();
    expect(stream.fetchSpy).not.toHaveBeenCalled();
    expect(generationCalls()).toHaveLength(0);
    expect(localStorage.getItem(usageKey())).toBeNull();                 // daily AI usage untouched
    expect(screen.queryByText('Explain photosynthesis')).toBeNull();     // not recorded as a sent/completed turn
  });

  it('false: the typed text is left in the composer (nothing was consumed)', async () => {
    flags.aiGen = false;
    await send('keep me');
    await screen.findByText(AI_PAUSED_MESSAGE);
    expect((await composer() as HTMLInputElement).value).toBe('keep me');
  });

  it('true: the same send streams normally and counts one AI use', async () => {
    flags.aiGen = true;
    await send('Explain photosynthesis');
    await waitFor(() => expect(stream.streamMessage).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/here is the explanation/i)).toBeTruthy();
    expect(screen.queryByText(AI_PAUSED_MESSAGE)).toBeNull();
    await waitFor(() => expect(localStorage.getItem(usageKey())).toBe('1'));
  });
});
