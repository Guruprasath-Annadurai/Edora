import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PenLine, ChevronLeft, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { QuizQuestion } from '@/types';

interface JournalEntry {
  id: string;
  topic: string;
  score: number;
  total: number;
  created_at: string;
  mistakes: { question: string; your_answer: string; correct_answer: string; explanation: string }[];
}

export default function MistakeJournalPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from('quiz_sessions')
        .select('id, topic, score, questions, user_answers, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) console.error('[MistakeJournal] load error:', error.message);
      if (!data) { setLoading(false); return; }

      const journal: JournalEntry[] = data
        .filter((s: any) => s.score < (s.questions?.length ?? 0))
        .map((s: any) => {
          const qs: QuizQuestion[] = s.questions ?? [];
          // user_answers is a separate column (array of chosen indices) or falls back
          // to per-question user_answer field for backwards compat
          const userAnswers: (number | null)[] = Array.isArray(s.user_answers)
            ? s.user_answers
            : qs.map((q: any) => q.user_answer ?? null);

          const mistakes = qs
            .map((q, i) => ({ q, userAns: userAnswers[i] }))
            .filter(({ q, userAns }) => userAns !== null && userAns !== q.correct_answer)
            .map(({ q, userAns }) => ({
              question:       q.question,
              your_answer:    q.options?.[(userAns as number)] ?? 'Skipped',
              correct_answer: q.options?.[q.correct_answer] ?? '',
              explanation:    q.explanation ?? '',
            }));
          return {
            id:         s.id,
            topic:      s.topic ?? 'Unknown topic',
            score:      s.score,
            total:      qs.length,
            created_at: s.created_at,
            mistakes,
          };
        });

      setEntries(journal);
      setLoading(false);
    })();
  }, [user]);

  const dateStr = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="flex flex-col h-full bg-gradient-page">
      <div className="px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ background: 'rgba(10,12,28,0.85)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
        <Link aria-label="Go back" to="/tools"
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <ChevronLeft size={18} className="text-white" />
        </Link>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #EC4899, #8B5CF6)' }}>
          <PenLine size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h2 className="font-heading font-bold text-white text-sm">Mistake Journal</h2>
          <p className="text-xs text-muted-foreground">Review your wrong answers</p>
        </div>
      </div>

      <div className="flex-1 native-scroll pb-nav px-4 py-4 flex flex-col gap-3">
        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        )}

        {!loading && entries.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <CheckCircle size={56} className="text-green-400" strokeWidth={1.5} />
            <div>
              <p className="font-heading text-lg font-bold text-white">No mistakes yet!</p>
              <p className="text-sm text-muted-foreground mt-1">Take a quiz and your wrong answers will appear here.</p>
            </div>
            <Link to="/quiz"><Button>Start a Quiz</Button></Link>
          </motion.div>
        )}

        {!loading && entries.map((entry, i) => (
          <motion.div key={entry.id}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <div className="rounded-3xl overflow-hidden"
              style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {/* Entry header */}
              <button className="w-full px-4 py-4 flex items-center gap-3 text-left"
                onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(236,72,153,0.15)' }}>
                  <PenLine size={18} style={{ color: '#F472B6' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white text-sm truncate">{entry.topic}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{dateStr(entry.created_at)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold text-white">{entry.score}/{entry.total}</span>
                  <div className={`w-2 h-2 rounded-full transition-transform ${expanded === entry.id ? 'rotate-180' : ''}`}
                    style={{ background: '#F472B6' }} />
                </div>
              </button>

              {/* Mistake list */}
              {expanded === entry.id && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                  {entry.mistakes.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-muted-foreground text-center">
                      Detailed breakdown not available for older sessions.
                    </p>
                  ) : entry.mistakes.map((m, j) => (
                    <div key={j} className="px-4 py-3 last:pb-3"
                      style={{ borderBottom: j < entry.mistakes.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                      <p className="text-sm font-medium text-white/85 mb-2">{m.question}</p>
                      <div className="flex items-start gap-2 mb-1">
                        <XCircle size={13} style={{ color: '#F87171' }} className="shrink-0 mt-0.5" />
                        <p className="text-xs text-red-400">Your answer: {m.your_answer}</p>
                      </div>
                      <div className="flex items-start gap-2 mb-2">
                        <CheckCircle size={13} style={{ color: '#34D399' }} className="shrink-0 mt-0.5" />
                        <p className="text-xs" style={{ color: '#34D399' }}>Correct: {m.correct_answer}</p>
                      </div>
                      {m.explanation && (
                        <p className="text-xs text-muted-foreground rounded-xl px-3 py-2"
                          style={{ background: 'rgba(255,255,255,0.05)' }}>{m.explanation}</p>
                      )}
                    </div>
                  ))}
                </motion.div>
              )}
            </div>
          </motion.div>
        ))}
        <div className="h-4" />
      </div>
    </div>
  );
}
