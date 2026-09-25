// Pure evaluation of the ai_success_rate_by_function_provider view (V5 Day 2).
// Used by monitoring-check; separated so the alert rules are unit-tested.

export interface AiHealthRow {
  function_name: string;
  provider: string;
  attempts_24h: number;
  successes_24h: number;
  success_pct_24h: number | null;
  permanent_4xx_24h?: number;
}

export interface AiHealthAlert { severity: 'critical' | 'warning'; text: string }

/** Functions whose AI path is required for a core user experience. Helper rows (name:suffix) roll up to their function. */
export const REQUIRED_AI_FUNCTIONS = [
  'gemini-chat', 'ai-question-gen', 'lesson-planner', 'study-pack-generator',
  'revision-planner', 'roadmap-generator', 'gemini-vision', 'novo-cron-proactive', 'novo-morning-brief',
];

export const MIN_ATTEMPTS_FOR_RATE_ALERT = 20;
export const MIN_SUCCESS_PCT = 98;

const baseName = (fn: string) => fn.split(':')[0];

export function evaluateAiHealth(rows: AiHealthRow[], required: string[] = REQUIRED_AI_FUNCTIONS): AiHealthAlert[] {
  const alerts: AiHealthAlert[] = [];
  const perFn = new Map<string, { attempts: number; successes: number; perm: number }>();
  for (const r of rows) {
    // main-path rows only for the per-function success rule (helper rows carry a ':suffix')
    if (r.function_name.includes(':')) continue;
    const a = perFn.get(r.function_name) ?? { attempts: 0, successes: 0, perm: 0 };
    a.attempts += r.attempts_24h; a.successes += r.successes_24h; a.perm += r.permanent_4xx_24h ?? 0;
    perFn.set(r.function_name, a);
  }
  for (const fn of required) {
    const a = perFn.get(fn);
    if (!a || a.attempts === 0) continue;                       // no traffic in 24 h is not a failure by itself
    if (a.successes === 0) {
      alerts.push({ severity: 'critical', text: `*AI function \`${fn}\` had 0 successes in 24h* (${a.attempts} attempts${a.perm ? `, ${a.perm} permanent 4xx — key/model/permission problem, retrying will not help` : ''})` });
    } else if (a.attempts >= MIN_ATTEMPTS_FOR_RATE_ALERT && (100 * a.successes) / a.attempts < MIN_SUCCESS_PCT) {
      alerts.push({ severity: 'warning', text: `*AI function \`${fn}\` success rate ${(100 * a.successes / a.attempts).toFixed(1)}% over 24h* (${a.successes}/${a.attempts}; target ≥ ${MIN_SUCCESS_PCT}%)` });
    }
  }
  // Provider-level: a provider with attempts but zero successes is reported separately (e.g. Gemini key dead).
  const perProvider = new Map<string, { attempts: number; successes: number }>();
  for (const r of rows) {
    const key = `${baseName(r.function_name)}|${r.provider}`;
    const a = perProvider.get(key) ?? { attempts: 0, successes: 0 };
    a.attempts += r.attempts_24h; a.successes += r.successes_24h;
    perProvider.set(key, a);
  }
  const byProv = new Map<string, { attempts: number; successes: number }>();
  for (const [k, v] of perProvider) {
    const p = k.split('|')[1];
    const a = byProv.get(p) ?? { attempts: 0, successes: 0 };
    a.attempts += v.attempts; a.successes += v.successes;
    byProv.set(p, a);
  }
  for (const [p, a] of byProv) {
    if (a.attempts >= 5 && a.successes === 0) {
      alerts.push({ severity: 'warning', text: `*AI provider \`${p}\` had 0 successes in 24h* (${a.attempts} attempts across all functions)` });
    }
  }
  return alerts;
}
