// Fake-provider harness for the Novo provider chain (V5 Day 2, plan §8.3).
// Covers: Groq success · 429 · 500 · 503 · network timeout · fetch exception · Claude fallback ·
// streaming (Groq SSE, Claude→OpenAI SSE) · tool calls (Claude tool_use translation) · all-provider failure.
import { assertEquals, assert } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { runProviderChain, summarizeAttempts, ALL_TIERS_FAILED_BODY, type ChainTier } from './providerChain.ts';
import { toAnthropicMessages, toAnthropicTools, anthropicToOpenAIStream, anthropicJsonToOpenAI } from './claudeAdapter.ts';

const quiet = () => {};
const ok = (body = '{"ok":true}', headers: Record<string, string> = { 'Content-Type': 'application/json' }) => new Response(body, { status: 200, headers });
const status = (s: number) => new Response(JSON.stringify({ error: { message: `HTTP ${s}` } }), { status: s });
const hang = (sig: AbortSignal) => new Promise<Response>((_, rej) => sig.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));

interface Fake { name: string; calls: number }
function tier(name: string, provider: ChainTier['provider'], impl: (sig: AbortSignal) => Promise<Response>, extra: Partial<ChainTier> = {}): ChainTier & Fake {
  const t: ChainTier & Fake = { name, provider, model: `${name}-model`, timeoutMs: 1000, calls: 0, call: (sig) => { t.calls++; return impl(sig); }, ...extra };
  return t;
}
const standard = (g1: () => Promise<Response> | Response, g2: () => Promise<Response> | Response = () => ok(), c: () => Promise<Response> | Response = () => ok()) => [
  tier('groq-primary', 'groq', async () => await g1()),
  tier('groq-small', 'groq', async () => await g2()),
  tier('claude-text-fallback', 'anthropic', async () => await c()),
];

Deno.test('Groq success: primary serves, later tiers untouched', async () => {
  const t = standard(() => ok());
  const r = await runProviderChain(t, { log: quiet });
  assertEquals(r.tier?.name, 'groq-primary');
  assertEquals(r.allFailed, false);
  assertEquals(t.map(x => (x as unknown as Fake).calls), [1, 0, 0]);
});

for (const code of [429, 500, 502, 503]) {
  Deno.test(`Groq ${code}: routes to the next tier (Groq small)`, async () => {
    const t = standard(() => status(code));
    const r = await runProviderChain(t, { log: quiet });
    assertEquals(r.tier?.name, 'groq-small');
    assertEquals(r.attempts[0].status, code);
    assertEquals(r.attempts[0].outcome, 'http_error');
  });
}

Deno.test('Groq network timeout: aborts that tier and routes on', async () => {
  const t = [
    tier('groq-primary', 'groq', hang, { timeoutMs: 25 }),
    tier('groq-small', 'groq', () => Promise.resolve(ok())),
  ];
  const r = await runProviderChain(t, { log: quiet });
  assertEquals(r.attempts[0].outcome, 'timeout');
  assertEquals(r.tier?.name, 'groq-small');
});

Deno.test('Groq fetch exception: routes on (was: 503 "Groq unreachable" to the student)', async () => {
  const t = standard(() => Promise.reject(new TypeError('fetch failed')));
  const r = await runProviderChain(t, { log: quiet });
  assertEquals(r.attempts[0].outcome, 'exception');
  assertEquals(r.attempts[0].message, 'fetch failed');
  assertEquals(r.tier?.name, 'groq-small');
});

Deno.test('Both Groq tiers fail (429 then 500): Claude text fallback serves', async () => {
  const t = standard(() => status(429), () => status(500), () => ok('claude says hi'));
  const r = await runProviderChain(t, { log: quiet });
  assertEquals(r.tier?.name, 'claude-text-fallback');
  assertEquals(await r.response!.text(), 'claude says hi');
  assertEquals(summarizeAttempts(r.attempts), 'groq-primary:http_error(429) > groq-small:http_error(500) > claude-text-fallback:ok(200)');
});

