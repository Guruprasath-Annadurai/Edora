import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@sentry/react', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));
vi.mock('@/lib/supabase', async () => {
  const { guardFunctionsInvoke } = await import('@/lib/aiGeneration');
  const functions = { invoke: (...a: unknown[]) => invoke(...a) };
  guardFunctionsInvoke(functions as never);
  return { supabase: { functions } };
});

import { geminiCall, geminiJSON } from '@/lib/gemini';
import { setAiGenerationEnabled, AiGenerationPausedError } from '@/lib/aiGeneration';

beforeEach(() => { invoke.mockReset(); invoke.mockResolvedValue({ data: { text: '[{"front":"a","back":"b"}]' }, error: null }); });

describe('geminiCall / geminiJSON (used by Flashcards, Scanner, Home cards ...) honour ai_generation_enabled', () => {
  it('false: throws the paused error immediately (no retry storm) and NEVER reaches the Edge Function', async () => {
    setAiGenerationEnabled(false);
    try {
      const err = await geminiCall('make flashcards').catch(e => e);
      expect(err).toBeInstanceOf(AiGenerationPausedError);
      const err2 = await geminiJSON('make flashcards').catch(e => e);
      expect(err2).toBeInstanceOf(AiGenerationPausedError);
      expect(invoke).not.toHaveBeenCalled();
    } finally { setAiGenerationEnabled(true); }
  });
  it('true: normal generation works again', async () => {
    setAiGenerationEnabled(true);
    const out = await geminiJSON<{ front: string }[]>('make flashcards');
    expect(out[0].front).toBe('a');
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
