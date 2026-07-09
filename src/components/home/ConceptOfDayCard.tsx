import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, RotateCcw, Share2, ChevronRight, Sparkles } from 'lucide-react';
import { Share } from '@capacitor/share';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

interface ConceptCard {
  concept: string;
  subject: string | null;
  description: string;
  example: string | null;
  question: string | null;
  answer: string | null;
}

export function ConceptOfDayCard() {
  const { user }  = useAuth();
  const [card, setCard]       = useState<ConceptCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const [_phase, setPhase]     = useState<'concept' | 'question'>('concept');
  const [revealed, setRevealed] = useState(false);
  const [sharing, setSharing]   = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const { data } = await supabase
          .from('concept_of_day')
          .select('concept, subject, description, example, question, answer')
          .eq('user_id', user.id)
          .eq('concept_date', today)
          .single();
        if (data) {
          setCard(data as ConceptCard);
        } else {
          // Trigger generation via edge function
          const { data: { session } } = await supabase.auth.getSession();
          const res = await supabase.functions.invoke('novo-daily-session', {
            body: { action: 'get_content' },
            headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
          });
          if (res.data?.concept_bite) setCard(res.data.concept_bite as ConceptCard);
        }
      } catch { /* non-critical */ }
      setLoading(false);
    })();
  }, [user]);

  async function handleShare() {
    if (!card || sharing) return;
    setSharing(true);
    const text = `Today's Concept: ${card.concept}\n\n${card.description}${card.example ? `\n\nExample: ${card.example}` : ''}\n\n— via Edora`;
    try {
      await Share.share({ text, dialogTitle: 'Share Concept' });
    } catch {
      // Fallback for web
      if (navigator.share) await navigator.share({ text }).catch(() => {});
      else await navigator.clipboard.writeText(text).catch(() => {});
    }
    setSharing(false);
  }

  if (loading) {
    return (
      <div
        className="rounded-3xl p-5 animate-pulse"
        style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.1)', height: 140 }}
      />
    );
  }
  if (!card) return null;

  const hasQuestion = !!card.question;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-base font-bold text-white">Concept of the Day</h2>
        <span className="text-xs font-bold uppercase tracking-widest text-yellow-400/50">Daily</span>
      </div>

      <div style={{ perspective: 1000 }}>
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
          style={{ transformStyle: 'preserve-3d', position: 'relative', minHeight: 180 }}
        >
          {/* Front — Concept */}
          <div
            className="absolute inset-0 rounded-3xl overflow-hidden"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              background: 'linear-gradient(135deg,rgba(234,179,8,0.10),rgba(251,191,36,0.06))',
              border: '1px solid rgba(234,179,8,0.18)',
              boxShadow: '0 4px 32px rgba(234,179,8,0.08)',
            }}
          >
            {/* Top stripe */}
            <div style={{ height: 2, background: 'linear-gradient(90deg,#EAB308,#FBBF24,#F59E0B)' }} />
            <div className="p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'linear-gradient(135deg,#CA8A04,#EAB308)' }}
                  >
                    <Lightbulb size={14} className="text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-yellow-400/60 mb-0">
                      {card.subject ?? 'Science'}
                    </p>
                    <p className="text-base font-extrabold text-white leading-tight">{card.concept}</p>
                  </div>
                </div>
                <button
                  onClick={handleShare}
                  disabled={sharing}
                  className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 active:scale-90 transition-transform"
                  style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.15)' }}
                >
                  <Share2 size={12} style={{ color: '#EAB308' }} />
                </button>
              </div>

              <p className="text-sm text-white/70 leading-relaxed mb-3">{card.description}</p>

              {card.example && (
                <div
                  className="px-3 py-2 rounded-xl mb-3"
                  style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.1)' }}
                >
                  <p className="text-xs text-yellow-300/70 font-semibold leading-snug">{card.example}</p>
                </div>
              )}

              {hasQuestion && (
                <button
                  onClick={() => setFlipped(true)}
                  className="flex items-center gap-1.5 text-xs font-bold"
                  style={{ color: '#EAB308' }}
                >
                  <Sparkles size={11} /> Test your understanding <ChevronRight size={11} />
                </button>
              )}
            </div>
          </div>

          {/* Back — Question */}
          {hasQuestion && (
            <div
              className="absolute inset-0 rounded-3xl overflow-hidden flex flex-col"
              style={{
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
                background: 'linear-gradient(135deg,rgba(234,179,8,0.12),rgba(251,191,36,0.08))',
                border: '1px solid rgba(234,179,8,0.22)',
              }}
            >
              <div style={{ height: 2, background: 'linear-gradient(90deg,#EAB308,#FBBF24,#F59E0B)' }} />
              <div className="p-4 flex flex-col flex-1">
                <p className="text-xs font-bold uppercase tracking-widest text-yellow-400/60 mb-2">Quick Check</p>
                <p className="text-sm font-semibold text-white leading-snug mb-4">{card.question}</p>

                <AnimatePresence>
                  {revealed ? (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex-1"
                    >
                      <div
                        className="px-3 py-2.5 rounded-2xl mb-3"
                        style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.15)' }}
                      >
                        <p className="text-sm text-yellow-200/80 leading-snug">{card.answer}</p>
                      </div>
                      <button
                        onClick={() => { setFlipped(false); setRevealed(false); setPhase('concept'); }}
                        className="flex items-center gap-1.5 text-xs text-white/35 font-semibold"
                      >
                        <RotateCcw size={11} /> Back to concept
                      </button>
                    </motion.div>
                  ) : (
                    <motion.button
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => setRevealed(true)}
                      className="py-3 rounded-2xl text-sm font-bold"
                      style={{
                        background: 'linear-gradient(135deg,#CA8A04,#EAB308)',
                        color: 'var(--ink-950)',
                        boxShadow: '0 4px 16px rgba(234,179,8,0.3)',
                      }}
                    >
                      Reveal Answer
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
