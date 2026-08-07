import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { callAI } from './aiGateway.ts';

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
