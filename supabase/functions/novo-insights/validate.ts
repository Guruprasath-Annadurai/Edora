// Pure validation logic extracted out of index.ts so it can be unit tested
// without triggering index.ts's top-level serve() call.

export interface NovoInsightPayload {
  headline: string;
  weakest_subjects: Array<{ subject: string; score_pct: number; reason: string; study_tip: string }>;
  strongest_subjects: Array<{ subject: string; score_pct: number; reason: string }>;
  streak_insight: string;
  recovery_plan: Array<{ day: string; focus: string; tasks: string[] }>;
  motivation: string;
}

// ── Structural/semantic validator for the full insight payload ────────────────
// A response can come back as valid JSON matching the Gemini response schema
// but still be semantically broken (empty headline, wrong recovery_plan length,
// a day missing tasks, etc). Catching that here lets the caller regenerate the
// whole insight instead of silently patching individual fields with defaults.
export function validateInsight(payload: NovoInsightPayload | null): string | null {
  if (!payload) return 'No payload returned';
  if (!payload.headline || typeof payload.headline !== 'string' || payload.headline.trim().length === 0) {
    return 'Missing or empty "headline"';
  }
  if (!Array.isArray(payload.weakest_subjects)) return '"weakest_subjects" must be an array';
  if (!Array.isArray(payload.strongest_subjects)) return '"strongest_subjects" must be an array';
  if (!payload.streak_insight || typeof payload.streak_insight !== 'string') {
    return 'Missing or empty "streak_insight"';
  }
  if (!Array.isArray(payload.recovery_plan) || payload.recovery_plan.length !== 3) {
    return `"recovery_plan" must have exactly 3 entries, got ${Array.isArray(payload.recovery_plan) ? payload.recovery_plan.length : 'non-array'}`;
  }
  for (let i = 0; i < payload.recovery_plan.length; i++) {
    const day = payload.recovery_plan[i];
    if (!day || typeof day.day !== 'string' || !day.day) return `recovery_plan[${i}]: missing "day"`;
    if (typeof day.focus !== 'string' || !day.focus) return `recovery_plan[${i}]: missing "focus"`;
    if (!Array.isArray(day.tasks) || day.tasks.length === 0) return `recovery_plan[${i}]: "tasks" must be a non-empty array`;
  }
  if (!payload.motivation || typeof payload.motivation !== 'string') {
    return 'Missing or empty "motivation"';
  }
  return null;
}
