import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { normalizeMemories } from './memoryExtraction.ts';

Deno.test('normalizeMemories drops invalid memory_type values', () => {
  const raw = [
    { memory_type: 'struggle', content: 'Struggles with integration by parts' },
    { memory_type: 'not_a_real_type', content: 'Should be dropped' },
  ];
  const rows = normalizeMemories(raw, 'user-1');
  assertEquals(rows.length, 1);
  assertEquals(rows[0].memory_type, 'learning_pattern'); // legacy vocabulary is mapped to the DB vocabulary
});

Deno.test('normalizeMemories drops entries with empty content', () => {
  const raw = [{ memory_type: 'strength', content: '' }];
  assertEquals(normalizeMemories(raw, 'user-1').length, 0);
});

Deno.test('normalizeMemories caps at 3 entries even if model returns more', () => {
  const raw = Array.from({ length: 10 }, (_, i) => ({
    memory_type: 'fact', content: `fact ${i}`,
  }));
  assertEquals(normalizeMemories(raw, 'user-1').length, 3);
});

Deno.test('normalizeMemories truncates content to 500 chars', () => {
  const raw = [{ memory_type: 'fact', content: 'x'.repeat(1000) }];
  const rows = normalizeMemories(raw, 'user-1');
  assertEquals(rows[0].content.length, 500);
});

Deno.test('normalizeMemories clamps importance to 1-10 range', () => {
  const raw = [
    { memory_type: 'fact', content: 'a', importance: 999 },
    { memory_type: 'fact', content: 'b', importance: -5 },
    { memory_type: 'fact', content: 'c' }, // missing -> defaults to 5
  ];
  const rows = normalizeMemories(raw, 'user-1');
  assertEquals(rows[0].importance, 10);
  assertEquals(rows[1].importance, 1);
  assertEquals(rows[2].importance, 5);
});

Deno.test('normalizeMemories returns empty array for non-array input', () => {
  assertEquals(normalizeMemories(null, 'user-1'), []);
  assertEquals(normalizeMemories('garbage', 'user-1'), []);
  assertEquals(normalizeMemories({}, 'user-1'), []);
});

Deno.test('normalizeMemories stamps the given userId onto every row', () => {
  const raw = [{ memory_type: 'fact', content: 'a' }];
  const rows = normalizeMemories(raw, 'user-42');
  assertEquals(rows[0].user_id, 'user-42');
});

import { toDbMemoryType, DB_MEMORY_TYPES, parseMemoryJson, extractMemories, runInBackground, type MemoryDb } from './memoryExtraction.ts';

// The production CHECK constraint (verified live). If this list drifts from the DB, memory writes fail silently again.
const PROD_CHECK = ['learning_pattern', 'academic_goal', 'personal_fact', 'emotion', 'achievement', 'fact'];

Deno.test('every memory_type we can emit satisfies the production CHECK constraint', () => {
  assertEquals([...DB_MEMORY_TYPES].sort(), [...PROD_CHECK].sort());
  for (const t of ['struggle', 'strength', 'preference', 'milestone', 'exam_context', 'pattern', 'weakness', 'schedule_request', 'note', ...PROD_CHECK]) {
    const m = toDbMemoryType(t);
    assertEquals(m !== null && PROD_CHECK.includes(m), true, t);
  }
  assertEquals(toDbMemoryType('nonsense'), null);
  assertEquals(toDbMemoryType(undefined), null);
});

Deno.test('normalizeMemories output is always CHECK-valid (the F6 root cause)', () => {
  const rows = normalizeMemories([
    { memory_type: 'struggle', content: 'a' }, { memory_type: 'milestone', content: 'b' },
    { memory_type: 'exam_context', content: 'c' },
  ], 'u');
  for (const r of rows) assertEquals(PROD_CHECK.includes(r.memory_type), true);
});

