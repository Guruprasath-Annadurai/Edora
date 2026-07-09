import { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@/lib/motion';
import { Crown, X, Zap, Mic, BarChart3, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { NovoAvatar } from '@/components/novo/NovoAvatar';
import { isInFreeTrial } from '@/lib/trial';

interface ProGateProps {
  /** Feature name shown in the paywall header */
  featureName: string;
  /** Short description of what Pro unlocks for this feature */
  featureDesc?: string;
  /** Shown when user IS pro */
  children: ReactNode;
  /** Bottom-sheet mode — renders inline paywall instead of full-screen */
  sheet?: boolean;
  /** Controlled open state (sheet mode) */
  open?: boolean;
  /** Called when sheet is dismissed */
  onClose?: () => void;
}

const TEASER_FEATURES = [
  { icon: Mic,      label: 'Full Voice Mode' },
  { icon: BarChart3,label: 'AI Score Prediction' },
  { icon: Zap,      label: 'Gemini Pro Responses' },
  { icon: Sparkles, label: 'Novo Memory' },
];

// ── Inline paywall (full-screen replacement) ─────────────────────────────────
function InlinePaywall({ featureName, featureDesc }: { featureName: string; featureDesc?: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center"
      style={{ background: 'var(--color-base)' }}>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        transition={spring.lazy}
        className="flex flex-col items-center gap-5 max-w-xs">
        <NovoAvatar state="concerned" size="lg" />
        <div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <Crown size={16} style={{ color: '#A855F7' }} />
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#A855F7' }}>
              Pro Feature
            </span>
          </div>
          <h3 className="font-heading text-xl font-bold text-white mb-1">{featureName}</h3>
          <p className="text-sm" style={{ color: 'var(--ink-500)' }}>
            {featureDesc ?? 'Upgrade to Edora Pro to unlock this feature.'}
          </p>
        </div>

        <div className="w-full rounded-2xl p-4 flex flex-col gap-2.5"
          style={{ background: 'var(--hdr-a-920)', border: '1px solid rgba(124,58,237,0.18)' }}>
          {TEASER_FEATURES.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'rgba(124,58,237,0.15)' }}>
                <Icon size={13} style={{ color: '#A855F7' }} />
              </div>
              <span className="text-sm text-white font-medium">{label}</span>
            </div>
          ))}
        </div>

        <motion.button whileTap={{ scale: 0.96 }}
          onClick={() => navigate('/pro')}
          className="w-full h-12 rounded-2xl font-heading font-bold text-white flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #7C3AED, #A855F7)', boxShadow: '0 0 24px rgba(124,58,237,0.4)' }}>
          <Crown size={16} /> Upgrade to Pro
        </motion.button>

        <p className="text-xs" style={{ color: 'var(--ink-300)' }}>
          From ₹58/month · Cancel anytime
        </p>
      </motion.div>
    </div>
  );
}

// ── Bottom-sheet paywall ─────────────────────────────────────────────────────
function SheetPaywall({
  featureName, featureDesc, open, onClose,
}: {
  featureName: string; featureDesc?: string; open: boolean; onClose?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={onClose} />
          <motion.div className="relative w-full rounded-t-3xl px-5 pt-5 pb-8 flex flex-col gap-5"
            style={{ background: 'var(--hdr-a-920)', borderTop: '1px solid rgba(124,58,237,0.25)' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={spring.sheet}>
            {/* Handle */}
            <div className="w-10 h-1 rounded-full mx-auto" style={{ background: 'var(--ink-100)' }} />

            {/* Dismiss */}
            {onClose && (
              <button onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'var(--ink-060)' }}>
                <X size={15} className="text-white" />
              </button>
            )}

            {/* Content */}
            <div className="flex items-start gap-4">
              <NovoAvatar state="concerned" size="sm" />
              <div className="flex-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <Crown size={12} style={{ color: '#A855F7' }} />
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#A855F7' }}>
                    Pro Feature
                  </span>
                </div>
                <h3 className="font-heading text-lg font-bold text-white leading-tight">{featureName}</h3>
                <p className="text-xs mt-1" style={{ color: 'var(--ink-500)' }}>
                  {featureDesc ?? 'Upgrade to unlock this and more.'}
                </p>
              </div>
            </div>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-2">
              {TEASER_FEATURES.map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                  style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)' }}>
                  <Icon size={11} style={{ color: '#A855F7' }} />
                  <span className="text-xs font-medium" style={{ color: '#A855F7' }}>{label}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <motion.button whileTap={{ scale: 0.97 }}
              onClick={() => { onClose?.(); navigate('/pro'); }}
              className="w-full h-12 rounded-2xl font-heading font-bold text-white flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #A855F7)', boxShadow: '0 0 20px rgba(124,58,237,0.35)' }}>
              <Crown size={15} /> Upgrade to Pro
            </motion.button>

            <p className="text-center text-xs" style={{ color: 'var(--ink-300)' }}>
              From ₹58/month · Cancel anytime
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────
/**
 * Wrap any Pro-only UI with ProGate.
 *
 * Inline (default):
 *   <ProGate featureName="Voice Mode" featureDesc="...">
 *     <VoiceModeUI />
 *   </ProGate>
 *
 * Sheet (controlled):
 *   <ProGate featureName="Voice Mode" sheet open={locked} onClose={() => setLocked(false)}>
 *     <VoiceModeUI />
 *   </ProGate>
 */
export function ProGate({ featureName, featureDesc, children, sheet, open, onClose }: ProGateProps) {
  const { profile, user } = useAuth();
  const trialActive = user?.created_at ? isInFreeTrial(user.created_at) : false;
  const isPro = trialActive || (!!profile?.is_pro && (
    !profile.pro_expires_at || new Date(profile.pro_expires_at) > new Date()
  ));

  // Exam final-sprint bypass: free access when exam is ≤ 30 days away
  const examDate = (profile as { exam_date?: string } | null)?.exam_date ? new Date((profile as { exam_date?: string }).exam_date!) : null;
  const daysToExam = examDate ? Math.ceil((examDate.getTime() - Date.now()) / 86_400_000) : null;
  const isExamSprint = typeof daysToExam === 'number' && daysToExam >= 0 && daysToExam <= 30;
  const effectivelyPro = isPro || isExamSprint;

  // Always render children; overlay the sheet on top when needed
  if (sheet) {
    return (
      <>
        {children}
        <SheetPaywall
          featureName={featureName}
          featureDesc={featureDesc}
          open={!effectivelyPro && (open ?? false)}
          onClose={onClose}
        />
      </>
    );
  }

  // Inline: swap children for paywall
  if (!effectivelyPro) {
    return <InlinePaywall featureName={featureName} featureDesc={featureDesc} />;
  }

  return (
    <>
      {isExamSprint && !isPro && (
        <div className="px-4 py-2 text-center text-xs font-semibold rounded-xl mx-4 mb-2"
          style={{ background: 'rgba(16,185,129,0.1)', color: '#6EE7B7', border: '1px solid rgba(16,185,129,0.2)' }}>
          Free for your final sprint — we want you to pass.
        </div>
      )}
      {children}
    </>
  );
}
