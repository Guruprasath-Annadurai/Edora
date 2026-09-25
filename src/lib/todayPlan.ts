// Today's Plan — client consumption layer (V5 Day 7). PURE functions only.
//
// The database (public.get_today_plan, migration 20260930000000) is the ONLY authority for what appears and in
// what order (review_due > fix_weak > diagnostic > learn_next > exam_push). Nothing here re-ranks, re-derives or
// calls AI. This file (1) validates what the backend returned so an arbitrary string can never become a
// navigation target, (2) filters by app flags WITHOUT mutating the result, (3) supplies a deterministic,
// non-personalised fallback, and (4) turns a plan item into a safe, whitelisted navigation destination.

export const PLAN_KINDS = ['review_due', 'fix_weak', 'diagnostic', 'learn_next', 'exam_push'] as const;
export type PlanKind = typeof PLAN_KINDS[number];

export const PLAN_PATHS = ['/spaced-review', '/practice', '/pyq-bank'] as const;
export type PlanPath = typeof PLAN_PATHS[number];

/** The route each kind is allowed to target (matches the backend contract). */
export const KIND_PATH: Record<PlanKind, PlanPath> = {
  review_due: '/spaced-review',
  fix_weak: '/practice',
  diagnostic: '/practice',
  learn_next: '/practice',
  exam_push: '/pyq-bank',
};

export const MAX_PLAN_ITEMS = 3;
const MAX_DURATION_MIN = 240;

/** One validated row of get_today_plan(). `kind` is the semantic key for future en/hi Home copy; `title` is the
 *  server English string, kept only as a fallback/debug value. */
export interface PlanItem {
  kind: PlanKind;
  priority: number;
  title: string;
  duration_minutes: number;
  target_path: PlanPath;
  target_params: Record<string, unknown>;
  subject: string | null;
  chapter: string | null;
  topic: string | null;
  reason: Record<string, unknown>;
}

export type FallbackKind = 'fallback_practice' | 'fallback_novo';
export interface FallbackItem {
  kind: FallbackKind;
  priority: number;
  title: string;
  duration_minutes: number;
  target_path: '/practice' | '/chat';
  target_params: Record<string, never>;
  subject: null; chapter: null; topic: null;
  reason: Record<string, never>;
}
export type TodayPlanItem = PlanItem | FallbackItem;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStrOrNull = (v: unknown): v is string | null => v === null || v === undefined || typeof v === 'string';
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Returns the item if it is well-formed and safe, otherwise null. Never throws. */
export function validatePlanRow(row: unknown): PlanItem | null {
  if (!isObj(row)) return null;
  const { kind, priority, title, duration_minutes, target_path, target_params, subject, chapter, topic, reason } = row;
  if (typeof kind !== 'string' || !(PLAN_KINDS as readonly string[]).includes(kind)) return null;
  if (typeof target_path !== 'string' || !(PLAN_PATHS as readonly string[]).includes(target_path)) return null;
  if (KIND_PATH[kind as PlanKind] !== target_path) return null;              // kind/path must agree
  if (!isInt(priority) || priority < 1 || priority > PLAN_KINDS.length) return null;
  if (!isInt(duration_minutes) || duration_minutes <= 0 || duration_minutes > MAX_DURATION_MIN) return null;
  if (!isObj(target_params)) return null;
  if (typeof title !== 'string' || title.trim() === '') return null;
  if (!isStrOrNull(subject) || !isStrOrNull(chapter) || !isStrOrNull(topic)) return null;
  const reasonObj = reason === null || reason === undefined ? {} : reason;
  if (!isObj(reasonObj)) return null;
  return {
    kind: kind as PlanKind, priority, title, duration_minutes, target_path: target_path as PlanPath,
    target_params, subject: (subject as string | null) ?? null, chapter: (chapter as string | null) ?? null,
    topic: (topic as string | null) ?? null, reason: reasonObj,
  };
}

