// 10-Minute Daily Power Session
// 3 flashcard reviews → 2 PYQ questions → 1 concept bite
// Tracks progress in daily_power_sessions table

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check, X, ChevronRight, Trophy, Zap, Clock, BookOpen, Brain, Target } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Flashcard  { id: string; front: string; back: string; subject?: string; topic?: string; }
interface PYQQuestion {
  id: string; question_text: string; options: string[];
  correct_option: number; explanation?: string; subject?: string; topic?: string; year?: number;
}
interface ConceptBite {
  concept: string; subject?: string; description: string;
  example?: string; question?: string; answer?: string;
}
interface SessionContent {
  flashcards: Flashcard[]; pyq: PYQQuestion[]; concept_bite: ConceptBite | null;
  progress: number; max: number; completed: boolean; xp_awarded: number;
}

// ── Progress ring ─────────────────────────────────────────────────────────────
function _SessionRing({ done, total, size = 80 }: { done: number; total: number; size?: number }) {
  const stroke = 6;
  const r      = (size - stroke) / 2;
  const circ   = 2 * Math.PI * r;
  const pct    = total > 0 ? done / total : 0;
  const color  = pct >= 1 ? '#10B981' : pct >= 0.5 ? '#F59E0B' : '#5B6AF5';
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--ink-080)" strokeWidth={stroke} />
        <motion.circle
          cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ}
          animate={{ strokeDashoffset: circ - pct * circ }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{ filter: `drop-shadow(0 0 6px ${color}80)` }}
        />
      </svg>
      <div className="text-center z-10">
        <div className="font-heading font-extrabold text-white" style={{ fontSize: size * 0.22 }}>{done}</div>
        <div className="text-white/40 font-semibold" style={{ fontSize: size * 0.14 }}>of {total}</div>
      </div>
    </div>
  );
}

