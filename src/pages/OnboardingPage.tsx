import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Check, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { track } from '@/lib/analytics';
import { incrementSession } from '@/lib/appRating';
import { useBackHandler } from '@/hooks/useBackStack';
import { EXAM_TARGETS, GENERAL_EXAM } from '@/lib/examTargets';
import {
  TOTAL_STEPS, canProceed, loadDraft, saveDraft, clearDraft, buildProfileUpdate,
  type OnboardingDraft, type StudyLevel,
} from '@/lib/onboardingState';

// V5 onboarding: three short, deterministic steps. No AI is involved anywhere here.
//   1. Exam target (incl. "Not sure yet" -> GENERAL) + optional date
//   2. Level + subjects
//   3. Language
// Progress is saved locally after every change, so a killed app resumes at the last step, and a failed
// profile save keeps everything on screen with a Retry button — nothing is lost or silently skipped.

const STUDY_LEVELS: { value: StudyLevel; label: string; sub: string }[] = [
  { value: 'school',   label: 'School',     sub: 'Class 6–12' },
  { value: 'college',  label: 'College',    sub: 'UG / PG' },
  { value: 'jee_neet', label: 'JEE / NEET', sub: 'Entrance prep' },
  { value: 'sat_act',  label: 'SAT / ACT',  sub: 'Global tests' },
];

const SUBJECTS = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English', 'History', 'Economics', 'Computer Science'];

