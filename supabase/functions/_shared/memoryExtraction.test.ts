import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { normalizeMemories } from './memoryExtraction.ts';

Deno.test('normalizeMemories drops invalid memory_type values', () => {
  const raw = [
    { memory_type: 'struggle', content: 'Struggles with integration by parts' },
    { memory_type: 'not_a_real_type', content: 'Should be dropped' },
  ];
  const rows = normalizeMemories(raw, 'user-1');
  assertEquals(rows.length, 1);
  assertEquals(rows[0].memory_type, 'struggle');
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
