// Exam target — deterministic, no AI. Approved list (founder decision D-6):
// JEE Main · JEE Advanced · NEET · CBSE 10 · CBSE 12 · UPSC · CAT · Other / Not sure yet (GENERAL).
//
// The backend (migration 20260927100000) guarantees profiles.exam_name is never NULL:
// a NULL/empty value is normalised to 'GENERAL'. The client mirrors that contract so
// every screen can rely on a non-null, displayable value.

export const GENERAL_EXAM = 'GENERAL';

export interface ExamTargetOption {
  /** Value stored in profiles.exam_name */
  value: string;
  label: string;
  /** Whether a target date makes sense (GENERAL has none). */
  hasDate: boolean;
}

export const EXAM_TARGETS: readonly ExamTargetOption[] = [
  { value: 'JEE Main',     label: 'JEE Main',     hasDate: true  },
  { value: 'JEE Advanced', label: 'JEE Advanced', hasDate: true  },
  { value: 'NEET',         label: 'NEET',         hasDate: true  },
  { value: 'CBSE 10',      label: 'CBSE Class 10', hasDate: true },
  { value: 'CBSE 12',      label: 'CBSE Class 12', hasDate: true },
  { value: 'UPSC',         label: 'UPSC',         hasDate: true  },
  { value: 'CAT',          label: 'CAT',          hasDate: true  },
  { value: GENERAL_EXAM,   label: 'Not sure yet / general study', hasDate: false },
] as const;

/** Older values written by earlier onboarding versions -> the approved list. */
const LEGACY_ALIASES: Record<string, string> = {
  'neet ug': 'NEET',
  'cbse': 'CBSE 12',
  'cbse board': 'CBSE 12',
  'other': GENERAL_EXAM,
  'jee_main': 'JEE Main',
  'jee_adv': 'JEE Advanced',
};

/** Always returns a non-null, non-empty exam name. Unknown free text is kept (an older custom target), NULL/blank -> GENERAL. */
export function resolveExamName(raw: string | null | undefined): string {
  const v = (raw ?? '').trim();
  if (!v) return GENERAL_EXAM;
  if (v.toUpperCase() === GENERAL_EXAM) return GENERAL_EXAM;
  const known = EXAM_TARGETS.find(e => e.value.toLowerCase() === v.toLowerCase());
  if (known) return known.value;
  return LEGACY_ALIASES[v.toLowerCase()] ?? v;
}

export const isGeneralExam = (raw: string | null | undefined): boolean => resolveExamName(raw) === GENERAL_EXAM;

/** Human label for UI ("General study" instead of the raw sentinel). */
export function examDisplayName(raw: string | null | undefined): string {
  const v = resolveExamName(raw);
  if (v === GENERAL_EXAM) return 'General study';
  return EXAM_TARGETS.find(e => e.value === v)?.label ?? v;
}

/** A date is only kept for a specific exam, and only if it is a valid future-or-today ISO date. */
export function normaliseExamDate(examName: string, iso: string | null | undefined, today: Date = new Date()): string | null {
  if (resolveExamName(examName) === GENERAL_EXAM) return null;
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  return d.getTime() >= t.getTime() ? iso : null;
}
