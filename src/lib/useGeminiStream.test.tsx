import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const fetchSpy = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) }, functions: { invoke: vi.fn() } } }));
vi.mock('@sentry/react', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

import { useGeminiStream } from '@/lib/useGeminiStream';
import { setAiGenerationEnabled, AiGenerationPausedError, AI_PAUSED_MESSAGE } from '@/lib/aiGeneration';

const sse = (chunks: string[]) => new Response(new ReadableStream({ start(c) { const e = new TextEncoder(); for (const t of chunks) c.enqueue(e.encode(`data: ${JSON.stringify({ chunk: t })}\n\n`)); c.enqueue(e.encode('data: [DONE]\n\n')); c.close(); } }), { status: 200 });

beforeEach(() => { fetchSpy.mockReset(); vi.stubGlobal('fetch', fetchSpy); setAiGenerationEnabled(true); });

describe('useGeminiStream direct-fetch transport honours ai_generation_enabled', () => {
  it('disabled: throws AiGenerationPausedError, the direct fetch is called 0 times, no streaming state is entered', async () => {
    setAiGenerationEnabled(false);
    try {
      const { result } = renderHook(() => useGeminiStream());
      let err: unknown;
      await act(async () => { err = await result.current.streamMessage('hello').catch(e => e); });
      expect(err).toBeInstanceOf(AiGenerationPausedError);
      expect((err as Error).message).toBe(AI_PAUSED_MESSAGE);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.streamingText).toBe('');
    } finally { setAiGenerationEnabled(true); }
  });

  it('enabled: the normal streaming fetch path is used', async () => {
    fetchSpy.mockResolvedValue(sse(['Hel', 'lo']));
    const { result } = renderHook(() => useGeminiStream());
    let out = '';
    await act(async () => { out = await result.current.streamMessage('hi'); });
    expect(out).toBe('Hello');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toMatch(/\/functions\/v1\/gemini-chat$/);
  });
});
