// ─────────────────────────────────────────────────────────────────────────────
// ReportButton — "report wrong answer" control for any AI-generated content.
//
// Every AI surface (chat, quizzes, flashcards, photo solver, tutoring, etc.)
// should use this instead of reimplementing its own report flow. Writes into
// the same question_reports table the review queue (AdminConsolePage → Reports
// tab) reads from, so a report here is never a dead end.
//
// Usage:
//   <ReportButton contentText={answerText} source="photo_solver" details={`Subject: ${subject}`} />
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flag, Check } from 'lucide-react';
import { Toast } from '@capacitor/toast';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/contexts/ThemeContext';
import { reportContent, type ReportType } from '@/lib/contentReport';

const REASONS: { id: ReportType; label: string }[] = [
  { id: 'wrong_answer',  label: 'Wrong or incorrect answer' },
  { id: 'ambiguous',     label: 'Unclear or ambiguous' },
  { id: 'outdated',      label: 'Outdated information' },
  { id: 'inappropriate', label: 'Inappropriate content' },
  { id: 'other',         label: 'Other issue' },
];

interface ReportButtonProps {
  /** The AI-generated content being reported, verbatim. */
  contentText: string;
  /** Which surface this is on, e.g. 'chat', 'photo_solver', 'flashcard', 'tutoring_session'. */
  source: string;
  /** Extra context — subject/topic/model, appended to the stored report. */
  details?: string;
  /** DB id of the content if it has a stable one. */
  contentId?: string;
  className?: string;
  /** Icon-only, no "Report" label — for tight inline spots. */
  compact?: boolean;
}

export function ReportButton({ contentText, source, details, contentId, className, compact }: ReportButtonProps) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [reported, setReported] = useState(false);

  async function submit(reason: ReportType) {
    if (!user || sending) return;
    setSending(true);
    const { error } = await reportContent({
      userId: user.id, contentText, reportType: reason, source, details, contentId,
    });
    setSending(false);
    setOpen(false);
    if (!error) {
      setReported(true);
      Toast.show({ text: "Thanks — we'll review this.", duration: 'short' }).catch(() => {});
    } else {
      Toast.show({ text: 'Could not send report. Try again.', duration: 'short' }).catch(() => {});
    }
  }

  if (reported) {
    return (
      <span className={`text-xs flex items-center gap-1 ${className ?? ''}`}
        style={{ color: isLight ? '#047857' : '#34D399' }}>
        <Check size={12} /> Reported
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1 text-xs shrink-0 ${className ?? ''}`}
        style={{ color: isLight ? '#71717A' : 'var(--ink-450)' }}
        aria-label="Report an issue with this content"
      >
        <Flag size={compact ? 13 : 12} />
        {!compact && 'Report issue'}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] flex items-end"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="w-full rounded-t-3xl p-5"
              style={{ background: 'var(--surface-elev-095)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: isLight ? '#D4D4D8' : 'var(--ink-120)' }} />
              <p className="text-sm font-bold mb-3" style={{ color: isLight ? '#0F172A' : '#F4F6FA' }}>
                What's wrong with this?
              </p>
              <div className="flex flex-col gap-2">
                {REASONS.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => submit(r.id)}
                    disabled={sending}
                    className="w-full text-left p-3 rounded-xl text-sm disabled:opacity-50"
                    style={{ background: 'var(--ink-060)', color: isLight ? '#0F172A' : '#F4F6FA' }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full text-center text-sm mt-3 py-2"
                style={{ color: isLight ? '#71717A' : 'var(--ink-500)' }}
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
