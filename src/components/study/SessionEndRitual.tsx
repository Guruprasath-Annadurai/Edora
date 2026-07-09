import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@/lib/motion';
import { BookOpen, Brain, Clock, Flame, ChevronRight, X } from 'lucide-react';
import { NovoAvatar } from '@/components/novo/NovoAvatar';
import { useSessionTimer } from '@/hooks/useSessionTimer';

interface Props {
  /** Controlled: set true when user navigates away / closes app */
  open: boolean;
  onClose: () => void;
  streak?: number;
  /** Topic the student struggled with most today (from Novo memory) */
  struggledWith?: string;
  /** What Novo recommends tackling tomorrow */
  nextSuggestion?: string;
}

const ROUTE_LABELS: Record<string, string> = {
  '/chat':           'Novo chat',
  '/flashcard':      'Flashcards',
  '/quiz':           'Quiz',
  '/sprint':         'Sprint session',
  '/spaced-review':  'Spaced review',
  '/ncert-chapters': 'NCERT reading',
  '/learning':       'Learning hub',
  '/formulas':       'Formula sheets',
};

function labelRoute(r: string) {
  return ROUTE_LABELS[r] ?? r.replace('/', '').replace(/-/g, ' ');
}

function novoMessage(durationMin: number, topics: number): string {
  if (durationMin < 5) return 'Short session today — every minute counts. See you tomorrow!';
  if (durationMin < 20) return `Nice warmup! ${topics > 1 ? `You touched ${topics} topics.` : ''} Build on this tomorrow.`;
  if (durationMin < 45) return `Solid session! Keep this momentum — consistency beats cramming.`;
  return `Outstanding focus — ${durationMin} minutes! Novo is proud of you. Rest up now.`;
}

export function SessionEndRitual({ open, onClose, streak = 0, struggledWith, nextSuggestion }: Props) {
  const { getSummary, resetSession } = useSessionTimer();
  const [summary, setSummary] = useState<ReturnType<typeof getSummary> | null>(null);

  useEffect(() => {
    if (open) setSummary(getSummary());
  }, [open, getSummary]);

  function handleClose() {
    resetSession();
    onClose();
  }

  if (!summary) return null;
  const topics = summary.topicsVisited.map(labelRoute);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[900] flex items-end"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/70" onClick={handleClose} />

          <motion.div className="relative w-full rounded-t-[32px] px-5 pt-6 pb-10 flex flex-col gap-5"
            style={{
              background: 'var(--surface-scrim)',
              backdropFilter: 'blur(72px) saturate(220%) brightness(1.04)',
              WebkitBackdropFilter: 'blur(72px) saturate(220%) brightness(1.04)',
              borderTop: '1px solid rgba(124,58,237,0.32)',
              boxShadow: 'inset 0 1px 0 rgba(124,58,237,0.2)',
            }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={spring.sheet}>

            {/* Handle + close */}
            <div className="flex items-center justify-between">
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--ink-120)' }} />
              <button onClick={handleClose} className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'var(--ink-060)' }}>
                <X size={14} className="text-white" />
              </button>
            </div>

            {/* Novo message */}
            <div className="flex items-start gap-4">
              <NovoAvatar state="talking" size="md" />
              <div className="flex-1 rounded-2xl px-4 py-3"
                style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)' }}>
                <p className="text-sm text-white leading-relaxed">
                  {novoMessage(summary.durationMin, topics.length)}
                </p>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Clock,   value: `${Math.max(1, summary.durationMin)}m`, label: 'Studied' },
                { icon: BookOpen,value: String(topics.length || 1),             label: 'Topics' },
                { icon: Flame,   value: String(streak),                         label: 'Streak' },
              ].map(({ icon: Icon, value, label }) => (
                <div key={label} className="rounded-2xl p-3 text-center"
                  style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-060)' }}>
                  <Icon size={16} className="mx-auto mb-1" style={{ color: '#A855F7' }} />
                  <p className="font-heading font-bold text-white text-lg leading-none">{value}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--ink-400)' }}>{label}</p>
                </div>
              ))}
            </div>

            {/* Topics covered */}
            {topics.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-350)' }}>
                  Covered today
                </p>
                <div className="flex flex-wrap gap-2">
                  {topics.slice(0, 5).map(t => (
                    <span key={t} className="px-3 py-1 rounded-full text-xs font-medium"
                      style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.2)', color: '#C4B5FD' }}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Struggled + next */}
            {(struggledWith || nextSuggestion) && (
              <div className="rounded-2xl p-4 flex flex-col gap-2"
                style={{ background: 'var(--ink-030)', border: '1px solid var(--ink-060)' }}>
                {struggledWith && (
                  <div className="flex items-start gap-2">
                    <Brain size={14} style={{ color: '#F59E0B' }} className="shrink-0 mt-0.5" />
                    <p className="text-xs" style={{ color: 'var(--ink-600)' }}>
                      <span className="font-semibold text-white">Novo noticed:</span> you struggled with {struggledWith}
                    </p>
                  </div>
                )}
                {nextSuggestion && (
                  <div className="flex items-start gap-2">
                    <ChevronRight size={14} style={{ color: '#10B981' }} className="shrink-0 mt-0.5" />
                    <p className="text-xs" style={{ color: 'var(--ink-600)' }}>
                      <span className="font-semibold text-white">Tomorrow:</span> try {nextSuggestion} first
                    </p>
                  </div>
                )}
              </div>
            )}

            <motion.button whileTap={{ scale: 0.97 }} onClick={handleClose}
              className="w-full h-12 rounded-2xl font-heading font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #A855F7)' }}>
              Done for today
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
