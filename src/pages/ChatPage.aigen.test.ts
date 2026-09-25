// ChatPage is too large to render in a unit test; these guard the wiring statically. The behavioural proof that
// no request leaves the client lives in lib/aiGeneration.test.ts (every generation function is refused before
// any network call) and lib/gemini.paused.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { GENERATION_FUNCTIONS } from '@/lib/aiGeneration';

const src = readFileSync('src/pages/ChatPage.tsx', 'utf8');
const fnBody = (name: string) => { const i = src.indexOf(`async function ${name}`); return src.slice(i, i + 400); };

describe('ChatPage generation actions honour ai_generation_enabled', () => {
  it('reads the flag through useAppFlag (no second flag system)', () => expect(src).toMatch(/useAppFlag\('ai_generation_enabled'\)/));
  it('quiz generation and snap-solve stop with the calm paused reply BEFORE doing anything', () => {
    expect(fnBody('handleQuizIntent')).toMatch(/if \(!aiGenEnabled\) \{ replyGenerationPaused\(\); return; \}/);
    expect(fnBody('handleSnapSolve')).toMatch(/if \(!aiGenEnabled\) \{ replyGenerationPaused\(\); return; \}/);
  });
  it('every Edge Function ChatPage invokes for generation is in the guarded set', () => {
    for (const fn of ['gemini-chat', 'gemini-vision', 'novo-proactive']) {
      if (src.includes(`invoke('${fn}'`)) expect(GENERATION_FUNCTIONS.has(fn), fn).toBe(true);
    }
  });
  it('non-generation calls (memory) are not blocked by the guard', () => expect(GENERATION_FUNCTIONS.has('novo-memory')).toBe(false));
});
