import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@/lib/motion';
import { X, CheckCircle2, XCircle, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { storage } from '@/lib/storage';

const INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
const DISMISS_KEY = 'edora_sri_last';

interface Flashcard {
  id: string;
  front: string;
  back: string;
  subject?: string;
}

export function SpacedReviewInterrupt() {
  const { user } = useAuth();
  const [card, setCard]         = useState<Flashcard | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [visible, setVisible]   = useState(false);

  const fetchWeakCard = useCallback(async () => {
    if (!user) return;

    // Check cooldown — don't interrupt again within 20 minutes
    const last = Number(storage.getItem(DISMISS_KEY) ?? 0);
    if (Date.now() - last < INTERVAL_MS) return;

    // Pull one flashcard from weak topics (low correct_count)
    const { data } = await supabase
      .from('flashcards')
      .select('id, front, back, subject')
      .eq('user_id', user.id)
      .order('correct_count', { ascending: true })
      .limit(10);

    if (!data || data.length === 0) return;
    // Pick a random one from bottom 10 to avoid always showing the same card
    const pick = data[Math.floor(Math.random() * data.length)];
    setCard(pick as Flashcard);
    setRevealed(false);
    setVisible(true);
  }, [user]);

  useEffect(() => {
    // `active` is set to false in cleanup BEFORE React can re-run the effect.
    // This closes the race window where the old stale-closure fetchWeakCard
    // (which still holds the previous user object) fires one last time between
    // logout and the old interval being cleared.
    let active = true;
    const guard = () => { if (active) fetchWeakCard(); };

    const t        = setTimeout(guard, INTERVAL_MS);
    const interval = setInterval(guard, INTERVAL_MS);
    return () => { active = false; clearTimeout(t); clearInterval(interval); };
  }, [fetchWeakCard]);

  function dismiss() {
    storage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  }

  async function markCorrect() {
    if (!card || !user) return;
    const { data } = await supabase
      .from('flashcards')
      .select('correct_count')
      .eq('id', card.id)
      .eq('user_id', user.id)
      .single();
    if (data != null) {
      await supabase
        .from('flashcards')
        .update({ correct_count: (data.correct_count ?? 0) + 1 })
        .eq('id', card.id)
        .eq('user_id', user.id);
    }
    dismiss();
  }

  if (!card) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed bottom-28 left-4 right-4 z-[500] rounded-2xl overflow-hidden"
          style={{ boxShadow: '0 8px 40px rgba(124,58,237,0.35)' }}
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0,  opacity: 1 }}
          exit={{ y: 80,    opacity: 0 }}
          transition={spring.lazy}>

          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-2.5"
            style={{ background: 'linear-gradient(90deg, #7C3AED, #A855F7)' }}>
            <span className="text-xs font-bold text-white/90 tracking-wide">⚡ Quick question</span>
            <button onClick={dismiss} aria-label="Dismiss"
              className="flex items-center justify-center -mr-1"
              style={{ width: 44, height: 44 }}>
              <span className="w-6 h-6 rounded-full flex items-center justify-center bg-white/20">
                <X size={12} className="text-white" />
              </span>
            </button>
          </div>

          {/* Card body */}
          <div className="px-4 py-4" style={{
            background: 'var(--ink-040)',
            backdropFilter: 'blur(36px)',
            WebkitBackdropFilter: 'blur(36px)',
            border: '1px solid rgba(124,58,237,0.22)',
            borderTop: 'none',
          }}>
            {card.subject && (
              <p className="text-xs font-semibold mb-2" style={{ color: '#A855F7' }}>{card.subject}</p>
            )}
            <p className="text-sm font-semibold text-white leading-snug">{card.front}</p>

            <AnimatePresence>
              {revealed ? (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className="mt-3 pt-3" style={{ borderTop: '1px solid var(--ink-080)' }}>
                  <p className="text-sm text-white/80 leading-snug mb-4">{card.back}</p>
                  <div className="flex gap-2">
                    <button onClick={dismiss}
                      className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl text-xs font-semibold"
                      style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#F87171' }}>
                      <XCircle size={13} /> Missed it
                    </button>
                    <button onClick={markCorrect}
                      className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl text-xs font-semibold"
                      style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', color: '#34D399' }}>
                      <CheckCircle2 size={13} /> Got it!
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  onClick={() => setRevealed(true)}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl text-xs font-semibold"
                  style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.25)', color: '#C4B5FD' }}>
                  Show answer <ChevronRight size={13} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