Deno.test('parseMemoryJson handles fences, think-blocks, prose and garbage', () => {
  assertEquals(parseMemoryJson('[{"a":1}]')?.length, 1);
  assertEquals(parseMemoryJson('```json\n[{"a":1},{"a":2}]\n```')?.length, 2);
  assertEquals(parseMemoryJson('<think>hmm [x]</think>[{"a":1}]')?.length, 1);
  assertEquals(parseMemoryJson('Here you go: [{"a":1}] hope that helps')?.length, 1);
  assertEquals(parseMemoryJson('[]')?.length, 0);
  assertEquals(parseMemoryJson('not json'), null);
  assertEquals(parseMemoryJson(''), null);
});

function fakeDb(err: { code?: string; message?: string } | null = null) {
  const inserted: unknown[][] = [];
  const db: MemoryDb = { from: (_t: string) => ({ insert: (rows: unknown) => { inserted.push(rows as unknown[]); return Promise.resolve({ error: err }); } }) };
  return { db, inserted };
}
const base = { userId: 'u1', userMessage: 'I keep failing integration by parts', assistantResponse: 'Let us practise', subject: 'Mathematics' };
const quiet = () => {};

Deno.test('extractMemories: saves a CHECK-valid row from a legacy-vocabulary model reply', async () => {
  const { db, inserted } = fakeDb();
  const r = await extractMemories({ ...base, db, log: quiet, callLLM: () => Promise.resolve({ ok: true, status: 200, text: '```json\n[{"memory_type":"struggle","content":"Struggles with integration by parts","subject":"Mathematics","topic":"Integration","importance":8}]\n```' }) });
  assertEquals(r, { stage: 'saved', saved: 1 });
  const row = inserted[0][0] as Record<string, unknown>;
  assertEquals(row.memory_type, 'learning_pattern');
  assertEquals(row.source, 'chat');
  assertEquals(row.user_id, 'u1');
});

Deno.test('extractMemories: every failure stage is reported, never silent', async () => {
  const run = (llm: () => Promise<{ ok: boolean; status: number; text: string }>, err: { code?: string; message?: string } | null = null) => {
    const { db } = fakeDb(err);
    return extractMemories({ ...base, db, log: quiet, callLLM: llm });
  };
  assertEquals((await run(() => Promise.reject(new Error('boom')))).stage, 'llm_exception');
  assertEquals((await run(() => Promise.resolve({ ok: false, status: 429, text: '' }))).stage, 'llm_http_error');
  assertEquals((await run(() => Promise.resolve({ ok: true, status: 200, text: '   ' }))).stage, 'empty_llm_output');
  assertEquals((await run(() => Promise.resolve({ ok: true, status: 200, text: 'sorry' }))).stage, 'parse_failed');
  assertEquals((await run(() => Promise.resolve({ ok: true, status: 200, text: '[]' }))).stage, 'nothing_notable');
  assertEquals((await run(() => Promise.resolve({ ok: true, status: 200, text: '[{"memory_type":"zzz","content":"x"}]' }))).stage, 'no_valid_rows');
  const ins = await run(() => Promise.resolve({ ok: true, status: 200, text: '[{"memory_type":"fact","content":"x"}]' }), { code: '23514', message: 'check violation' });
  assertEquals(ins.stage, 'insert_failed');
  assertEquals(ins.detail?.includes('23514'), true);
});

Deno.test('runInBackground registers the promise with EdgeRuntime.waitUntil and never throws', async () => {
  const g = globalThis as { EdgeRuntime?: unknown };
  const registered: Promise<unknown>[] = [];
  g.EdgeRuntime = { waitUntil: (p: Promise<unknown>) => registered.push(p) };
  try {
    runInBackground(Promise.reject(new Error('bg failure')));
    assertEquals(registered.length, 1);
    await registered[0]; // resolves (error already handled inside)
  } finally { delete g.EdgeRuntime; }
  runInBackground(Promise.resolve(1)); // no EdgeRuntime: still safe
});
