# Incident Runbook: AI Provider Outage

**Classification:** Operational Incident Response  
**Applies to:** Groq, Anthropic, and Google AI APIs  

---

## 1. Detection
* **Symptom:** Spike in Edge Function 500s or 504s on `/functions/v1/ai-gateway`.
* **Telemetry:** Query `v_ai_gateway_hourly_metrics` or `v_ai_provider_fallback_summary`:
  ```sql
  SELECT provider, count(*), max(created_at)
  FROM public.v_ai_provider_fallback_summary
  WHERE last_seen >= now() - interval '15 minutes'
  GROUP BY 1;
  ```
* **Client Signal:** Student tutor chat messages returning "AI Tutor is temporarily resting" error toasts.

## 2. User Impact
* Interactive tutoring with Novo is degraded or operating on fallback models.
* Flashcard / quiz generation may take longer or fail.
* **Core curriculum navigation, offline study notes, practice formulas, and quiz submissions are NOT affected.**

## 3. What Should Fail Gracefully
* The AI Gateway cascades: $\text{Groq Primary} \to \text{Groq Fast/Small} \to \text{Claude Text} \to \text{Gemini Text} \to \text{Graceful Local Hint}$.
* The client must display deterministic pre-authored revision cards or hint cards without freezing or crashing the screen.

## 4. What Feature Flag Can Be Used
* In `public.ai_gateway_config`, toggle the global AI kill-switch if provider errors are flooding clients:
  ```sql
  UPDATE public.ai_gateway_config SET is_kill_switch_active = true WHERE id = true;
  ```
  *(To restore: set `is_kill_switch_active = false`)*

## 5. What Must NOT Be Changed
* **DO NOT** commit raw API keys to repository files to "test" alternative models.
* **DO NOT** disable client timeout limits (`AbortSignal`).
* **DO NOT** delete failed rows from `ai_gateway_requests`.

## 6. Recovery Procedure
1. Check vendor status dashboards:
   - Groq: `status.groq.com`
   - Anthropic: `status.anthropic.com`
   - Google Cloud: `status.cloud.google.com`
2. If primary provider (Groq) is down for extended periods, configure the Edge Function environment secret `PRIMARY_AI_PROVIDER` to `claude` or `gemini`.
3. Clear the kill-switch once status stabilizes.

## 7. Evidence Proving Recovery
* Query `v_ai_gateway_hourly_metrics` shows `error_rate_pct < 2%` over the last 15 minutes.
* Sentry reports 0 unhandled promise rejections from `ai-gateway`.
