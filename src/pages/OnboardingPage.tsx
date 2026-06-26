import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, GraduationCap, BookOpen, Target, Check, Zap,
  ArrowRight, ChevronRight, Brain, Calendar, Smile, Globe, Gift,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { NovoAvatar } from '@/components/novo/NovoAvatar';
import type { NovoState } from '@/components/novo/NovoAvatar';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { incrementSession, maybePromptRating } from '@/lib/appRating';

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

const LANGUAGES = [
  { value: 'en', label: 'English',    native: 'English',    flag: '🇬🇧' },
  { value: 'hi', label: 'Hindi',      native: 'हिन्दी',       flag: '🇮🇳' },
  { value: 'ta', label: 'Tamil',      native: 'தமிழ்',        flag: '🇮🇳' },
  { value: 'te', label: 'Telugu',     native: 'తెలుగు',       flag: '🇮🇳' },
  { value: 'kn', label: 'Kannada',    native: 'ಕನ್ನಡ',        flag: '🇮🇳' },
  { value: 'mr', label: 'Marathi',    native: 'मराठी',        flag: '🇮🇳' },
  { value: 'bn', label: 'Bengali',    native: 'বাংলা',        flag: '🇮🇳' },
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
    state: 'talking' as NovoState,
    heading: 'What language do you prefer?',
    body: 'I can explain concepts, give hints, and chat with you in your mother tongue — making learning 2× easier.',
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
  {
    state: 'talking' as NovoState,
    heading: 'Got a referral code?',
    body: 'If a friend invited you, enter their code to get 50 bonus XP! You can also skip this step.',
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

  const [step, setStep]               = useState(0);
  const [studyLevel, setStudyLevel]   = useState('');
  const [language, setLanguage]       = useState('en');
  const [subjects, setSubjects]       = useState<string[]>([]);
  const [examName, setExamName]       = useState('');
  const [examDate, setExamDate]       = useState('');
  const [mood, setMood]               = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [referralStatus, setReferralStatus] = useState<'idle'|'ok'|'err'>('idle');
  const [saving, setSaving]           = useState(false);

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

    // Record DPDP consent for OAuth/OTP users — password-signup records it at sign-up time,
    // but Google/Apple/OTP users reach onboarding without a prior consent checkpoint.
    const { data: existing } = await supabase
      .from('profiles').select('dpdp_consent_at').eq('id', user.id).single();
    const consentFields = existing?.dpdp_consent_at ? {} : {
      dpdp_consent_at:      new Date().toISOString(),
      dpdp_consent_version: 'v2026.06',
    };

    await supabase.from('profiles').update({
      study_level:         studyLevel || null,
      subjects:            subjects.length ? subjects : null,
      exam_name:           examName || null,
      exam_date:           examDate || null,
      preferred_language:  language || 'en',
      onboarding_completed: true,
      ...consentFields,
    }).eq('id', user.id);

    // Process referral code if provided
    if (referralCode.trim()) {
      await supabase.rpc('process_referral', {
        p_referee_id:    user.id,
        p_referral_code: referralCode.trim().toUpperCase(),
      });
    }

    if (mood) {
      await supabase.from('user_moods').insert({
        user_id: user.id, mood, logged_at: new Date().toISOString(),
      });
    }

    incrementSession();
    maybePromptRating('onboarding_done').catch(() => {});
    navigate('/home', { replace: true });
  }

  function canProceed() {
    if (step === 0) return true;
    if (step === 1) return !!studyLevel;
    if (step === 2) return !!language;      // language picker
    if (step === 3) return subjects.length > 0;
    if (step === 4) return true;            // exam optional
    if (step === 5) return !!mood;
    if (step === 6) return true;            // referral optional
    return true;
  }

  const intro = NOVO_INTRO[step];

  return (
    <div className="bg-deep-space" style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', position: 'relative',
    }}>
      {/* 5-layer ambient orb system matching AppShell */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
        <div style={{ position: 'absolute', width: 440, height: 440, top: -130, left: -100, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.22), transparent 68%)', filter: 'blur(50px)' }} />
        <div style={{ position: 'absolute', width: 360, height: 360, bottom: 80, right: -80, borderRadius: '50%', background: 'radial-gradient(circle, rgba(91,106,245,0.18), transparent 68%)', filter: 'blur(46px)' }} />
        <div style={{ position: 'absolute', width: 250, height: 250, top: '38%', left: '36%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(6,182,212,0.11), transparent 70%)', filter: 'blur(38px)' }} />
        <div style={{ position: 'absolute', width: 210, height: 210, top: -50, right: -50, borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.09), transparent 70%)', filter: 'blur(42px)' }} />
        <div style={{ position: 'absolute', width: 320, height: 180, bottom: 0, left: '15%', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(91,106,245,0.10), transparent 70%)', filter: 'blur(34px)' }} />
      </div>

      {/* Progress indicator — segment dots */}
      <div style={{ position: 'relative', zIndex: 1, paddingTop: 'max(20px, env(safe-area-inset-top))', paddingLeft: 24, paddingRight: 24, paddingBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <motion.div
              key={i}
              animate={{
                width: i === step ? 24 : 8,
                background: i <= step
                  ? 'linear-gradient(90deg,#7C3AED,#A855F7)'
                  : 'rgba(255,255,255,0.15)',
                opacity: i < step ? 0.55 : 1,
              }}
              transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
              style={{
                height: 8,
                borderRadius: 4,
                flexShrink: 0,
                boxShadow: i === step ? '0 0 10px rgba(168,85,247,0.55)' : 'none',
              }}
            />
          ))}
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
                        background: active ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.07)',
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {LANGUAGES.map(lang => {
                  const active = language === lang.value;
                  return (
                    <motion.button
                      key={lang.value}
                      onClick={() => { haptic(); setLanguage(lang.value); }}
                      style={{
                        padding: '14px 16px', borderRadius: 16, textAlign: 'left',
                        background: active ? 'rgba(124,58,237,0.18)' : 'rgba(255,255,255,0.06)',
                        border: active ? '1.5px solid rgba(124,58,237,0.5)' : '1.5px solid rgba(255,255,255,0.08)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14,
                      }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <span style={{ fontSize: 24 }}>{lang.flag}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: active ? '#F4F6FA' : 'rgba(255,255,255,0.7)' }}>{lang.label}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{lang.native}</div>
                      </div>
                      {active && <Check size={16} style={{ color: '#A855F7', flexShrink: 0 }} />}
                    </motion.button>
                  );
                })}
              </div>
            </StepLayout>
          )}

          {step === 3 && (
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

          {step === 4 && (
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
                      max={new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
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

          {step === 5 && (
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
                        background: active ? `rgba(${hexToRgb(m.color)}, 0.15)` : 'rgba(255,255,255,0.07)',
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
          {step === 6 && (
            <StepLayout heading={intro.heading} body={intro.body} novoState={intro.state}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: 'rgba(255,255,255,0.06)', borderRadius: 16,
                  border: '1px solid rgba(255,255,255,0.1)', padding: '12px 16px',
                }}>
                  <Gift size={18} style={{ color: '#A0AEFF', flexShrink: 0 }} />
                  <input
                    value={referralCode}
                    onChange={e => { setReferralCode(e.target.value.toUpperCase()); setReferralStatus('idle'); }}
                    placeholder="Enter 8-character code (e.g. ABCD1234)"
                    maxLength={8}
                    style={{
                      flex: 1, background: 'none', outline: 'none',
                      fontSize: 16, fontWeight: 700, letterSpacing: '0.12em',
                      color: '#F4F6FA',
                    }}
                  />
                  {referralStatus === 'ok' && <Check size={16} style={{ color: '#34D399' }} />}
                </div>

                {referralStatus === 'ok' && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14,
                      background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)' }}>
                    <Check size={16} style={{ color: '#34D399' }} />
                    <p style={{ fontSize: 13, color: '#34D399', fontWeight: 600 }}>
                      Code applied! You'll get 50 bonus XP after setup.
                    </p>
                  </motion.div>
                )}

                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px', borderRadius: 100,
                    background: 'rgba(160,174,255,0.08)', border: '1px solid rgba(160,174,255,0.15)',
                  }}>
                    <Gift size={13} style={{ color: '#A0AEFF' }} />
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Both you and your friend earn bonus XP</span>
                  </div>
                </div>
              </div>
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

          {(step === 4 || step === 6) && (
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
