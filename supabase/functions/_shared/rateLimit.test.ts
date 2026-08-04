import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { checkRateLimit, checkGlobalLLMBudget } from './rateLimit.ts';

// Minimal mock matching the exact chain both functions call:
// supabase.from(table).select(col, opts).eq(a,b).eq(c,d).gte(e,f)  → { count, error }
// supabase.from(table).insert(row).then(cb)                        → fires cb, records the row
function mockSupabase(opts: { count?: number; error?: { message: string } | null; insertLog?: unknown[] }) {
  return {
    from: (_table: string) => ({
      select: (_col: string, _selectOpts: unknown) => ({
        eq: (_a: string, _b: unknown) => ({
          eq: (_c: string, _d: unknown) => ({
            gte: async (_e: string, _f: unknown) => ({ count: opts.count ?? 0, error: opts.error ?? null }),
          }),
        }),
      }),
      insert: (row: unknown) => {
        opts.insertLog?.push(row);
        return { then: (cb: () => void) => cb() };
      },
    }),
  };
}

// ── checkRateLimit ───────────────────────────────────────────────────────────

Deno.test('checkRateLimit allows the request when under the limit', async () => {
  const db = mockSupabase({ count: 3 });
  const result = await checkRateLimit(db, 'user-1', 'ai-chat', 10, 60);
  assertEquals(result.allowed, true);
  assertEquals(result.retryAfterSecs, 0);
});

Deno.test('checkRateLimit denies the request when at the limit', async () => {
  const db = mockSupabase({ count: 10 });
  const result = await checkRateLimit(db, 'user-1', 'ai-chat', 10, 60);
  assertEquals(result.allowed, false);
  assertEquals(result.retryAfterSecs, 60 * 60);
});

Deno.test('checkRateLimit denies the request when over the limit', async () => {
  const db = mockSupabase({ count: 15 });
  const result = await checkRateLimit(db, 'user-1', 'ai-chat', 10, 60);
  assertEquals(result.allowed, false);
});

Deno.test('checkRateLimit fails CLOSED on a DB error — regression test for a real past bug', async () => {
  // Comment in rateLimit.ts: this used to fail OPEN, inconsistent with
  // auth-guard.ts's checkRateLimit which fails closed, "with no intentional
  // reasoning behind it" — fixed to fail closed. This test locks that in.
  const db = mockSupabase({ error: { message: 'connection reset' } });
  const result = await checkRateLimit(db, 'user-1', 'ai-chat', 10, 60);
  assertEquals(result.allowed, false);
  assertEquals(result.retryAfterSecs, 60);
});

Deno.test('checkRateLimit fails CLOSED when the query throws synchronously', async () => {
  const throwingDb = {
    from: () => {
      throw new Error('network unreachable');
    },
  };
  const result = await checkRateLimit(throwingDb, 'user-1', 'ai-chat', 10, 60);
  assertEquals(result.allowed, false);
  assertEquals(result.retryAfterSecs, 60);
});

Deno.test('checkRateLimit logs a usage row on an allowed request', async () => {
  const insertLog: unknown[] = [];
  const db = mockSupabase({ count: 0, insertLog });
  await checkRateLimit(db, 'user-1', 'ai-chat', 10, 60);
  assertEquals(insertLog.length, 1);
  assertEquals(insertLog[0], { user_id: 'user-1', endpoint: 'ai-chat' });
});

Deno.test('checkRateLimit does not log a usage row when denied', async () => {
  const insertLog: unknown[] = [];
  const db = mockSupabase({ count: 10, insertLog });
  await checkRateLimit(db, 'user-1', 'ai-chat', 10, 60);
  assertEquals(insertLog.length, 0);
});

// ── checkGlobalLLMBudget ──────────────────────────────────────────────────────

Deno.test('checkGlobalLLMBudget allows when under the shared budget', async () => {
  const db = mockSupabase({ count: 100 });
  const result = await checkGlobalLLMBudget(db, 'groq-chat', 500, 1);
  assertEquals(result.withinBudget, true);
});

Deno.test('checkGlobalLLMBudget denies when the shared budget is exhausted', async () => {
  const db = mockSupabase({ count: 500 });
  const result = await checkGlobalLLMBudget(db, 'groq-chat', 500, 1);
  assertEquals(result.withinBudget, false);
});

Deno.test('checkGlobalLLMBudget fails OPEN on a DB error — deliberately opposite of checkRateLimit', async () => {
  // rateLimit.ts documents this asymmetry explicitly: the global budget check
  // is an optimization to skip a doomed Groq call sooner, not a hard cap
  // (per-user checkRateLimit is the real cap) — so failing open here is
  // strictly no worse than not having this feature. Locking in the
  // intentional asymmetry so a future "consistency" refactor doesn't
  // accidentally flip it and silently degrade the optimization into an
  // outage amplifier.
  const db = mockSupabase({ error: { message: 'timeout' } });
  const result = await checkGlobalLLMBudget(db, 'groq-chat', 500, 1);
  assertEquals(result.withinBudget, true);
});

Deno.test('checkGlobalLLMBudget fails OPEN when the query throws synchronously', async () => {
  const throwingDb = {
    from: () => {
      throw new Error('network unreachable');
    },
  };
  const result = await checkGlobalLLMBudget(throwingDb, 'groq-chat', 500, 1);
  assertEquals(result.withinBudget, true);
});
