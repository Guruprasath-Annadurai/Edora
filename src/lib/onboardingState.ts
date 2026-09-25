// Onboarding persistence + gating (V5 Day 6).
//
// Production facts (verified 2026-09-25): public.profiles has NO `onboarding_completed` and NO `subjects`
// column — the previous onboarding update wrote both, so PostgREST rejected the whole update and the result
// was never checked. We store everything in columns that exist: study_level, preferred_language, exam_name,
// exam_date, and study_preferences (jsonb) for subjects + the V5 completion marker.
import { resolveExamName, normaliseExamDate } from '@/lib/examTargets';

export const ONBOARDING_VERSION = 'v5';
/**
 * Fixed product-cohort cutoff (V5 onboarding activation point), NOT a rolling window.
 *  - profile created BEFORE this instant  = pre-V5 learner: never forced through onboarding
 *    (GENERAL/NULL exam gets the dismissible exam nudge instead).
 *  - profile created AT/AFTER it and no `study_preferences.onboarding_completed_at` marker = V5-era learner:
 *    sent to onboarding whenever they next open the app (2 hours, 2 days or 2 weeks later — no expiry).
 * Basis: production had 42 profiles, the newest created 2026-08-31, so 2026-09-27 00:00 UTC is after every
 * existing learner. Set this to the release date at the release gate if it needs to move (must be <= the day
 * the V5 build reaches users; a later-than-release value would let early V5 signups skip onboarding).
 */
export const V5_ONBOARDING_COHORT_CUTOFF_ISO = '2026-09-27T00:00:00.000Z';
const V5_ONBOARDING_COHORT_CUTOFF_MS = Date.parse(V5_ONBOARDING_COHORT_CUTOFF_ISO);
export const STUDY_LEVELS = ['school', 'college', 'jee_neet', 'sat_act'] as const;
export type StudyLevel = typeof STUDY_LEVELS[number];

export interface OnboardingDraft {
  step: number;                 // 0..2
  examName: string;             // '' until chosen
  examDate: string;             // '' or yyyy-mm-dd
  studyLevel: StudyLevel | '';
  subjects: string[];
  language: string;
}

export const EMPTY_DRAFT: OnboardingDraft = { step: 0, examName: '', examDate: '', studyLevel: '', subjects: [], language: 'en' };
export const TOTAL_STEPS = 3;

const draftKey = (uid: string) => `edora_onboarding_draft_${uid}`;

export function loadDraft(uid: string): OnboardingDraft {
  try {
    const raw = JSON.parse(localStorage.getItem(draftKey(uid)) ?? 'null') as Partial<OnboardingDraft> | null;
    if (!raw || typeof raw !== 'object') return { ...EMPTY_DRAFT };
    return {
      step: Number.isInteger(raw.step) ? Math.min(Math.max(raw.step as number, 0), TOTAL_STEPS - 1) : 0,
      examName: typeof raw.examName === 'string' ? raw.examName : '',
      examDate: typeof raw.examDate === 'string' ? raw.examDate : '',
      studyLevel: (STUDY_LEVELS as readonly string[]).includes(raw.studyLevel as string) ? raw.studyLevel as StudyLevel : '',
      subjects: Array.isArray(raw.subjects) ? raw.subjects.filter((s): s is string => typeof s === 'string') : [],
      language: typeof raw.language === 'string' && raw.language ? raw.language : 'en',
    };
  } catch { return { ...EMPTY_DRAFT }; }
}

export function saveDraft(uid: string, d: OnboardingDraft): void {
  try { localStorage.setItem(draftKey(uid), JSON.stringify(d)); } catch { /* storage unavailable: resume is best-effort */ }
}
export function clearDraft(uid: string): void {
  try { localStorage.removeItem(draftKey(uid)); } catch { /* ignore */ }
}

/** Step validators. Exam is always answerable (GENERAL is a valid answer). */
export function canProceed(step: number, d: OnboardingDraft): boolean {
  if (step === 0) return d.examName.trim().length > 0;
  if (step === 1) return d.studyLevel !== '' && d.subjects.length > 0;
  if (step === 2) return d.language.length > 0;
  return false;
}

interface PrefsLike { [k: string]: unknown }

/** Columns to write. Merges into the existing study_preferences instead of replacing it. */
export function buildProfileUpdate(d: OnboardingDraft, existingPrefs: PrefsLike | null | undefined, now: Date = new Date()): {
  study_level: string; preferred_language: string; exam_name: string; exam_date: string | null; study_preferences: PrefsLike;
} {
  const examName = resolveExamName(d.examName);
  return {
    study_level: d.studyLevel || 'school',
    preferred_language: d.language || 'en',
    exam_name: examName,
    exam_date: normaliseExamDate(examName, d.examDate, now),
    study_preferences: {
      ...(existingPrefs ?? {}),
      subjects: d.subjects,
      onboarding_version: ONBOARDING_VERSION,
      onboarding_completed_at: now.toISOString(),
    },
  };
}

interface ProfileForGate { created_at?: string | null; study_preferences?: PrefsLike | null }

export function hasCompletedOnboarding(p: ProfileForGate | null | undefined): boolean {
  return !!p?.study_preferences && typeof p.study_preferences.onboarding_completed_at === 'string';
}

/**
 * True for a V5-era account (created at/after the fixed cutoff) that has not completed onboarding.
 * Safe behaviour: a missing or unparsable created_at, or a missing profile, is treated as "pre-V5" —
 * we never trap a learner in onboarding because of bad data.
 */
export function needsOnboarding(p: ProfileForGate | null | undefined): boolean {
  if (!p || hasCompletedOnboarding(p)) return false;
  const created = p.created_at ? Date.parse(p.created_at) : NaN;
  if (Number.isNaN(created)) return false;
  return created >= V5_ONBOARDING_COHORT_CUTOFF_MS;
}