Deno.test('permanent 401 (bad key) is attempted once, logged distinctly, and still falls through to Claude', async () => {
  const logs: string[] = [];
  const t = standard(() => status(401), () => status(401), () => ok());
  const r = await runProviderChain(t, { log: l => logs.push(l) });
  assertEquals(r.tier?.name, 'claude-text-fallback');
  assertEquals(r.attempts[0].failureClass, 'permanent');
  assertEquals((t[0] as unknown as Fake).calls, 1);
  assert(logs.some(l => l.includes('[chain][permanent]') && l.includes('groq-primary')));
  assert(!logs.some(l => l.includes('[chain][permanent]') && l.includes('claude')));
});

Deno.test('all providers fail: allFailed, no response, friendly non-technical body available', async () => {
  const t = standard(() => status(503), () => Promise.reject(new Error('econnreset')), () => status(529));
  const r = await runProviderChain(t, { log: quiet });
  assertEquals(r.allFailed, true);
  assertEquals(r.response, null);
  assertEquals(r.attempts.length, 3);
  assertEquals(ALL_TIERS_FAILED_BODY.message.startsWith('Novo is busy'), true);
  assertEquals(/stack|exception|error:|undefined/i.test(ALL_TIERS_FAILED_BODY.message), false);
});

Deno.test('disabled tiers are skipped (no call): global budget exhausted / no Claude key', async () => {
  const t = [
    tier('groq-primary', 'groq', () => Promise.resolve(ok()), { enabled: false }),
    tier('groq-small', 'groq', () => Promise.resolve(ok()), { enabled: false }),
    tier('claude-text-fallback', 'anthropic', () => Promise.resolve(ok('c'))),
  ];
  const r = await runProviderChain(t, { log: quiet });
  assertEquals(r.tier?.name, 'claude-text-fallback');
  assertEquals(r.attempts.filter(a => a.outcome === 'skipped').length, 2);
  assertEquals((t[0] as unknown as Fake).calls, 0);
  // everything disabled => allFailed without any network
  const none = await runProviderChain([tier('x', 'groq', () => Promise.resolve(ok()), { enabled: false })], { log: quiet });
  assertEquals(none.allFailed, true);
});

Deno.test('client disconnect (parent abort) stops the chain', async () => {
  const ac = new AbortController(); ac.abort();
  const t = standard(() => ok());
  const r = await runProviderChain(t, { log: quiet, parentSignal: ac.signal });
  assertEquals(r.allFailed, true);
  assertEquals((t[0] as unknown as Fake).calls, 0);
});

Deno.test('a failed tier response body is cancelled (no leaked streams)', async () => {
  let cancelled = false;
  const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('x')); }, cancel() { cancelled = true; } });
  const t = [
    tier('groq-primary', 'groq', () => Promise.resolve(new Response(body, { status: 503 }))),
    tier('groq-small', 'groq', () => Promise.resolve(ok())),
  ];
  await runProviderChain(t, { log: quiet });
  assertEquals(cancelled, true);
});

