import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, GraduationCap, BookOpen, Target, Check, Zap,
  ArrowRight, ChevronRight, Brain, Calendar, Smile,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { NovoAvatar } from '@/components/novo/NovoAvatar';
import type { NovoState } from '@/components/novo/NovoAvatar';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

// ── Constants ─────────────────────────────────────────────────────────────────
const STUDY_LEVELS = [
  { value: 'school',   label: 'School',     sub: 'Class 6–12', icon: BookOpen      },
  { value: 'college',  label: 'College',    sub: 'UG / PG',    icon: GraduationCap },
  { value: 'jee_neet', label: 'JEE / NEET', sub: 'Entrance',   icon: Target        },
  { value: 'sat_act',  label: 'SAT / ACT',  sub: 'Global',     icon: Sparkles      },
];

const SUBJECTS = [
  { value: 'Mathematics', color: '#93C5FD' },
  { value: 'Physics',     color: '#C4B5FD' },
  { value: 'Chemistry',   color: '#6EE7B7' },
  { value: 'Biology',     color: '#86EFAC' },
  { value: 'English',     color: '#FCA5A5' },
  { value: 'History',     color: '#FDE68A' },
  { value: 'Economics',   color: '#A5F3FC' },
  { value: 'Computer Science', color: '#DDD6FE' },
];

const EXAMS = [
  { value: 'JEE Main',     label: 'JEE Main'     },
  { value: 'JEE Advanced', label: 'JEE Advanced' },
  { value: 'NEET',         label: 'NEET UG'       },
  { value: 'SAT',          label: 'SAT'           },
  { value: 'CBSE',         label: 'CBSE Board'    },
  { value: 'Other',        label: 'Other'         },
];

const MOODS = [
  { emoji: '🔥', label: 'Excited',    value: 'focused',    color: '#F97316' },
  { emoji: '😤', label: 'Determined', value: 'determined', color: '#7C3AED' },
  { emoji: '😊', label: 'Curious',    value: 'good',       color: '#10B981' },
  { emoji: '😐', label: 'Uncertain',  value: 'okay',       color: '#F59E0B' },
  { emoji: '😰', label: 'Anxious',    value: 'anxious',    color: '#EF4444' },
  { emoji: '😴', label: 'Tired',      value: 'low',        color: '#6B7280' },
];

// ── Novo intro messages for each step ────────────────────────────────────────
const NOVO_INTRO = [
  {
    state: 'talking' as NovoState,
    heading: 'Hey, I\'m Novo.',
    body: 'Your personal AI study companion for JEE and NEET. I remember everything about how you learn — your patterns, your weak topics, your wins.',
    cta: 'Let\'s meet properly',
  },
  {
    state: 'idle' as NovoState,
    heading: 'What are you preparing for?',
    body: 'I\'ll tailor every explanation, quiz, and revision plan specifically for your exam level.',
    cta: null,
  },
  {
    state: 'thinking' as NovoState,
    heading: 'Which subjects do you study?',
    body: 'Pick all that apply. I\'ll track your progress and adapt your sessions for each one.',
    cta: null,
  },
  {
    state: 'concerned' as NovoState,
    heading: 'Got a target exam?',
    body: 'If you\'re aiming for a specific exam and date, I\'ll build a countdown and adjust the intensity as we get closer.',
    cta: null,
  },
  {
    state: 'idle' as NovoState,
    heading: 'Before we start...',
    body: 'How are you feeling about studying right now? No judgment — this helps me calibrate how we begin.',
    cta: null,
  },
];

async function haptic() {
  try { await Haptics.impact({ style: ImpactStyle.Light }); } catch { /* web */ }
}

