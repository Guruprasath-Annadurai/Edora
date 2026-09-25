// Static wiring guards for gemini-chat/index.ts (Deno.serve at module top level makes it un-importable in a
// unit test, so — as with novo-subscription/noBuilderCatch.test.ts — assert on the source).
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';

const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

Deno.test('BOTH memory-extraction paths are registered with waitUntil (via runInBackground)', () => {
  // streaming path: the whole post-stream task is registered
  assertEquals(/runInBackground\(\(async \(\) => \{\s*let fullAssistantText/.test(code), true);
  // non-streaming path
  assertEquals(/runInBackground\(extractAndSaveMemories\(/.test(code), true);
});

Deno.test('no fire-and-forget extractAndSaveMemories(...).catch(() => {}) remains', () => {
  assertEquals(/extractAndSaveMemories\([^)]*\)\s*\.catch\(/.test(code), false);
});

Deno.test('the chat call goes through the provider chain; the old Groq-only 429 path is gone', () => {
  assertEquals(code.includes('runProviderChain('), true);
  assertEquals(code.includes('Groq unreachable'), false);
  assertEquals(code.includes('groqRes.status === 429'), false);
});

Deno.test('Gemini is not in the default chat chain (embeddings/vision only)', () => {
  const m = code.match(/name: 'gemini-text-fallback'[\s\S]{0,400}/);
  assertEquals(!!m && /AI_CHAT_GEMINI_FALLBACK/.test(m[0]), true);
});

Deno.test('tool handlers only write CHECK-valid novo_memories vocabulary/source', () => {
  for (const bad of ["memory_type:  'struggle'", "memory_type:  'schedule_request'", "memory_type:  'note'", "source:       'novo_auto', last_used_at"]) {
    // 'novo_auto' remains valid for the flashcards table only, never next to last_used_at (novo_memories rows)
    assertEquals(code.includes(bad), false, bad);
  }
});

Deno.test('no query-builder .catch() on supabase calls in gemini-chat (TypeError before send)', () => {
  assertEquals(/\}\)\s*\.catch\(\(\) => \(\{ data: null \}\)\)/.test(code), false);
});
