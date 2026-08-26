// deno-lint-ignore-file no-explicit-any
// ─────────────────────────────────────────────────────────────────────────────
// Central AI gateway — Phase 7 of the enterprise remediation mandate
// (RISK-006, High). Before this, every edge function called Gemini/Groq/
// NVIDIA directly via a bare fetch() — no shared kill switch, no cost
// tracking, no way to see total AI spend without querying three different
// providers' own dashboards.
//
// This module is the enforcement point. It does not replace the ~39
// existing direct-fetch call sites in one pass (that migration is real,
// ongoing work — see docs/enterprise/AI_GATEWAY_MIGRATION.md for the
// tracked list); it establishes the pattern and is fully wired into
// ai-question-gen as the first migrated call site.
//
// Usage:
//   import { callAI } from '../_shared/aiGateway.ts';
//   const result = await callAI(serviceDb, {
//     functionName: 'ai-question-gen',
//     provider: 'groq',
//     model: 'llama-3.3-70b-versatile',
//     userId: user.id,
//     url: GROQ_API_URL,
//     init: { method: 'POST', headers: {...}, body: JSON.stringify({...}) },
//   });
//   if (!result.ok) { /* result.blockedReason tells you why */ }
//   const data = await result.response!.json();
// ─────────────────────────────────────────────────────────────────────────────

export type AIProvider = 'groq' | 'gemini' | 'nvidia' | 'other';

export interface CallAIOptions {
  functionName: string;
  provider: AIProvider;
  model: string;
  userId?: string | null;
  url: string;
  init: RequestInit;
  /** Extracted from the provider's response after a successful call, for cost estimation/logging. Optional — not every call site parses token counts yet. */
  extractUsage?: (responseJson: any) => { promptTokens?: number; completionTokens?: number };
  /** Which registered prompt (see getActivePrompt/ai_prompt_versions) produced this call, if any. Purely for traceability in ai_gateway_requests — passing neither is fine for call sites not yet on the registry. */
  promptKey?: string;
  promptVersion?: number;
}

export interface CallAIResult {
  ok: boolean;
  response: Response | null;
  blockedReason: 'kill_switch' | 'cost_ceiling' | null;
  errorMessage: string | null;
}

// Rough $/1M-token rates for cost estimation — not billing-accurate (providers
// bill on their own metering, not this), good enough to make the daily
// ceiling meaningful and to spot which functions actually cost money. Update
// when a provider's pricing changes; being slightly stale doesn't compromise
// the kill switch (that check doesn't depend on cost estimates at all).
const COST_PER_1M_TOKENS_USD: Record<string, { input: number; output: number }> = {
  // llama-3.3-70b-versatile, llama-3.1-8b-instant, gemini-2.0-flash, and
  // gemini-1.5-flash were all confirmed decommissioned by their providers
  // (2026-08-16/18) — kept here only so aiGateway.test.ts's existing cost
  // assertions (written against these keys) keep passing; no live call site
  // uses these model strings anymore as of 2026-08-18.
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
  'llama-3.1-8b-instant':    { input: 0.05, output: 0.08 },
  'gemini-2.0-flash':        { input: 0.10, output: 0.40 },
  'gemini-1.5-flash':        { input: 0.075, output: 0.30 },
  'gemini-embedding-001':    { input: 0.0, output: 0.0 }, // embeddings — no completion cost
  // Current models (2026-08-18). Pricing is an estimate carried over from
  // the similarly-sized llama-3.3-70b/3.1-8b entries above, not fetched from
  // Groq's live pricing page — good enough to keep the cost ceiling
  // meaningful, but flagged here as needing a real-pricing check.
  'openai/gpt-oss-120b':     { input: 0.59, output: 0.79 },
  'openai/gpt-oss-20b':      { input: 0.05, output: 0.08 },
  'gemini-flash-latest':     { input: 0.10, output: 0.40 },
};

function estimateCostUsd(model: string, promptTokens?: number, completionTokens?: number): number | null {
  const rates = COST_PER_1M_TOKENS_USD[model];
  if (!rates || (promptTokens === undefined && completionTokens === undefined)) return null;
  const inputCost  = ((promptTokens ?? 0) / 1_000_000) * rates.input;
  const outputCost = ((completionTokens ?? 0) / 1_000_000) * rates.output;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 6dp
}

async function logRequest(serviceDb: any, entry: {
  functionName: string; provider: string; model: string; userId?: string | null;
  promptTokens?: number; completionTokens?: number; estimatedCostUsd?: number | null;
  status: 'success' | 'error' | 'blocked_kill_switch' | 'blocked_cost_ceiling';
  latencyMs?: number; errorMessage?: string | null;
  promptKey?: string | null; promptVersion?: number | null;
}): Promise<void> {
  try {
    await serviceDb.from('ai_gateway_requests').insert({
      function_name:      entry.functionName,
      provider:            entry.provider,
      model:                entry.model,
      user_id:              entry.userId ?? null,
      prompt_tokens:        entry.promptTokens ?? null,
      completion_tokens:    entry.completionTokens ?? null,
      estimated_cost_usd:   entry.estimatedCostUsd ?? null,
      status:                entry.status,
      latency_ms:           entry.latencyMs ?? null,
      error_message:        entry.errorMessage ?? null,
      prompt_key:           entry.promptKey ?? null,
      prompt_version:       entry.promptVersion ?? null,
    });
  } catch (err) {
    // Logging must never break the actual AI call it's describing.
    console.error('[aiGateway] failed to log request:', (err as Error)?.message);
  }
}

