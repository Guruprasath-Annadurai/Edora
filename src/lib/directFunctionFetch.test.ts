// Audit guard: any direct fetch to /functions/v1/<fn> bypasses supabase.functions.invoke (and therefore
// guardFunctionsInvoke). Every such call site must be classified here; a NEW one fails this test until it is.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GENERATION_FUNCTIONS } from '@/lib/aiGeneration';

function walk(d: string): string[] {
  return readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : []; });
}

// file -> { fn, kind }
const CLASSIFIED: Record<string, { fn: string; kind: 'STREAMING SPECIAL CASE' | 'NON-GENERATION' }> = {
  'src/lib/useGeminiStream.ts':  { fn: 'gemini-chat',    kind: 'STREAMING SPECIAL CASE' },   // guarded in-transport + in ChatPage.sendMessage
  'src/hooks/useNovoTTS.ts':     { fn: 'elevenlabs-tts', kind: 'NON-GENERATION' },           // speaks given text; no LLM
  'src/hooks/useVoiceStudy.ts':  { fn: 'elevenlabs-tts', kind: 'NON-GENERATION' },
};

describe('direct Edge Function fetches (audit)', () => {
  const found = walk('src').flatMap(f => {
    const src = readFileSync(f, 'utf8');
    return [...src.matchAll(/fetch\(\s*[`'"][^`'"]*\/functions\/v1\/([\w-]+)/g)].map(m => ({ file: f, fn: m[1] }));
  });

  it('finds exactly the classified call sites', () => {
    expect(found.map(f => `${f.file}:${f.fn}`).sort()).toEqual(Object.entries(CLASSIFIED).map(([f, c]) => `${f}:${c.fn}`).sort());
  });

  it('every non-generation classification really is not an AI generation function', () => {
    for (const [f, c] of Object.entries(CLASSIFIED)) if (c.kind === 'NON-GENERATION') expect(GENERATION_FUNCTIONS.has(c.fn), f).toBe(false);
  });

  it('every generation fetch fails closed before the request (isAiGenerationEnabled precedes the fetch)', () => {
    for (const [f, c] of Object.entries(CLASSIFIED)) {
      if (!GENERATION_FUNCTIONS.has(c.fn)) continue;
      const src = readFileSync(f, 'utf8');
      const guard = src.indexOf('isAiGenerationEnabled()');
      const fetchAt = src.indexOf('/functions/v1/');
      expect(guard, f).toBeGreaterThan(-1);
      expect(guard, f).toBeLessThan(fetchAt);
    }
  });
});
