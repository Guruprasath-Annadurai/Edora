import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ArrowLeft, Check } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CharacterImage } from '@/components/ui/CharacterImage';

const BG     = '#EEF0FF';
const DARK   = '#1A1A2E';
const GRAY   = '#6B7280';
const BORDER = '#E2E4F0';
const PURPLE = 'linear-gradient(135deg,#5B6AF5,#8B5CF6)';

const SECTIONS = [
  {
    title: 'Acceptance of Terms',
    icon: '📜',
    content: `By downloading, installing, or using Edora ("the App"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the App. These Terms apply to all users including students, parents, and teachers. Users under 18 must have parental or guardian consent before using Edora.`,
  },
  {
    title: 'Use of the Service',
    icon: '📚',
    content: `Edora is an AI-powered study platform designed for students preparing for JEE, NEET, and CBSE examinations. You may use the App only for lawful, personal, non-commercial educational purposes. You agree not to reverse-engineer, copy, distribute, or resell any part of the App or its content. Automated access, scraping, or abuse of AI features is prohibited.`,
  },
  {
    title: 'Account Registration',
    icon: '👤',
    content: `You must provide accurate information when creating an account. You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account. Notify us immediately at support@edora.app if you suspect unauthorized access. We reserve the right to suspend accounts that violate these Terms or engage in fraudulent activity.`,
  },
  {
    title: 'Subscriptions & Payments',
    icon: '💳',
    content: `Edora offers a 30-day free Pro trial from the date of account creation, after which continued access to Pro features requires a paid subscription. Subscription fees are billed in advance on a monthly or annual basis via the Google Play Store or Apple App Store. All payments are processed by the respective app store and subject to their refund policies. We do not store your payment details. Cancellations take effect at the end of the current billing period.`,
  },
  {
    title: 'AI-Generated Content',
    icon: '🤖',
    content: `Edora uses AI to generate study content, quiz questions, flashcards, and tutoring responses. While we strive for accuracy, AI-generated content may occasionally contain errors. Do not rely solely on AI-generated content for high-stakes decisions. All AI responses are for educational assistance only and do not constitute professional academic advice. Your conversations with Novo AI are stored to improve personalization and are governed by our Privacy Policy.`,
  },
  {
    title: 'Intellectual Property',
    icon: '⚖️',
    content: `All content within Edora — including the Novo AI persona, UI design, branding, curriculum structure, and software — is the intellectual property of Edora and its creator, Guruprasath Annadurai. You are granted a limited, non-exclusive, non-transferable license to use the App for personal educational purposes. Any user-generated content (e.g., custom flashcards) remains yours; you grant Edora a license to store and display it within the App.`,
  },
  {
    title: 'Prohibited Conduct',
    icon: '🚫',
    content: `You agree not to: share, sell, or transfer your account to others; use the App to harass, harm, or impersonate any person; upload malicious code or attempt to breach the App's security; use automated tools to abuse the battle, leaderboard, or XP systems; or circumvent any feature restrictions tied to the Pro subscription. Violation may result in immediate account termination without refund.`,
  },
  {
    title: 'Limitation of Liability',
    icon: '🛡️',
    content: `Edora is provided "as is" without warranties of any kind. To the maximum extent permitted by law, Edora and its creator shall not be liable for any indirect, incidental, or consequential damages arising from your use of the App, including loss of data, exam results, or academic outcomes. Our total liability to you shall not exceed the amount you paid for the subscription in the 3 months preceding the claim.`,
  },
  {
    title: 'Termination',
    icon: '🔚',
    content: `You may delete your account at any time from Profile → Account Settings. Upon deletion, your personal data is removed within 30 days in accordance with our Privacy Policy. We reserve the right to suspend or terminate accounts that violate these Terms, with or without notice. Provisions relating to intellectual property, limitation of liability, and governing law survive termination.`,
  },
  {
    title: 'Governing Law',
    icon: '🏛️',
    content: `These Terms are governed by the laws of India. Any disputes arising out of or relating to these Terms shall be subject to the exclusive jurisdiction of the courts of Chennai, Tamil Nadu, India. If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force and effect.`,
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
        <span className="text-xl shrink-0">{section.icon}</span>
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

export default function TermsOfServicePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromOnboarding = (location.state as { from?: string } | null)?.from === 'onboarding';

  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [accepted, setAccepted]   = useState(false);

  function handleContinue() {
    if (fromOnboarding) {
      sessionStorage.setItem('edora_terms_accepted', 'true');
      navigate(-1);
    } else {
      navigate(-1);
    }
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: BG }}>
      <div style={{ paddingTop: 'env(safe-area-inset-top)' }} />

      {/* ── Header ── */}
      <div className="flex items-center px-5 py-3 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform"
          style={{ background: '#FFF', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}
        >
          <ArrowLeft size={18} color={DARK} />
        </button>
        <h1 className="flex-1 text-center font-heading text-base font-bold" style={{ color: DARK }}>
          Terms of Service
        </h1>
        <div className="w-9" />
      </div>

      {/* ── Illustration ── */}
      <div className="flex items-center justify-center shrink-0 py-2">
        <CharacterImage slug="terms-character" anim="sway" height={160} fallbackEmoji="📋" />
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto native-scroll px-5 pb-2">
        <div className="mb-4 text-center">
          <h2 className="font-heading text-xl font-bold mb-1" style={{ color: DARK }}>Terms of Service</h2>
          <p className="text-xs" style={{ color: GRAY }}>Last updated: June 2025 · Effective immediately</p>
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

        <p className="text-center text-xs mt-4 mb-2" style={{ color: GRAY }}>
          Questions? Contact us at{' '}
          <span className="font-semibold" style={{ color: '#5B6AF5' }}>support@edora.app</span>
        </p>
      </div>

      {/* ── Accept footer ── */}
      <div
        className="shrink-0 px-5 pt-3 pb-safe"
        style={{ background: '#FFF', borderTop: `1px solid ${BORDER}`, boxShadow: '0 -2px 12px rgba(0,0,0,0.05)' }}
      >
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
            <span className="font-semibold" style={{ color: DARK }}>Terms of Service</span>
          </span>
        </button>

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
