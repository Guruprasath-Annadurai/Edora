import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ArrowLeft, Check, ShieldCheck, FileText, Target, Lock, Scale } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const BG     = '#EEF0FF';
const DARK   = '#1A1A2E';
const GRAY   = '#6B7280';
const BORDER = '#E2E4F0';
const PURPLE = 'linear-gradient(135deg,#5B6AF5,#8B5CF6)';

const SECTIONS = [
  {
    title: 'Information We Collect',
    icon: FileText,
    content: `Account info (name, email, study level) and content you create (notes, chat history, quiz results, scanned documents). Camera/microphone data only when you use Scanner or Voice Study/Quiz. A push notification token for reminders you enable. Device type, OS, and app version for performance. If you connect Google Classroom, Gmail, Calendar, or Drive, or sign in with Google/Microsoft, we receive the account email and the specific data those integrations need (e.g. course rosters for Classroom, send-only access for Gmail) — never your password.`,
  },
  {
    title: 'How We Use Information',
    icon: Target,
    content: `To personalize your learning experience, power Novo AI's tutoring and memory, track progress and streaks, send reminders you've opted into, and generate AI content via Google Gemini, Groq, and — for a small set of narrative summaries — NVIDIA NIM. We do not sell your personal data. AI-generated content (quizzes, explanations, grading) is for educational support and may vary in accuracy.`,
  },
  {
    title: 'Data Protection',
    icon: Lock,
    content: `All data is encrypted in transit (TLS) and at rest, stored on Supabase with Row Level Security so only you can access your own data. OAuth tokens (Google Classroom/Gmail/Calendar/Drive) are additionally encrypted before storage. Authentication supports email/password, Google, and Microsoft sign-in. We retain your data while your account is active.`,
  },
  {
    title: 'Your Rights',
    icon: Scale,
    content: `Access, export, or delete your data anytime from Profile → Account Settings → Data Rights. If you're in India and under 18, the DPDP Act treats you as a Child and we require verifiable parental consent before processing your data — reviewable or withdrawable from the same Data Rights screen. For anything else, or DPDP grievances, contact support@edora.app (general) or dpo@edora.app (India DPO).`,
  },
];

function AccordionSection({
  section, isOpen, onToggle,
}: {
  section: typeof SECTIONS[0];
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{
        border: isOpen ? '1.5px solid rgba(91,106,245,0.3)' : `1.5px solid ${BORDER}`,
        background: '#FFF',
        boxShadow: isOpen ? '0 4px 16px rgba(91,106,245,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
      }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-4 text-left"
      >
        <section.icon size={20} className="shrink-0" style={{ color: '#5B6AF5' }} strokeWidth={1.7} />
        <span className="flex-1 font-semibold text-sm" style={{ color: DARK }}>{section.title}</span>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={18} color={isOpen ? '#5B6AF5' : GRAY} />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-4 pb-4">
              <div className="h-px mb-3" style={{ background: BORDER }} />
              <p className="text-sm leading-relaxed" style={{ color: GRAY }}>
                {section.content}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PrivacyPolicyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromOnboarding = (location.state as { from?: string } | null)?.from === 'onboarding';

  const [openIndex, setOpenIndex]   = useState<number | null>(0);
  const [accepted, setAccepted]     = useState(false);

  function handleContinue() {
    if (fromOnboarding) {
      sessionStorage.setItem('edora_privacy_accepted', 'true');
      navigate(-1);
    } else {
      navigate(-1);
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: BG }}>
      <div style={{ paddingTop: 'env(safe-area-inset-top)' }} />

      {/* ── Header ── */}
      <div className="flex items-center px-5 py-3 shrink-0">
        <button aria-label="Go back"
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform"
          style={{ background: '#FFF', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}
        >
          <ArrowLeft size={18} color={DARK} />
        </button>
        <h1 className="flex-1 text-center font-heading text-base font-bold" style={{ color: DARK }}>
          Privacy Policy
        </h1>
        <div className="w-9" />
      </div>

      {/* ── Mark ── */}
      <div className="flex items-center justify-center shrink-0 py-5">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(129,140,248,0.12)', border: '1px solid rgba(129,140,248,0.25)' }}>
          <ShieldCheck size={28} style={{ color: '#818CF8' }} strokeWidth={1.6} />
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto native-scroll px-5 pb-2">
        <div className="mb-4 text-center">
          <h2 className="font-heading text-xl font-bold mb-1" style={{ color: DARK }}>Your Privacy Matters</h2>
          <p className="text-xs" style={{ color: GRAY }}>Last updated: August 2, 2026 · Effective immediately</p>
        </div>

        <div className="flex flex-col gap-3">
          {SECTIONS.map((section, i) => (
            <AccordionSection
              key={section.title}
              section={section}
              isOpen={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? null : i)}
            />
          ))}
        </div>

        {/* Contact */}
        <p className="text-center text-xs mt-4 mb-2" style={{ color: GRAY }}>
          Questions? Contact us at{' '}
          <span className="font-semibold" style={{ color: '#5B6AF5' }}>support@edora.app</span>
          {' '}(India DPDP grievances:{' '}
          <span className="font-semibold" style={{ color: '#5B6AF5' }}>dpo@edora.app</span>)
        </p>
      </div>

      {/* ── Accept footer ── */}
      <div
        className="shrink-0 px-5 pt-3 pb-safe"
        style={{ background: '#FFF', borderTop: `1px solid ${BORDER}`, boxShadow: '0 -2px 12px rgba(0,0,0,0.05)' }}
      >
        {/* Checkbox */}
        <button
          onClick={() => setAccepted(v => !v)}
          className="flex items-start gap-3 mb-4 w-full text-left active:opacity-70 transition-opacity"
        >
          <div
            className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all"
            style={accepted
              ? { background: PURPLE as unknown as string, borderColor: '#5B6AF5' }
              : { borderColor: BORDER, background: '#FFF' }}
          >
            {accepted && <Check size={11} color="white" strokeWidth={3} />}
          </div>
          <span className="text-sm leading-snug" style={{ color: GRAY }}>
            I have read and agree to the{' '}
            <span className="font-semibold" style={{ color: DARK }}>Privacy Policy</span>
          </span>
        </button>

        {/* Continue button */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleContinue}
          disabled={!accepted}
          className="w-full py-4 rounded-2xl font-bold text-base text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-40"
          style={{ background: PURPLE, boxShadow: accepted ? '0 6px 24px rgba(91,106,245,0.35)' : 'none' }}
        >
          Continue
        </motion.button>

        <div style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} className="pb-3" />
      </div>
    </div>
  );
}

