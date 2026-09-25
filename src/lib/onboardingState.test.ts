import { describe, it, expect, beforeEach } from 'vitest';
import {
  EMPTY_DRAFT, TOTAL_STEPS, canProceed, loadDraft, saveDraft, clearDraft, buildProfileUpdate,
  needsOnboarding, hasCompletedOnboarding, V5_ONBOARDING_COHORT_CUTOFF_ISO, type OnboardingDraft,
} from '@/lib/onboardingState';

beforeEach(() => localStorage.clear());
const full: OnboardingDraft = { step: 2, examName: 'NEET', examDate: '2099-05-05', studyLevel: 'jee_neet', subjects: ['Physics', 'Biology'], language: 'hi' };

describe('onboarding is three short steps', () => {
  it('has 3 steps', () => expect(TOTAL_STEPS).toBe(3));
  it('exam step is answerable with GENERAL (never blocks a learner who is unsure)', () => {
    expect(canProceed(0, EMPTY_DRAFT)).toBe(false);
    expect(canProceed(0, { ...EMPTY_DRAFT, examName: 'GENERAL' })).toBe(true);
  });
  it('level + at least one subject required on step 2; language on step 3', () => {
    expect(canProceed(1, { ...EMPTY_DRAFT, studyLevel: 'school' })).toBe(false);
    expect(canProceed(1, { ...EMPTY_DRAFT, studyLevel: 'school', subjects: ['Physics'] })).toBe(true);
    expect(canProceed(2, { ...EMPTY_DRAFT, language: '' })).toBe(false);
    expect(canProceed(2, EMPTY_DRAFT)).toBe(true);
  });
});

describe('resume after app kill', () => {
  it('round-trips a draft per user and isolates users', () => {
    saveDraft('u1', full);
    expect(loadDraft('u1')).toEqual(full);
    expect(loadDraft('u2')).toEqual(EMPTY_DRAFT);
  });
  it('survives corrupt storage and clamps a bad step', () => {
    localStorage.setItem('edora_onboarding_draft_u1', '{not json');
    expect(loadDraft('u1')).toEqual(EMPTY_DRAFT);
    localStorage.setItem('edora_onboarding_draft_u1', JSON.stringify({ ...full, step: 99, studyLevel: 'nope' }));
    const d = loadDraft('u1');
    expect(d.step).toBe(TOTAL_STEPS - 1);
    expect(d.studyLevel).toBe('');
  });
  it('clearDraft removes it', () => { saveDraft('u1', full); clearDraft('u1'); expect(loadDraft('u1')).toEqual(EMPTY_DRAFT); });
});

describe('buildProfileUpdate only uses columns that EXIST in production', () => {
  // Verified production profiles columns (2026-09-25): no `onboarding_completed`, no `subjects`.
  const PROD_COLUMNS = new Set(['study_level', 'preferred_language', 'exam_name', 'exam_date', 'study_preferences']);
  it('writes existing columns only, exam_name never null', () => {
    const u = buildProfileUpdate(full, null, new Date('2026-10-01T00:00:00Z'));
    for (const k of Object.keys(u)) expect(PROD_COLUMNS.has(k)).toBe(true);
    expect(u.exam_name).toBe('NEET');
    expect(u.exam_date).toBe('2099-05-05');
    expect(u.study_preferences.subjects).toEqual(['Physics', 'Biology']);
    expect(u.study_preferences.onboarding_completed_at).toBe('2026-10-01T00:00:00.000Z');
  });
  it('GENERAL for an unanswered/skip case, with no exam date', () => {
    const u = buildProfileUpdate({ ...EMPTY_DRAFT }, null);
    expect(u.exam_name).toBe('GENERAL');
    expect(u.exam_date).toBeNull();
    expect(u.study_level).toBe('school');
  });
  it('merges into existing study_preferences instead of replacing it', () => {
    const u = buildProfileUpdate(full, { theme: 'dark', keep: 1 });
    expect(u.study_preferences.theme).toBe('dark');
    expect(u.study_preferences.keep).toBe(1);
  });
});

describe('who is sent to onboarding — fixed cohort cutoff, not a rolling window', () => {
  const cutoff = Date.parse(V5_ONBOARDING_COHORT_CUTOFF_ISO);
  const at = (msFromCutoff: number) => new Date(cutoff + msFromCutoff).toISOString();
  const HOUR = 3_600_000, DAY = 24 * HOUR;

  it('the cutoff is after every existing production learner (newest profile: 2026-08-31)', () => {
    expect(cutoff).toBeGreaterThan(Date.parse('2026-08-31T23:59:59Z'));
  });
  it('pre-cutoff user, no marker => NOT forced (existing users are never sent to onboarding)', () => {
    expect(needsOnboarding({ created_at: '2026-06-03T00:00:00Z', study_preferences: {} })).toBe(false);
    expect(needsOnboarding({ created_at: at(-1), study_preferences: null })).toBe(false);
  });
  it('post-cutoff user, no marker, returning 2 hours later => forced', () => {
    expect(needsOnboarding({ created_at: at(2 * HOUR), study_preferences: {} })).toBe(true);
  });
  it('post-cutoff user, no marker, returning 3 days later => STILL forced (no 24 h expiry)', () => {
    expect(needsOnboarding({ created_at: at(3 * DAY), study_preferences: {} })).toBe(true);
  });
  it('post-cutoff user, no marker, returning 3 WEEKS later => still forced', () => {
    expect(needsOnboarding({ created_at: at(21 * DAY), study_preferences: null })).toBe(true);
  });
  it('the decision does not depend on the current time at all', () => {
    const p = { created_at: at(HOUR), study_preferences: {} };
    const realNow = Date.now;
    try {
      Date.now = () => cutoff + 400 * DAY;
      expect(needsOnboarding(p)).toBe(true);
    } finally { Date.now = realNow; }
  });
  it('post-cutoff user WITH the marker => not forced', () => {
    const p = { created_at: at(HOUR), study_preferences: { onboarding_completed_at: at(2 * HOUR) } };
    expect(hasCompletedOnboarding(p)).toBe(true);
    expect(needsOnboarding(p)).toBe(false);
  });
  it('exactly at the cutoff instant counts as V5-era', () => expect(needsOnboarding({ created_at: at(0), study_preferences: {} })).toBe(true));
  it('invalid / missing created_at, or no profile => safe: never forced', () => {
    expect(needsOnboarding({ created_at: 'garbage' })).toBe(false);
    expect(needsOnboarding({ created_at: null })).toBe(false);
    expect(needsOnboarding({})).toBe(false);
    expect(needsOnboarding(null)).toBe(false);
    expect(needsOnboarding(undefined)).toBe(false);
  });
});