/** Validate a raw RPC payload: keep server order, drop malformed rows, cap at 3. Non-arrays yield []. */
export function validatePlanRows(raw: unknown): PlanItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanItem[] = [];
  for (const r of raw) {
    const v = validatePlanRow(r);
    if (v) out.push(v);
    if (out.length >= MAX_PLAN_ITEMS) break;
  }
  return out;
}

export interface PlanFlags { novo_enabled: boolean; pyq_enabled: boolean }

/** Client-side flag filter. Returns a NEW array; the input (cached RPC result) is never mutated. */
export function filterPlanByFlags(items: readonly PlanItem[], flags: PlanFlags): PlanItem[] {
  return items.filter(i => !(i.target_path === '/pyq-bank' && !flags.pyq_enabled));
}

/** Deterministic, NON-personalised fallback. Ask Novo only when Novo is enabled. No AI involved. */
export function buildFallbackPlan(flags: Pick<PlanFlags, 'novo_enabled'>): FallbackItem[] {
  const items: FallbackItem[] = [{
    kind: 'fallback_practice', priority: 1, title: 'Practice', duration_minutes: 10,
    target_path: '/practice', target_params: {}, subject: null, chapter: null, topic: null, reason: {},
  }];
  if (flags.novo_enabled) {
    items.push({
      kind: 'fallback_novo', priority: 2, title: 'Ask Novo', duration_minutes: 5,
      target_path: '/chat', target_params: {}, subject: null, chapter: null, topic: null, reason: {},
    });
  }
  return items;
}

// ── Safe navigation ─────────────────────────────────────────────────────────
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeText(v: unknown, max = 120): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  // eslint-disable-next-line no-control-regex
  if (t === '' || t.length > max || /[\u0000-\u001f\u007f]/.test(t)) return null;
  return t;
}
function safeInt(v: unknown, min: number, max: number): number | null {
  return isInt(v) && v >= min && v <= max ? v : null;
}

type ParamSpec = Record<string, (v: unknown) => string | null>;
const one = (want: string) => (v: unknown) => (v === want ? want : null);

/** The ONLY params each kind may forward. Anything else in target_params is dropped. */
const PARAM_WHITELIST: Record<PlanKind, ParamSpec> = {
  review_due: { due_count: v => { const n = safeInt(v, 0, 100000); return n === null ? null : String(n); } },
  fix_weak: { mode: one('weak_topic'), subject: v => safeText(v), subtopic: v => safeText(v) },
  diagnostic: { mode: one('diagnostic'), questions_count: v => { const n = safeInt(v, 1, 20); return n === null ? null : String(n); } },
  learn_next: {
    mode: one('learn_next'),
    class: v => { const n = safeInt(v, 1, 14); return n === null ? null : String(n); },
    subject: v => safeText(v),
    chapter_id: v => (typeof v === 'string' && UUID.test(v) ? v.toLowerCase() : null),
    chapter: v => safeText(v),
  },
  exam_push: {
    exam: v => safeText(v, 60),
    days_remaining: v => { const n = safeInt(v, 0, 365); return n === null ? null : String(n); },
  },
};

export interface PlanDestination { pathname: string; search: string; to: string }

/** Convert a plan item to a client navigation target. Only whitelisted, type-checked params survive. */
export function planItemDestination(item: TodayPlanItem): PlanDestination {
  if (item.kind === 'fallback_practice') return { pathname: '/practice', search: '', to: '/practice' };
  if (item.kind === 'fallback_novo') return { pathname: '/chat', search: '', to: '/chat' };
  const pathname = KIND_PATH[item.kind];                       // never item.target_path: path comes from the kind
  const params = new URLSearchParams();
  const spec = PARAM_WHITELIST[item.kind];
  for (const [key, coerce] of Object.entries(spec)) {
    const v = coerce(item.target_params[key]);
    if (v !== null) params.set(key, v);
  }
  const qs = params.toString();
  return { pathname, search: qs ? `?${qs}` : '', to: qs ? `${pathname}?${qs}` : pathname };
}
