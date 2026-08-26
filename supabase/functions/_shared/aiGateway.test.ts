import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { callAI, getActivePrompt, registerPromptVersion } from './aiGateway.ts';

// Mirrors the exact chain aiGateway.ts calls:
//   .from('ai_gateway_config').select(...).eq('id', true).single()
//   .from('ai_gateway_requests').select(...).gte(...).not(...)
//   .from('ai_gateway_requests').insert(row)
function mockSupabase(opts: {
  config?: { data: { ai_enabled: boolean; daily_cost_ceiling_usd: number } | null; error?: { message: string } | null };
  costRows?: { estimated_cost_usd: number }[];
  insertLog: unknown[];
}) {
  const config = opts.config ?? { data: { ai_enabled: true, daily_cost_ceiling_usd: 50 }, error: null };
  return {
    from: (table: string) => {
      if (table === 'ai_gateway_config') {
        return { select: (_c: string) => ({ eq: (_a: string, _b: unknown) => ({ single: async () => config }) }) };
      }
      return {
        select: (_c: string) => ({ gte: (_a: string, _b: unknown) => ({ not: async (_c2: string, _op: string, _v: unknown) => ({ data: opts.costRows ?? [] }) }) }),
        insert: async (row: unknown) => { opts.insertLog.push(row); return { error: null }; },
      };
    },
  };
}

const baseOpts = { functionName: 'test-fn', provider: 'groq' as const, model: 'llama-3.3-70b-versatile', userId: 'user-1', url: 'https://example.test/api' };

Deno.test('callAI blocks and never reaches the network when the kill switch is off', async () => {
  const insertLog: unknown[] = [];
  const db = mockSupabase({ config: { data: { ai_enabled: false, daily_cost_ceiling_usd: 50 }, error: null }, insertLog });
  let fetchCalled = false;
  globalThis.fetch = async () => { fetchCalled = true; return new Response('{}', { status: 200 }); };

  const result = await callAI(db, { ...baseOpts, init: {} });

  assertEquals(result.ok, false);
  assertEquals(result.blockedReason, 'kill_switch');
  assertEquals(fetchCalled, false);
  assertEquals(insertLog.length, 1);
  assertEquals((insertLog[0] as { status: string }).status, 'blocked_kill_switch');
});

Deno.test('callAI blocks and never reaches the network once the daily cost ceiling is reached', async () => {
  const insertLog: unknown[] = [];
  const db = mockSupabase({
    config: { data: { ai_enabled: true, daily_cost_ceiling_usd: 10 }, error: null },
    costRows: [{ estimated_cost_usd: 6 }, { estimated_cost_usd: 4 }], // sums to exactly the ceiling
    insertLog,
  });
  let fetchCalled = false;
  globalThis.fetch = async () => { fetchCalled = true; return new Response('{}', { status: 200 }); };

  const result = await callAI(db, { ...baseOpts, init: {} });

  assertEquals(result.ok, false);
  assertEquals(result.blockedReason, 'cost_ceiling');
  assertEquals(fetchCalled, false);
  assertEquals((insertLog[0] as { status: string }).status, 'blocked_cost_ceiling');
});

Deno.test('callAI allows the request when spend is still under the ceiling', async () => {
  const insertLog: unknown[] = [];
  const db = mockSupabase({
    config: { data: { ai_enabled: true, daily_cost_ceiling_usd: 10 }, error: null },
    costRows: [{ estimated_cost_usd: 3 }],
    insertLog,
  });
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }), { status: 200 });

  const result = await callAI(db, {
    ...baseOpts,
    init: {},
    extractUsage: (json) => ({ promptTokens: json.usage.prompt_tokens, completionTokens: json.usage.completion_tokens }),
  });

  assertEquals(result.ok, true);
  assertEquals(result.blockedReason, null);
  assertExists(result.response);
  const logged = insertLog[0] as { status: string; prompt_tokens: number; completion_tokens: number; estimated_cost_usd: number | null };
  assertEquals(logged.status, 'success');
  assertEquals(logged.prompt_tokens, 100);
  assertEquals(logged.completion_tokens, 50);
  // llama-3.3-70b-versatile: $0.59/1M in, $0.79/1M out → 100*0.59e-6 + 50*0.79e-6
  assertEquals(logged.estimated_cost_usd, Math.round((100 * 0.59e-6 + 50 * 0.79e-6) * 1_000_000) / 1_000_000);
});

Deno.test('callAI fails CLOSED when ai_gateway_config cannot be read — a DB outage must not unmeter paid calls', async () => {
  const insertLog: unknown[] = [];
  const db = mockSupabase({ config: { data: null, error: { message: 'connection reset' } }, insertLog });
  let fetchCalled = false;
  globalThis.fetch = async () => { fetchCalled = true; return new Response('{}', { status: 200 }); };

  const result = await callAI(db, { ...baseOpts, init: {} });

  assertEquals(result.ok, false);
  assertEquals(result.blockedReason, 'kill_switch');
  assertEquals(fetchCalled, false);
});

Deno.test('callAI records a provider HTTP error as status "error", not silently as blocked', async () => {
  const insertLog: unknown[] = [];
  const db = mockSupabase({ insertLog });
  globalThis.fetch = async () => new Response('rate limited', { status: 429 });

  const result = await callAI(db, { ...baseOpts, init: {} });

  assertEquals(result.ok, false);
  assertEquals(result.blockedReason, null);
  assertEquals((insertLog[0] as { status: string }).status, 'error');
  assertEquals((insertLog[0] as { error_message: string }).error_message, 'HTTP 429');
});