// ── Streaming ────────────────────────────────────────────────────────────────
const sse = (lines: string[]) => new Response(lines.map(l => `${l}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } });
async function readAll(r: Response | ReadableStream<Uint8Array>): Promise<string> {
  const stream = r instanceof Response ? r.body! : r;
  const reader = stream.getReader(); const dec = new TextDecoder(); let out = '';
  while (true) { const { done, value } = await reader.read(); if (done) break; out += dec.decode(value, { stream: true }); }
  return out;
}
const dataChunks = (raw: string) => raw.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6).trim()).filter(x => x && x !== '[DONE]').map(x => JSON.parse(x));

Deno.test('streaming: a Groq SSE response passes through the chain untouched', async () => {
  const groq = sse(['data: {"choices":[{"delta":{"content":"Hel"}}]}', 'data: {"choices":[{"delta":{"content":"lo"}}]}', 'data: [DONE]']);
  const r = await runProviderChain(standard(() => groq), { log: quiet });
  const chunks = dataChunks(await readAll(r.response!));
  assertEquals(chunks.map(c => c.choices[0].delta.content).join(''), 'Hello');
});

Deno.test('streaming: Claude SSE is translated to OpenAI-shaped chunks + [DONE] (fallback stream)', async () => {
  const anthropic = sse([
    'event: message_start\ndata: {"type":"message_start"}',
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Namaste "}}',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"student"}}',
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}',
    'data: {"type":"message_stop"}',
  ]);
  const t = standard(() => status(503), () => status(429), () => new Response(anthropicToOpenAIStream(anthropic.body!), { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
  const r = await runProviderChain(t, { log: quiet });
  assertEquals(r.tier?.name, 'claude-text-fallback');
  const raw = await readAll(r.response!);
  assert(raw.trimEnd().endsWith('data: [DONE]'));
  const chunks = dataChunks(raw);
  assertEquals(chunks.filter(c => c.choices[0].delta.content).map(c => c.choices[0].delta.content).join(''), 'Namaste student');
  assertEquals(chunks[chunks.length - 1].choices[0].finish_reason, 'stop');
});

// ── Tool calls (Claude tool_use translation) ─────────────────────────────────
Deno.test('tool calls: OpenAI tool_calls / role:tool history -> Anthropic tool_use / tool_result blocks', () => {
  const { system, messages } = toAnthropicMessages([
    { role: 'system', content: 'You are Novo' },
    { role: 'user', content: 'what are my weak topics?' },
    { role: 'assistant', content: 'Checking.', tool_calls: [{ id: 'call_1', function: { name: 'get_student_weakness', arguments: '{"limit":3}' } }] },
    { role: 'tool', tool_call_id: 'call_1', content: 'Torque (Physics)' },
  ]);
  assertEquals(system, 'You are Novo');
  assertEquals(messages.length, 3);
  assertEquals(messages[1].role, 'assistant');
  const blocks = messages[1].content as Array<Record<string, unknown>>;
  assertEquals(blocks[0], { type: 'text', text: 'Checking.' });
  assertEquals(blocks[1], { type: 'tool_use', id: 'call_1', name: 'get_student_weakness', input: { limit: 3 } });
  assertEquals(messages[2].role, 'user');
  assertEquals((messages[2].content as Array<Record<string, unknown>>)[0], { type: 'tool_result', tool_use_id: 'call_1', content: 'Torque (Physics)' });
});

Deno.test('tool calls: malformed tool arguments degrade to empty input instead of throwing', () => {
  const { messages } = toAnthropicMessages([{ role: 'assistant', content: null, tool_calls: [{ id: 'c', function: { name: 'x', arguments: '{oops' } }] }]);
  assertEquals((messages[0].content as Array<{ input: unknown }>)[0].input, {});
});

Deno.test('tool calls: tool definitions -> Anthropic input_schema', () => {
  const out = toAnthropicTools([{ function: { name: 'create_note', description: 'save', parameters: { type: 'object' } } }]);
  assertEquals(out, [{ name: 'create_note', description: 'save', input_schema: { type: 'object' } }]);
});

Deno.test('tool calls: non-streaming tool_use response -> OpenAI tool_calls with finish_reason tool_calls', () => {
  const o = anthropicJsonToOpenAI({ stop_reason: 'tool_use', content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', id: 't1', name: 'log_weak_topic', input: { topic: 'Torque' } }] }) as {
    choices: Array<{ finish_reason: string; message: { content: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }> };
  assertEquals(o.choices[0].finish_reason, 'tool_calls');
  assertEquals(o.choices[0].message.tool_calls![0], { id: 't1', function: { name: 'log_weak_topic', arguments: '{"topic":"Torque"}' } });
  const plain = anthropicJsonToOpenAI({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'hi' }] }) as typeof o;
  assertEquals(plain.choices[0].message.content, 'hi');
  assertEquals(plain.choices[0].message.tool_calls, undefined);
});

Deno.test('tool calls: streaming tool_use is translated into accumulating tool_calls deltas', async () => {
  const anthropic = sse([
    'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tu_1","name":"create_note"}}',
    'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"title\\":"}}',
    'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\\"Torque\\"}"}}',
    'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}',
    'data: {"type":"message_stop"}',
  ]);
  const chunks = dataChunks(await readAll(anthropicToOpenAIStream(anthropic.body!)));
  const calls = chunks.flatMap(c => c.choices[0].delta.tool_calls ?? []);
  assertEquals(calls[0].id, 'tu_1');
  assertEquals(calls[0].function.name, 'create_note');
  assertEquals(calls.map((c: { function: { arguments?: string } }) => c.function.arguments ?? '').join(''), '{"title":"Torque"}');
  assertEquals(chunks[chunks.length - 1].choices[0].finish_reason, 'tool_calls');
});