// ── Flashcard step ────────────────────────────────────────────────────────────
function FlashcardStep({ card, onDone }: { card: Flashcard; onDone: (knew: boolean) => void }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <div className="text-xs font-bold text-white/40 uppercase tracking-widest mb-1">Flashcard Review</div>
        <div className="text-xs text-white/30">{card.subject} {card.topic ? `· ${card.topic}` : ''}</div>
      </div>

      {/* Card */}
      <div className="perspective-1000" onClick={() => setFlipped(f => !f)} style={{ cursor: 'pointer' }}>
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
          style={{ transformStyle: 'preserve-3d', position: 'relative', minHeight: 180 }}
        >
          {/* Front */}
          <div className="absolute inset-0 rounded-3xl p-6 flex flex-col items-center justify-center text-center"
            style={{ background: 'rgba(91,106,245,0.12)', border: '1px solid rgba(91,106,245,0.25)', backfaceVisibility: 'hidden' }}>
            <BookOpen size={20} color="#A0AEFF" style={{ marginBottom: 12 }} />
            <p className="text-white font-semibold text-base leading-relaxed">{card.front}</p>
            <p className="text-white/30 text-xs mt-4">Tap to reveal answer</p>
          </div>
          {/* Back */}
          <div className="absolute inset-0 rounded-3xl p-6 flex flex-col items-center justify-center text-center"
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
            <Check size={20} color="#10B981" style={{ marginBottom: 12 }} />
            <p className="text-white font-medium text-sm leading-relaxed">{card.back}</p>
          </div>
        </motion.div>
      </div>

      {/* Rate buttons — only visible after flip */}
      <AnimatePresence>
        {flipped && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
            <button onClick={() => onDone(false)}
              className="flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
              style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.25)', color: '#F87171' }}>
              <X size={15} /> Didn't know
            </button>
            <button onClick={() => onDone(true)}
              className="flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
              style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#10B981' }}>
              <Check size={15} /> Got it!
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── PYQ step ──────────────────────────────────────────────────────────────────
function PYQStep({ q, onDone }: { q: PYQQuestion; onDone: (correct: boolean) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const revealed = selected !== null;
  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <div className="text-xs font-bold text-white/40 uppercase tracking-widest mb-1">PYQ Practice</div>
        {q.year && <div className="text-xs text-white/30">{q.subject} · {q.year}</div>}
      </div>
      <div className="rounded-2xl p-4" style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-080)' }}>
        <p className="text-white text-sm font-medium leading-relaxed">{q.question_text}</p>
      </div>
      <div className="flex flex-col gap-2.5">
        {(q.options ?? []).map((opt, i) => {
          let bg = 'var(--ink-040)';
          let border = 'var(--ink-080)';
          let color = 'var(--ink-800)';
          if (revealed) {
            if (i === q.correct_option) { bg = 'rgba(16,185,129,0.12)'; border = '#10B981'; color = '#10B981'; }
            else if (i === selected)     { bg = 'rgba(248,113,113,0.12)'; border = '#F87171'; color = '#F87171'; }
          }
          return (
            <motion.button key={i} whileTap={!revealed ? { scale: 0.98 } : {}}
              onClick={() => !revealed && setSelected(i)}
              style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: '11px 14px', color, textAlign: 'left', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s', cursor: revealed ? 'default' : 'pointer' }}>
              <span style={{ minWidth: 22, height: 22, borderRadius: 6, background: 'var(--ink-080)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                {String.fromCharCode(65 + i)}
              </span>
              <span className="flex-1">{opt}</span>
              {revealed && i === q.correct_option && <Check size={14} color="#10B981" strokeWidth={3} />}
            </motion.button>
          );
        })}
      </div>
      <AnimatePresence>
        {revealed && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ overflow: 'hidden' }}>
            {q.explanation && (
              <div className="rounded-2xl p-3.5 text-xs text-white/60 leading-relaxed mb-3"
                style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-060)' }}>
                {q.explanation}
              </div>
            )}
            <button onClick={() => onDone(selected === q.correct_option)}
              className="w-full py-3.5 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}>
              Next <ChevronRight size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Concept bite step ─────────────────────────────────────────────────────────
function ConceptBiteStep({ concept, onDone }: { concept: ConceptBite; onDone: () => void }) {
  const [phase, setPhase] = useState<'read' | 'example' | 'question' | 'answer'>('read');
  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <div className="text-xs font-bold text-white/40 uppercase tracking-widest mb-1">Concept Bite</div>
        {concept.subject && <div className="text-xs text-white/30">{concept.subject}</div>}
      </div>
      <div className="rounded-3xl p-5" style={{ background: 'linear-gradient(135deg,rgba(91,106,245,0.12),rgba(139,92,246,0.12))', border: '1px solid rgba(91,106,245,0.25)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Brain size={16} color="#A0AEFF" />
          <span className="font-heading font-extrabold text-white text-base">{concept.concept}</span>
        </div>
        <p className="text-white/80 text-sm leading-relaxed">{concept.description}</p>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'read' && (
          <motion.button key="read" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            onClick={() => setPhase('example')}
            className="w-full py-3.5 rounded-2xl font-bold text-sm text-white"
            style={{ background: 'var(--ink-080)', border: '1px solid var(--ink-100)' }}>
            See Example →
          </motion.button>
        )}
        {phase === 'example' && concept.example && (
          <motion.div key="example" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
            <div className="rounded-2xl p-4 text-sm text-white/70 leading-relaxed"
              style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <span className="text-xs font-bold text-emerald-400 uppercase block mb-1">Example</span>
              {concept.example}
            </div>
            <button onClick={() => setPhase(concept.question ? 'question' : 'answer')}
              className="w-full py-3.5 rounded-2xl font-bold text-sm text-white"
              style={{ background: 'var(--ink-080)', border: '1px solid var(--ink-100)' }}>
              {concept.question ? 'Test yourself →' : 'Complete →'}
            </button>
          </motion.div>
        )}
        {phase === 'question' && concept.question && (
          <motion.div key="question" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
            <div className="rounded-2xl p-4" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <span className="text-xs font-bold text-amber-400 uppercase block mb-1">Quick Check</span>
              <p className="text-white/80 text-sm leading-relaxed">{concept.question}</p>
            </div>
            <button onClick={() => setPhase('answer')}
              className="w-full py-3.5 rounded-2xl font-bold text-sm text-white"
              style={{ background: 'var(--ink-080)', border: '1px solid var(--ink-100)' }}>
              Reveal Answer →
            </button>
          </motion.div>
        )}
        {phase === 'answer' && (
          <motion.div key="answer" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
            {concept.answer && (
              <div className="rounded-2xl p-4 text-sm text-white/70 leading-relaxed"
                style={{ background: 'rgba(91,106,245,0.08)', border: '1px solid rgba(91,106,245,0.2)' }}>
                <span className="text-xs font-bold text-primary uppercase block mb-1">Answer</span>
                {concept.answer}
              </div>
            )}
            <button onClick={onDone}
              className="w-full py-3.5 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg,#10B981,#059669)' }}>
              <Check size={15} /> Complete Session!
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DailyPowerSessionPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [content, setContent]   = useState<SessionContent | null>(null);
  const [loading, setLoading]   = useState(true);
  const [step, setStep]         = useState(0);   // 0-5 = items, 6 = done
  const [progress, setProgress] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);
  const [busyMode, setBusyMode] = useState(false);
  const [elapsed, setElapsed]   = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const TARGET_SECS = busyMode ? 300 : 600;

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('novo-daily-session', {
        body: { action: 'get_content' },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!res.error && res.data) {
        setContent(res.data as SessionContent);
        setProgress(res.data.progress ?? 0);
        // Jump to current step if partially done
        const p = res.data.progress ?? 0;
        setStep(p >= 6 ? 6 : p);
        if (res.data.completed) setStep(6);
      }
      setLoading(false);
    })();
  }, [user]);

  // Timer
  useEffect(() => {
    if (loading || step >= 6) return;
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [loading, step]);

  async function markItemDone(itemType: 'flashcard' | 'pyq' | 'concept') {
    if (!user) return;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await supabase.functions.invoke('novo-daily-session', {
      body: {
        action: 'mark_done',
        item_type: itemType,
        busy_mode: busyMode,
        current_fc:  content?.flashcards ? Math.min(step, 2) : 0,
        current_pyq: content?.pyq ? Math.max(0, Math.min(step - 3, 1)) : 0,
      },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    const result = res.data;
    if (result?.xp_earned > 0) setXpEarned(result.xp_earned);
    const nextStep = step + 1;
    setStep(nextStep);
    setProgress(result?.progress ?? nextStep);
    if (nextStep >= 6 || result?.completed) { setStep(6); clearInterval(timerRef.current); }
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // Build ordered items from content
  const items = content ? [
    ...(content.flashcards ?? []).map(f => ({ type: 'flashcard' as const, data: f })),
    ...(content.pyq ?? []).map(q => ({ type: 'pyq' as const, data: q })),
    ...(content.concept_bite ? [{ type: 'concept' as const, data: content.concept_bite }] : []),
  ] : [];

  const currentItem = step < items.length ? items[step] : null;

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 rounded-full border-[3px] border-primary/20 border-t-primary animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col h-full pb-nav" style={{ background: 'transparent' }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/home" className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
            style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
            <ArrowLeft size={18} className="text-white" strokeWidth={1.75} />
          </Link>
          <div className="flex-1">
            <h1 className="font-heading font-extrabold text-white text-lg leading-tight">Daily Power Session</h1>
            <p className="text-xs font-semibold text-white/40">
              {busyMode ? '5-min mode' : '10-min session'} · {formatTime(elapsed)} elapsed
            </p>
          </div>
          {/* Timer display */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{ background: elapsed > TARGET_SECS * 0.8 ? 'rgba(245,158,11,0.12)' : 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
            <Clock size={12} color={elapsed > TARGET_SECS * 0.8 ? '#F59E0B' : 'var(--ink-400)'} />
            <span className="text-xs font-bold" style={{ color: elapsed > TARGET_SECS * 0.8 ? '#F59E0B' : 'var(--ink-500)' }}>
              {formatTime(Math.max(0, TARGET_SECS - elapsed))}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 flex items-center gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--ink-080)' }}>
              <motion.div animate={{ width: i < progress ? '100%' : '0%' }} transition={{ duration: 0.4, delay: i * 0.05 }}
                className="h-full rounded-full" style={{ background: i < 3 ? '#5B6AF5' : i < 5 ? '#10B981' : '#F59E0B' }} />
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-white/30">Flashcards</span>
          <span className="text-xs text-white/30">PYQ</span>
          <span className="text-xs text-white/30">Concept</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 native-scroll px-4 py-2">
        <AnimatePresence mode="wait">
          {step >= 6 ? (
            /* Completion screen */
            <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center h-full gap-6 py-12">
              <div className="w-24 h-24 rounded-3xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg,#10B981,#059669)', boxShadow: '0 8px 32px rgba(16,185,129,0.4)' }}>
                <Trophy size={42} color="#fff" />
              </div>
              <div className="text-center">
                <h2 className="font-heading font-extrabold text-white text-2xl mb-2">Session Complete!</h2>
                <p className="text-white/50 text-sm">You studied all 6 items in {formatTime(elapsed)}</p>
              </div>
              {xpEarned > 0 && (
                <div className="flex items-center gap-2 px-5 py-3 rounded-2xl"
                  style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.25)' }}>
                  <Zap size={18} color="#EAB308" fill="#EAB308" />
                  <span className="font-heading font-extrabold text-xl" style={{ color: '#EAB308' }}>+{xpEarned} XP</span>
                </div>
              )}
              {/* Busy mode unlock */}
              {!busyMode && (
                <p className="text-xs text-white/30 text-center px-8">
                  On a busy day, tap the 5-min button for a shorter session
                </p>
              )}
              <div className="flex flex-col gap-2.5 w-full">
                <button onClick={() => navigate('/chat')}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm text-white"
                  style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}>
                  Ask Novo a follow-up →
                </button>
                <button onClick={() => navigate('/home')}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm text-white/60"
                  style={{ background: 'var(--ink-050)', border: '1px solid var(--ink-080)' }}>
                  Back to Home
                </button>
              </div>
            </motion.div>
          ) : currentItem ? (
            <motion.div key={`step-${step}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }} className="py-2">
              {currentItem.type === 'flashcard' && (
                <FlashcardStep card={currentItem.data as Flashcard}
                  onDone={() => markItemDone('flashcard')} />
              )}
              {currentItem.type === 'pyq' && (
                <PYQStep q={currentItem.data as PYQQuestion}
                  onDone={() => markItemDone('pyq')} />
              )}
              {currentItem.type === 'concept' && (
                <ConceptBiteStep concept={currentItem.data as ConceptBite}
                  onDone={() => markItemDone('concept')} />
              )}
            </motion.div>
          ) : (
            /* No content available */
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full gap-4 py-12 text-center">
              <Target size={40} color="var(--ink-200)" />
              <div>
                <p className="text-white font-semibold mb-1">No session content yet</p>
                <p className="text-white/40 text-sm">Add flashcards and complete some quizzes first</p>
              </div>
              <Link to="/flashcard">
                <button className="px-6 py-3 rounded-2xl font-bold text-sm text-white"
                  style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}>
                  Create Flashcards
                </button>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Busy day footer */}
      {step < 6 && (
        <div className="px-4 pb-2 shrink-0">
          <button onClick={() => setBusyMode(v => !v)}
            className="w-full py-2.5 rounded-2xl text-xs font-semibold text-white/30 active:scale-98"
            style={{ background: 'var(--ink-030)', border: '1px solid var(--ink-060)' }}>
            {busyMode ? 'Switch to full 10-min session' : 'Busy today? Switch to 5-min mode'}
          </button>
        </div>
      )}
    </div>
  );
}
