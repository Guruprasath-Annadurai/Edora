// Static guard: every gateway-migrated AI function classifies permanent HTTP errors instead of blindly
// retrying them (F14: novo-morning-brief retried a permanent 403 3x/user/day for 12 days = 1,512 calls).
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';

const FUNCTIONS = [
  'ai-question-gen', 'gemini-vision', 'lesson-planner', 'novo-cron-proactive',
  'novo-morning-brief', 'roadmap-generator', 'study-pack-generator', 'revision-planner',
];

for (const fn of FUNCTIONS) {
  Deno.test(`${fn}: retries are classified (permanent 4xx never retried)`, async () => {
    const src = await Deno.readTextFile(new URL(`../${fn}/index.ts`, import.meta.url));
    assertEquals(src.includes("from '../_shared/retryPolicy.ts'"), true, 'imports retryPolicy');
    assertEquals(/isPermanentStatus\(|providerHttpError\(|isPermanentError\(/.test(src), true, 'uses the permanent classification');
  });
}

Deno.test('gemini-chat memory-extraction retry uses withRetry (classified)', async () => {
  const src = await Deno.readTextFile(new URL('../gemini-chat/index.ts', import.meta.url));
  assertEquals(src.includes('withRetry('), true);
});