// ── Step components ───────────────────────────────────────────────────────────
function StepLayout({ heading, body, novoState, children }: {
  heading: string;
  body: string;
  novoState: NovoState;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      key={heading}
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '0 24px' }}
    >
      {/* Novo avatar */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
        <NovoAvatar state={novoState} size="xl" showLabel />
      </div>

      {/* Speech bubble */}
      <div style={{
        padding: '16px 18px', borderRadius: 20, marginBottom: 28,
        background: 'rgba(124,58,237,0.1)',
        border: '1px solid rgba(124,58,237,0.25)',
        position: 'relative',
      }}>
        {/* Bubble tail */}
        <div style={{
          position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
          width: 0, height: 0,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderBottom: '8px solid rgba(124,58,237,0.25)',
        }} />
        <h2 style={{ fontFamily: 'Sora, sans-serif', fontSize: 20, fontWeight: 800, color: '#F4F6FA', marginBottom: 6, lineHeight: 1.2 }}>
          {heading}
        </h2>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>
          {body}
        </p>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {children}
      </div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const { user } = useAuth();
  const navigate  = useNavigate();

  const [step, setStep]             = useState(0);
  const [studyLevel, setStudyLevel] = useState('');
  const [subjects, setSubjects]     = useState<string[]>([]);
  const [examName, setExamName]     = useState('');
  const [examDate, setExamDate]     = useState('');
  const [mood, setMood]             = useState('');
  const [saving, setSaving]         = useState(false);

  const totalSteps = NOVO_INTRO.length;
  const progress   = ((step + 1) / totalSteps) * 100;

  async function nextStep() {
    await haptic();
    if (step < totalSteps - 1) {
      setStep(s => s + 1);
    } else {
      await finish();
    }
  }

  async function finish() {
    if (!user || saving) return;
    setSaving(true);

    // Save mood for today
    const moodKey = `edora_mood_${user.id}_${new Date().toISOString().slice(0, 10)}`;
    if (mood) localStorage.setItem(moodKey, mood);

    await supabase.from('profiles').update({
      study_level:  studyLevel || null,
      subjects:     subjects.length ? subjects : null,
      exam_name:    examName || null,
      exam_date:    examDate || null,
      onboarding_completed: true,
    }).eq('id', user.id);

    if (mood) {
      await supabase.from('user_moods').insert({
        user_id: user.id, mood, logged_at: new Date().toISOString(),
      });
    }

    navigate('/home', { replace: true });
  }

  function canProceed() {
    if (step === 0) return true;
    if (step === 1) return !!studyLevel;
    if (step === 2) return subjects.length > 0;
    if (step === 3) return true;
    if (step === 4) return !!mood;
    return true;
  }

  const intro = NOVO_INTRO[step];

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      background: 'linear-gradient(180deg, #0A0A0F 0%, #0D0818 100%)',
      overflow: 'hidden',
    }}>
      {/* Ambient orbs */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
        <div style={{ position: 'absolute', width: 300, height: 300, top: -80, left: '50%', transform: 'translateX(-50%)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.18), transparent 70%)', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', width: 200, height: 200, bottom: 100, right: -50, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.12), transparent 70%)', filter: 'blur(32px)' }} />
      </div>

      {/* Progress bar */}
      <div style={{ position: 'relative', zIndex: 1, paddingTop: 'max(20px, env(safe-area-inset-top))', paddingLeft: 24, paddingRight: 24, paddingBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <motion.div
              style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg, #7C3AED, #A855F7)' }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
            />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em' }}>
            {step + 1}/{totalSteps}
          </span>
        </div>
      </div>

      {/* Steps */}
      <div style={{ flex: 1, position: 'relative', zIndex: 1, overflow: 'hidden', paddingTop: 20 }}>
        <AnimatePresence mode="wait">
          {step === 0 && (
            <StepLayout heading={intro.heading} body={intro.body} novoState={intro.state}>
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 20 }}>
                <motion.button
                  onClick={nextStep}
                  style={{
                    padding: '16px 40px', borderRadius: 18,
                    background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
                    color: 'white', fontSize: 15, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 8,
                    boxShadow: '0 8px 32px rgba(124,58,237,0.5)',
                    border: 'none', cursor: 'pointer', minHeight: 52,
                  }}
                  whileTap={{ scale: 0.95 }}
                >
                  {intro.cta} <ArrowRight size={18} />
                </motion.button>
              </div>
            </StepLayout>
          )}

          {step === 1 && (
            <StepLayout heading={intro.heading} body={intro.body} novoState={intro.state}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {STUDY_LEVELS.map(({ value, label, sub, icon: Icon }) => {
                  const active = studyLevel === value;
                  return (
                    <motion.button
                      key={value}
                      onClick={() => { haptic(); setStudyLevel(value); }}
                      style={{
                        padding: '16px 12px', borderRadius: 18, textAlign: 'left',
                        background: active ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.04)',
                        border: active ? '1.5px solid rgba(124,58,237,0.5)' : '1.5px solid rgba(255,255,255,0.07)',
                        boxShadow: active ? '0 0 16px rgba(124,58,237,0.2)' : 'none',
                        cursor: 'pointer', minHeight: 44,
                      }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Icon size={20} style={{ color: active ? '#A855F7' : 'rgba(255,255,255,0.5)', marginBottom: 8 }} />
                      <div style={{ fontSize: 14, fontWeight: 700, color: active ? '#F4F6FA' : 'rgba(255,255,255,0.7)', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{sub}</div>
                      {active && <div style={{ position: 'absolute', top: 12, right: 12 }}><Check size={14} style={{ color: '#A855F7' }} /></div>}
                    </motion.button>
                  );
                })}
              </div>
            </StepLayout>
          )}

          {step === 2 && (
            <StepLayout heading={intro.heading} body={intro.body} novoState={intro.state}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {SUBJECTS.map(({ value, color }) => {
                  const active = subjects.includes(value);
                  return (
                    <motion.button
                      key={value}
                      onClick={() => {
                        haptic();
                        setSubjects(prev => active ? prev.filter(s => s !== value) : [...prev, value]);
                      }}
                      style={{
                        padding: '8px 16px', borderRadius: 100,
                        background: active ? `rgba(${hexToRgb(color)}, 0.18)` : 'rgba(255,255,255,0.05)',
                        border: active ? `1.5px solid ${color}60` : '1.5px solid rgba(255,255,255,0.08)',
                        color: active ? color : 'rgba(255,255,255,0.6)',
                        fontSize: 13, fontWeight: 700,
                        cursor: 'pointer', minHeight: 36, display: 'flex', alignItems: 'center', gap: 4,
                      }}
                      whileTap={{ scale: 0.92 }}
                    >
                      {active && <Check size={12} />}
                      {value}
                    </motion.button>
                  );
                })}
              </div>
            </StepLayout>
          )}

          {step === 3 && (
            <StepLayout heading={intro.heading} body={intro.body} novoState={intro.state}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Exam selector */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                  {EXAMS.map(e => {
                    const active = examName === e.value;
                    return (
                      <motion.button
                        key={e.value}
                        onClick={() => { haptic(); setExamName(active ? '' : e.value); }}
                        style={{
                          padding: '8px 14px', borderRadius: 100,
                          background: active ? 'rgba(124,58,237,0.18)' : 'rgba(255,255,255,0.05)',
                          border: active ? '1.5px solid rgba(124,58,237,0.5)' : '1.5px solid rgba(255,255,255,0.08)',
                          color: active ? '#A855F7' : 'rgba(255,255,255,0.6)',
                          fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 36,
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                        whileTap={{ scale: 0.92 }}
                      >
                        {active && <Check size={12} />}
                        {e.label}
                      </motion.button>
                    );
                  })}
                </div>

                {/* Date picker */}
                {examName && examName !== 'Other' && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <Calendar size={13} /> Exam date (optional)
                    </label>
                    <input
                      type="date"
                      value={examDate}
                      onChange={e => setExamDate(e.target.value)}
                      min={new Date().toISOString().slice(0, 10)}
                      style={{
                        width: '100%', padding: '12px 14px', borderRadius: 14,
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#F4F6FA', fontSize: 14, fontWeight: 600,
                        outline: 'none', cursor: 'pointer',
                        WebkitUserSelect: 'text',
                      }}
                    />
                  </motion.div>
                )}

                {/* Skip hint */}
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 4 }}>
                  Skip if not sure — you can set this later in Profile
                </p>
              </div>
            </StepLayout>
          )}

          {step === 4 && (
            <StepLayout heading={intro.heading} body={intro.body} novoState={intro.state}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {MOODS.map(m => {
                  const active = mood === m.value;
                  return (
                    <motion.button
                      key={m.value}
                      onClick={() => { haptic(); setMood(m.value); }}
                      style={{
                        padding: '14px 8px', borderRadius: 18,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                        background: active ? `rgba(${hexToRgb(m.color)}, 0.15)` : 'rgba(255,255,255,0.04)',
                        border: active ? `1.5px solid ${m.color}60` : '1.5px solid rgba(255,255,255,0.06)',
                        cursor: 'pointer', minHeight: 44,
                      }}
                      whileTap={{ scale: 0.93 }}
                      animate={active ? { scale: [1, 1.05, 1] } : { scale: 1 }}
                    >
                      <span style={{ fontSize: 28 }}>{m.emoji}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: active ? m.color : 'rgba(255,255,255,0.55)' }}>
                        {m.label}
                      </span>
                    </motion.button>
                  );
                })}
              </div>

              {mood && (
                <motion.p
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', textAlign: 'center', marginTop: 16, lineHeight: 1.5 }}
                >
                  Got it. {mood === 'anxious' ? "I'll go gentle today." : mood === 'low' ? "Short sessions today — quality over quantity." : mood === 'focused' ? "Let's make the most of this energy." : "Let's get started."}
                </motion.p>
              )}
            </StepLayout>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom CTA */}
      {step > 0 && (
        <div style={{
          position: 'relative', zIndex: 1,
          padding: '16px 24px',
          paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <motion.button
            onClick={nextStep}
            disabled={!canProceed() || saving}
            style={{
              width: '100%', padding: '16px', borderRadius: 18,
              background: canProceed()
                ? 'linear-gradient(135deg, #7C3AED, #A855F7)'
                : 'rgba(255,255,255,0.06)',
              color: canProceed() ? 'white' : 'rgba(255,255,255,0.3)',
              fontSize: 15, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              border: 'none', cursor: canProceed() ? 'pointer' : 'not-allowed',
              minHeight: 52,
              boxShadow: canProceed() ? '0 8px 28px rgba(124,58,237,0.45)' : 'none',
              transition: 'all 0.2s',
            }}
            whileTap={canProceed() ? { scale: 0.97 } : {}}
          >
            {saving ? 'Setting up...' : step === totalSteps - 1 ? "Let's go" : 'Continue'}
            {!saving && <ChevronRight size={18} />}
          </motion.button>

          {(step === 3 || step === 2) && (
            <button
              onClick={nextStep}
              style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', minHeight: 32 }}
            >
              Skip for now
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
