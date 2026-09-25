import { describe, it, expect, vi } from 'vitest';
import { GENERATION_FUNCTIONS, guardFunctionsInvoke, AiGenerationPausedError, AI_PAUSED_MESSAGE, setAiGenerationEnabled, isAiGenerationEnabled } from '@/lib/aiGeneration';

function fakeFunctions() {
  const invoke = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
  const fns = { invoke };
  return { fns, invoke, original: invoke };
}

describe('ai_generation_enabled=false at the Edge Function choke point', () => {
  it('refuses EVERY generation function before any request is made, with the calm message', async () => {
    for (const name of GENERATION_FUNCTIONS) {
      const { fns, original } = fakeFunctions();
      guardFunctionsInvoke(fns, () => false);
      const res = await fns.invoke(name, { body: {} });
      expect(original, name).not.toHaveBeenCalled();                 // no network / Edge Function call
      expect(res.data).toBeNull();
      expect(res.error).toBeInstanceOf(AiGenerationPausedError);
      expect((res.error as Error).message).toBe(AI_PAUSED_MESSAGE);
    }
  });

  it('flag ON restores normal calls for the same functions', async () => {
    for (const name of GENERATION_FUNCTIONS) {
      const { fns, original } = fakeFunctions();
      guardFunctionsInvoke(fns, () => true);
      const res = await fns.invoke(name, { body: { a: 1 } });
      expect(original, name).toHaveBeenCalledWith(name, { body: { a: 1 } });
      expect(res.error).toBeNull();
    }
  });

  it('deterministic / non-AI functions are NEVER blocked (memory, subscription, push, sync)', async () => {
    for (const name of ['novo-memory', 'novo-subscription', 'novo-push', 'analytics', 'app-flags', 'delete-account']) {
      const { fns, original } = fakeFunctions();
      guardFunctionsInvoke(fns, () => false);
      await fns.invoke(name, {});
      expect(original, name).toHaveBeenCalledTimes(1);
    }
  });

  it('covers every generation action named in the audit: chat quiz intent, vision solve, flashcards helper (gemini-chat), proactive, question explain', () => {
    for (const n of ['gemini-chat', 'gemini-vision', 'novo-proactive', 'question-explain', 'ai-question-gen', 'study-pack-generator']) {
      expect(GENERATION_FUNCTIONS.has(n), n).toBe(true);
    }
  });

  it('default is enabled (SDK default) and the setter flips it', () => {
    expect(isAiGenerationEnabled()).toBe(true);
    setAiGenerationEnabled(false); expect(isAiGenerationEnabled()).toBe(false);
    setAiGenerationEnabled(true); expect(isAiGenerationEnabled()).toBe(true);
  });
});