Deno.test('callAI records a network failure (fetch throws) as status "error" with the error message', async () => {
  const insertLog: unknown[] = [];
  const db = mockSupabase({ insertLog });
  globalThis.fetch = async () => { throw new TypeError('network error'); };

  const result = await callAI(db, { ...baseOpts, init: {} });

  assertEquals(result.ok, false);
  assertEquals(result.errorMessage, 'network error');
  assertEquals((insertLog[0] as { status: string }).status, 'error');
});

// ── Prompt registry ──────────────────────────────────────────────────────────

Deno.test('callAI logs promptKey/promptVersion when passed', async () => {
  const insertLog: unknown[] = [];
  const db = mockSupabase({ insertLog });
  globalThis.fetch = async () => new Response('{}', { status: 200 });

  await callAI(db, { ...baseOpts, init: {}, promptKey: 'novo-morning-brief.brief', promptVersion: 2 });

  const logged = insertLog[0] as { prompt_key: string; prompt_version: number };
  assertEquals(logged.prompt_key, 'novo-morning-brief.brief');
  assertEquals(logged.prompt_version, 2);
});

Deno.test('callAI logs null prompt_key/prompt_version when not passed', async () => {
  const insertLog: unknown[] = [];
  const db = mockSupabase({ insertLog });
  globalThis.fetch = async () => new Response('{}', { status: 200 });

  await callAI(db, { ...baseOpts, init: {} });

  const logged = insertLog[0] as { prompt_key: string | null; prompt_version: number | null };
  assertEquals(logged.prompt_key, null);
  assertEquals(logged.prompt_version, null);
});

function mockPromptDb(opts: {
  activeRow?: { version: number; template: string } | null;
  existingVersions?: { version: number }[];
  inserted: unknown[];
  updated: unknown[];
}) {
  return {
    from: (table: string) => {
      if (table !== 'ai_prompt_versions') throw new Error(`unexpected table ${table}`);
      return {
        select: (_c: string) => ({
          eq: (col1: string, val1: unknown) => ({
            eq: (_col2: string, _val2: unknown) => ({
              single: async () => opts.activeRow
                ? { data: opts.activeRow, error: null }
                : { data: null, error: { message: 'no rows' } },
            }),
            order: (_c: string, _o: unknown) => ({
              limit: async (_n: number) => ({ data: opts.existingVersions ?? [] }),
            }),
            // resolves the "deactivate previous active" update chain: .update().eq().eq()
          }),
        }),
        update: (row: unknown) => ({
          eq: (_c1: string, _v1: unknown) => ({
            eq: async (_c2: string, _v2: unknown) => { opts.updated.push(row); return { error: null }; },
          }),
        }),
        insert: async (row: unknown) => { opts.inserted.push(row); return { error: null }; },
      };
    },
  };
}

Deno.test('getActivePrompt returns the active version when one is registered', async () => {
  const db = mockPromptDb({ activeRow: { version: 3, template: 'Hello {{name}}' }, inserted: [], updated: [] });
  const result = await getActivePrompt(db, 'novo-morning-brief.brief');
  assertEquals(result, { version: 3, template: 'Hello {{name}}' });
});

Deno.test('getActivePrompt returns null when the key was never registered (non-breaking fallback)', async () => {
  const db = mockPromptDb({ activeRow: null, inserted: [], updated: [] });
  const result = await getActivePrompt(db, 'never-registered.key');
  assertEquals(result, null);
});

Deno.test('getActivePrompt returns null (never throws) if the underlying call rejects', async () => {
  const db = { from: () => { throw new Error('boom'); } };
  // deno-lint-ignore no-explicit-any
  const result = await getActivePrompt(db as any, 'any.key');
  assertEquals(result, null);
});

Deno.test('registerPromptVersion starts at version 1 for a brand-new key', async () => {
  const inserted: unknown[] = [];
  const updated: unknown[] = [];
  const db = mockPromptDb({ existingVersions: [], inserted, updated });
  const result = await registerPromptVersion(db, { promptKey: 'brand-new.key', template: 'v1 template' });
  assertEquals(result, { version: 1 });
  assertEquals((inserted[0] as { version: number; is_active: boolean }).version, 1);
  assertEquals((inserted[0] as { version: number; is_active: boolean }).is_active, true);
});

Deno.test('registerPromptVersion increments from the highest existing version', async () => {
  const inserted: unknown[] = [];
  const updated: unknown[] = [];
  const db = mockPromptDb({ existingVersions: [{ version: 4 }], inserted, updated });
  const result = await registerPromptVersion(db, { promptKey: 'existing.key', template: 'v5 template' });
  assertEquals(result, { version: 5 });
});

Deno.test('registerPromptVersion deactivates the previous active version for the same key', async () => {
  const inserted: unknown[] = [];
  const updated: unknown[] = [];
  const db = mockPromptDb({ existingVersions: [{ version: 1 }], inserted, updated });
  await registerPromptVersion(db, { promptKey: 'existing.key', template: 'v2 template' });
  assertEquals((updated[0] as { is_active: boolean }).is_active, false);
});
