import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { evaluateAiHealth, type AiHealthRow } from './aiHealth.ts';

const row = (function_name: string, provider: string, attempts_24h: number, successes_24h: number, permanent_4xx_24h = 0): AiHealthRow =>
  ({ function_name, provider, attempts_24h, successes_24h, success_pct_24h: attempts_24h ? 100 * successes_24h / attempts_24h : null, permanent_4xx_24h });

Deno.test('0 successes in 24h on a required function -> CRITICAL (the novo-morning-brief case)', () => {
  const a = evaluateAiHealth([row('novo-morning-brief', 'gemini', 126, 0, 126)]);
  assertEquals(a.filter(x => x.severity === 'critical').length, 1);
  assertEquals(a[0].text.includes('novo-morning-brief'), true);
  assertEquals(a[0].text.includes('126 permanent 4xx'), true);
});

Deno.test('< 98% with enough attempts -> WARNING; >= 98% -> none; too few attempts -> none', () => {
  assertEquals(evaluateAiHealth([row('gemini-chat', 'groq', 100, 90)]).map(x => x.severity), ['warning']);
  assertEquals(evaluateAiHealth([row('gemini-chat', 'groq', 100, 99)]), []);
  assertEquals(evaluateAiHealth([row('gemini-chat', 'groq', 10, 5)]), []);
});

Deno.test('no traffic is not an alert; non-required functions are ignored', () => {
  assertEquals(evaluateAiHealth([]), []);
  // a non-required function raises no FUNCTION-level alert (the provider-level rule may still note the provider)
  assertEquals(evaluateAiHealth([row('some-other-fn', 'groq', 50, 0)]).filter(x => x.text.includes('some-other-fn')), []);
});

Deno.test('success on ANY provider counts for the function (fallback worked)', () => {
  const a = evaluateAiHealth([row('gemini-chat', 'groq', 30, 0), row('gemini-chat', 'anthropic', 30, 30)]);
  assertEquals(a.filter(x => x.severity === 'critical'), []);   // not a total outage: the fallback served
  // ...but the degraded primary is still visible (rate 50% < 98%) as a warning, which is the point of the alert
  assertEquals(a.some(x => x.severity === 'warning' && x.text.includes('`gemini-chat`')), true);
});

Deno.test('a provider with 0 successes is reported separately as a warning (Gemini key dead)', () => {
  const a = evaluateAiHealth([row('gemini-chat', 'gemini', 40, 0), row('gemini-chat', 'groq', 40, 40)]);
  assertEquals(a.some(x => x.severity === 'warning' && x.text.includes('`gemini`')), true);
});

Deno.test('helper rows (name:suffix) do not distort the per-function rule but feed the provider rule', () => {
  const a = evaluateAiHealth([row('gemini-chat', 'groq', 50, 50), row('gemini-chat:embedding', 'gemini', 30, 0)]);
  assertEquals(a.filter(x => x.severity === 'critical'), []);
  assertEquals(a.some(x => x.text.includes('`gemini`')), true);
});