// Honest scope: app screens are English + Hindi; Novo (the tutor) can explain in more languages.
const LANGUAGES = [
  { value: 'en', label: 'English', native: 'English' },
  { value: 'hi', label: 'Hindi',   native: 'हिन्दी' },
  { value: 'ta', label: 'Tamil',   native: 'தமிழ்' },
  { value: 'te', label: 'Telugu',  native: 'తెలుగు' },
  { value: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { value: 'mr', label: 'Marathi', native: 'मराठी' },
  { value: 'bn', label: 'Bengali', native: 'বাংলা' },
];

const STEP_COPY = [
  { title: 'What are you preparing for?', body: 'Pick your exam. If you are not sure yet, choose general study — you can change it any time.' },
  { title: 'Your level and subjects', body: 'This helps Novo pick the right questions and explanations.' },
  { title: 'Which language should Novo explain in?', body: 'Edora screens are in English and हिन्दी. Novo can explain concepts in the languages below.' },
];

async function haptic() { try { await Haptics.impact({ style: ImpactStyle.Light }); } catch { /* web */ } }

const chip = (active: boolean): React.CSSProperties => ({
  minHeight: 52, padding: '12px 16px', borderRadius: 14, textAlign: 'left', width: '100%',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  fontSize: 16, fontWeight: 600, cursor: 'pointer',
  color: 'var(--ink-950)',
  background: active ? 'rgba(79,70,229,0.14)' : 'var(--ink-60, rgba(127,127,127,0.08))',
  border: `2px solid ${active ? '#4F46E5' : 'var(--ink-140, rgba(127,127,127,0.25))'}`,
});

export default function OnboardingPage() {
  const { user, profile, refetchProfile } = useAuth();
  const navigate = useNavigate();
  const uid = user?.id ?? '';

  const [draft, setDraft] = useState<OnboardingDraft>(() => (uid ? loadDraft(uid) : loadDraft('anon')));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const loadedFor = useRef<string>('');

  // Draft is keyed by user; reload once when the user id becomes known.
  useEffect(() => {
    if (uid && loadedFor.current !== uid) { loadedFor.current = uid; setDraft(loadDraft(uid)); }
  }, [uid]);

  function update(patch: Partial<OnboardingDraft>) {
    setDraft(prev => {
      const next = { ...prev, ...patch };
      if (uid) saveDraft(uid, next);
      return next;
    });
  }

  const step = draft.step;
  const selectedExam = useMemo(() => EXAM_TARGETS.find(e => e.value === draft.examName), [draft.examName]);
  const today = new Date().toISOString().slice(0, 10);

  // Android/system Back: previous step first; only on step 0 does it leave onboarding (to the default handler).
  useBackHandler(step > 0, () => update({ step: step - 1 }), 60);

  async function finish(d: OnboardingDraft) {
    if (!user || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { data: existing, error: readErr } = await supabase
        .from('profiles').select('study_preferences').eq('id', user.id).maybeSingle();
      if (readErr) throw readErr;

      const { error } = await supabase
        .from('profiles')
        .update(buildProfileUpdate(d, (existing?.study_preferences ?? null) as Record<string, unknown> | null))
        .eq('id', user.id);
      if (error) throw error;

      clearDraft(user.id);
      track('onboarding_completed', { exam: d.examName || GENERAL_EXAM, level: d.studyLevel || 'school', language: d.language });
      incrementSession();
      await refetchProfile();
      navigate('/home', { replace: true });
    } catch (e) {
      // Keep every answer on screen and in the saved draft; the learner can retry.
      console.error('[onboarding] profile save failed:', (e as Error)?.message ?? e);
      setSaveError('We could not save your choices. Check your connection and try again — nothing you picked is lost.');
    } finally {
      setSaving(false);
    }
  }

  async function next() {
    await haptic();
    if (!canProceed(step, draft)) return;
    if (step < TOTAL_STEPS - 1) update({ step: step + 1 });
    else await finish(draft);
  }

  // "Skip for now": never traps a learner. Uses GENERAL (truthful fallback) for anything unanswered.
  async function skip() {
    await haptic();
    const d: OnboardingDraft = { ...draft, examName: draft.examName || GENERAL_EXAM };
    await finish(d);
  }

  // If an already-onboarded learner lands here (e.g. stale link), send them on instead of trapping them.
  useEffect(() => {
    const done = profile?.study_preferences && typeof (profile.study_preferences as Record<string, unknown>).onboarding_completed_at === 'string';
    if (done && !saving) navigate('/home', { replace: true });
  }, [profile, saving, navigate]);

  const copy = STEP_COPY[step];
  const isLast = step === TOTAL_STEPS - 1;

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg, #0B1020)', color: 'var(--ink-950)' }}>
      {/* Header: back + progress */}
      <div style={{ padding: 'calc(env(safe-area-inset-top) + 12px) 20px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => step > 0 && update({ step: step - 1 })}
          disabled={step === 0}
          aria-label="Back"
          style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: step === 0 ? 0 : 1, background: 'transparent', color: 'inherit' }}
        >
          <ChevronLeft size={22} />
        </button>
        <div style={{ flex: 1 }} aria-label={`Step ${step + 1} of ${TOTAL_STEPS}`} role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL_STEPS} aria-valuenow={step + 1}>
          <div style={{ display: 'flex', gap: 6 }}>
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: i <= step ? '#4F46E5' : 'rgba(127,127,127,0.3)' }} />
            ))}
          </div>
        </div>
        <span style={{ fontSize: 13, color: 'var(--ink-650)', minWidth: 44, textAlign: 'right' }}>{step + 1}/{TOTAL_STEPS}</span>
      </div>

      {/* Content (scrolls; keyboard-safe because the footer is in normal flow, not fixed) */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 16px' }}>
        <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: 24, fontWeight: 800, lineHeight: 1.25, margin: '8px 0 6px' }}>{copy.title}</h1>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--ink-650)', marginBottom: 20 }}>{copy.body}</p>

        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} role="radiogroup" aria-label="Exam target">
            {EXAM_TARGETS.map(e => {
              const active = draft.examName === e.value;
              return (
                <button key={e.value} role="radio" aria-checked={active} style={chip(active)}
                  onClick={() => update({ examName: e.value, examDate: e.hasDate ? draft.examDate : '' })}>
                  <span>{e.label}</span>
                  {active && <Check size={20} color="#4F46E5" />}
                </button>
              );
            })}
            {selectedExam?.hasDate && (
              <label style={{ display: 'block', marginTop: 8 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Exam date (optional)</span>
                <input
                  type="date" min={today} value={draft.examDate}
                  onChange={e => update({ examDate: e.target.value })}
                  style={{ width: '100%', minHeight: 52, borderRadius: 12, padding: '0 14px', fontSize: 16, border: '2px solid var(--ink-140, rgba(127,127,127,0.25))', background: 'transparent', color: 'inherit' }}
                />
              </label>
            )}
          </div>
        )}

        {step === 1 && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }} role="radiogroup" aria-label="Study level">
              {STUDY_LEVELS.map(l => {
                const active = draft.studyLevel === l.value;
                return (
                  <button key={l.value} role="radio" aria-checked={active} onClick={() => update({ studyLevel: l.value })}
                    style={{ ...chip(active), flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 2 }}>
                    <span>{l.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-650)' }}>{l.sub}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Subjects (pick all that apply)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }} role="group" aria-label="Subjects">
              {SUBJECTS.map(s => {
                const active = draft.subjects.includes(s);
                return (
                  <button key={s} aria-pressed={active}
                    onClick={() => update({ subjects: active ? draft.subjects.filter(x => x !== s) : [...draft.subjects, s] })}
                    style={{ ...chip(active), width: 'auto', minHeight: 48, padding: '10px 16px' }}>
                    {s}{active && <Check size={16} color="#4F46E5" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} role="radiogroup" aria-label="Language">
            {LANGUAGES.map(l => {
              const active = draft.language === l.value;
              return (
                <button key={l.value} role="radio" aria-checked={active} style={chip(active)} onClick={() => update({ language: l.value })}>
                  <span>{l.label} <span style={{ fontWeight: 500, color: 'var(--ink-650)' }}>· {l.native}</span></span>
                  {active && <Check size={20} color="#4F46E5" />}
                </button>
              );
            })}
          </div>
        )}

        {saveError && (
          <div role="alert" style={{ marginTop: 16, display: 'flex', gap: 10, padding: 14, borderRadius: 12, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)' }}>
            <AlertCircle size={20} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 14, lineHeight: 1.45 }}>{saveError}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 20px calc(env(safe-area-inset-bottom) + 16px)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={next}
          disabled={!canProceed(step, draft) || saving}
          style={{
            minHeight: 54, borderRadius: 14, fontSize: 17, fontWeight: 700, color: '#fff',
            background: canProceed(step, draft) && !saving ? '#4F46E5' : 'rgba(79,70,229,0.4)',
          }}
        >
          {saving ? 'Saving…' : saveError ? 'Try again' : isLast ? 'Start learning' : 'Continue'}
        </button>
        <button onClick={skip} disabled={saving} style={{ minHeight: 44, fontSize: 15, fontWeight: 600, color: 'var(--ink-650)', background: 'transparent' }}>
          Skip for now
        </button>
      </div>
    </div>
  );
}