/**
 * Fetch the active version of a registered prompt template. Returns null if
 * the key was never registered (or the read fails) — callers should fall
 * back to their own inline prompt in that case, never throw. This is what
 * makes prompt-registry adoption non-breaking: a function can start reading
 * from the registry the moment a prompt_key exists for it, without every
 * OTHER unmigrated function needing one first.
 */
export async function getActivePrompt(
  serviceDb: any,
  promptKey: string,
): Promise<{ version: number; template: string } | null> {
  try {
    const { data, error } = await serviceDb
      .from('ai_prompt_versions')
      .select('version, template')
      .eq('prompt_key', promptKey)
      .eq('is_active', true)
      .single();
    if (error || !data) return null;
    return { version: data.version, template: data.template };
  } catch {
    return null;
  }
}

/**
 * Register a new version of a prompt and make it the active one. Intended
 * for admin-console use (has_role(uid,'admin')-gated), not called from
 * user-facing request paths. Deactivates the previous active version for
 * the same key in the same call so ai_prompt_versions_one_active_idx is
 * never violated.
 */
export async function registerPromptVersion(
  serviceDb: any,
  opts: { promptKey: string; template: string; notes?: string; createdBy?: string },
): Promise<{ version: number } | null> {
  try {
    const { data: existing } = await serviceDb
      .from('ai_prompt_versions')
      .select('version')
      .eq('prompt_key', opts.promptKey)
      .order('version', { ascending: false })
      .limit(1);
    const nextVersion = (existing?.[0]?.version ?? 0) + 1;

    await serviceDb
      .from('ai_prompt_versions')
      .update({ is_active: false })
      .eq('prompt_key', opts.promptKey)
      .eq('is_active', true);

    const { error } = await serviceDb.from('ai_prompt_versions').insert({
      prompt_key: opts.promptKey,
      version: nextVersion,
      template: opts.template,
      notes: opts.notes ?? null,
      is_active: true,
      created_by: opts.createdBy ?? null,
    });
    if (error) return null;
    return { version: nextVersion };
  } catch {
    return null;
  }
}

/**
 * Gate + call an AI provider. Checks the kill switch and today's cost
 * ceiling before ever reaching the network; logs every call (including
 * blocked ones) to ai_gateway_requests.
 *
 * Fails CLOSED on a config-read error — a transient DB outage should block
 * paid AI calls, not silently let them through unmetered (same principle
 * _shared/rateLimit.ts already applies to rate limiting).
 */
export async function callAI(serviceDb: any, opts: CallAIOptions): Promise<CallAIResult> {
  const { functionName, provider, model, userId, url, init, extractUsage, promptKey, promptVersion } = opts;

  const { data: config, error: configErr } = await serviceDb
    .from('ai_gateway_config')
    .select('ai_enabled, daily_cost_ceiling_usd')
    .eq('id', true)
    .single();

  if (configErr || !config) {
    await logRequest(serviceDb, { functionName, provider, model, userId, status: 'blocked_kill_switch', errorMessage: 'ai_gateway_config unreadable — failing closed', promptKey, promptVersion });
    return { ok: false, response: null, blockedReason: 'kill_switch', errorMessage: 'AI gateway configuration unavailable' };
  }

  if (!config.ai_enabled) {
    await logRequest(serviceDb, { functionName, provider, model, userId, status: 'blocked_kill_switch', promptKey, promptVersion });
    return { ok: false, response: null, blockedReason: 'kill_switch', errorMessage: 'AI calls are currently disabled (kill switch on)' };
  }

  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
  const { data: todaysCost } = await serviceDb
    .from('ai_gateway_requests')
    .select('estimated_cost_usd')
    .gte('created_at', todayStart.toISOString())
    .not('estimated_cost_usd', 'is', null);
  const spentToday = (todaysCost ?? []).reduce((sum: number, r: { estimated_cost_usd: number }) => sum + (r.estimated_cost_usd ?? 0), 0);

  if (spentToday >= config.daily_cost_ceiling_usd) {
    await logRequest(serviceDb, { functionName, provider, model, userId, status: 'blocked_cost_ceiling', errorMessage: `daily ceiling $${config.daily_cost_ceiling_usd} reached (spent $${spentToday.toFixed(2)})`, promptKey, promptVersion });
    return { ok: false, response: null, blockedReason: 'cost_ceiling', errorMessage: 'Daily AI cost ceiling reached — try again tomorrow' };
  }

  const startedAt = Date.now();
  try {
    const response = await fetch(url, init);
    const latencyMs = Date.now() - startedAt;

    let promptTokens: number | undefined;
    let completionTokens: number | undefined;
    if (response.ok && extractUsage) {
      try {
        const cloned = response.clone();
        const json = await cloned.json();
        const usage = extractUsage(json);
        promptTokens = usage.promptTokens;
        completionTokens = usage.completionTokens;
      } catch {
        // Response body isn't valid JSON, or doesn't match the expected
        // usage shape — cost estimation is best-effort, never block on it.
      }
    }

    await logRequest(serviceDb, {
      functionName, provider, model, userId, promptTokens, completionTokens,
      estimatedCostUsd: estimateCostUsd(model, promptTokens, completionTokens),
      status: response.ok ? 'success' : 'error',
      latencyMs,
      errorMessage: response.ok ? null : `HTTP ${response.status}`,
      promptKey, promptVersion,
    });

    return { ok: response.ok, response, blockedReason: null, errorMessage: response.ok ? null : `HTTP ${response.status}` };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const errorMessage = (err as Error)?.message ?? 'network error';
    await logRequest(serviceDb, { functionName, provider, model, userId, status: 'error', latencyMs, errorMessage, promptKey, promptVersion });
    return { ok: false, response: null, blockedReason: null, errorMessage };
  }
}
