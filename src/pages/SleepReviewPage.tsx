import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Moon, Star, ChevronLeft, RotateCcw, Check, X, Sparkles, BookOpen, AlertTriangle, Square, CheckSquare, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { geminiJSON } from '@/lib/gemini';

interface Flashcard {
  id: string;
  front: string;
  back: string;
  subject: string;
  topic: string;
  repetitions: number;
  ease_factor: number;
  interval: number;
}

// ── SM-2 next review calculation ─────────────────────────────────────────────
function nextReview(card: Flashcard, quality: 0 | 5) {
  const ef  = Math.max(1.3, card.ease_factor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  const rep = quality >= 3 ? card.repetitions + 1 : 0;
  const interval = rep <= 1 ? 1 : rep === 2 ? 6 : Math.round(card.interval * ef);
  const next = new Date();
  next.setDate(next.getDate() + interval);
  return { ease_factor: ef, repetitions: rep, interval, next_review_at: next.toISOString() };
}

// ── Breathing card ────────────────────────────────────────────────────────────
function IntroCard({ onStart, examName, examDaysLeft, onOpenChecklist }: {
  onStart: () => void;
  examName?: string;
  examDaysLeft?: number;
  onOpenChecklist?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center justify-center h-full gap-8 px-6 text-center"
    >
      <motion.div
        animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
      >
        <Moon size={64} style={{ color: '#A78BFA', filter: 'drop-shadow(0 0 24px rgba(167,139,250,0.6))' }} />
      </motion.div>

      <div>
        <h1 className="font-heading text-3xl font-extrabold text-white mb-2">Sleep Review</h1>
        <p className="text-white/50 text-sm leading-relaxed max-w-xs">
          A calm 5-card review to consolidate today's learning before sleep. No timer, no pressure.
        </p>
      </div>

      {/* Night-before exam nudge */}
      {examDaysLeft !== undefined && onOpenChecklist && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onOpenChecklist}
          className="w-full max-w-xs flex items-center gap-3 px-4 py-3 rounded-2xl text-left"
          style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}
        >
          <AlertTriangle size={18} style={{ color: '#F59E0B', flexShrink: 0 }} />
          <div>
            <div className="text-sm font-bold" style={{ color: '#F59E0B' }}>
              {examName} in {examDaysLeft} day{examDaysLeft === 1 ? '' : 's'}!
            </div>
            <div className="text-xs text-white/50">Tap for AI night-before checklist →</div>
          </div>
        </motion.button>
      )}

      <div className="flex flex-col gap-2 w-full max-w-xs">
        {['5 cards · spaced repetition', 'No time pressure', 'Gentle on your eyes'].map((t) => (
          <div key={t} className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl"
            style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.15)' }}>
            <Star size={12} style={{ color: '#A78BFA', fill: '#A78BFA' }} />
            <span className="text-sm text-white/70">{t}</span>
          </div>
        ))}
      </div>

      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={onStart}
        className="w-full max-w-xs py-4 rounded-2xl font-bold text-white text-base"
        style={{
          background: 'linear-gradient(135deg,#7C3AED,#A78BFA)',
          boxShadow: '0 8px 32px rgba(124,58,237,0.4)',
        }}
      >
        Begin Review
      </motion.button>
    </motion.div>
  );
}

// ── Single flashcard ──────────────────────────────────────────────────────────
interface CardStepProps {
  card: Flashcard;
  index: number;
  total: number;
  onResult: (known: boolean) => void;
}
function CardStep({ card, index, total, onResult }: CardStepProps) {
  const [flipped, setFlipped] = useState(false);

  return (
    <motion.div
      key={card.id}
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      className="flex flex-col h-full px-5 pt-4 pb-6 gap-5"
    >
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-500"
            style={{
              width: i === index ? 20 : 7,
              height: 7,
              background: i < index
                ? 'rgba(167,139,250,0.8)'
                : i === index
                ? '#A78BFA'
                : 'rgba(255,255,255,0.12)',
            }}
          />
        ))}
      </div>

      {/* Card flip area */}
      <div
        className="flex-1 flex items-center justify-center"
        style={{ perspective: 1200 }}
        onClick={() => !flipped && setFlipped(true)}
      >
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          style={{ transformStyle: 'preserve-3d', width: '100%', minHeight: 220, position: 'relative', cursor: flipped ? 'default' : 'pointer' }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl p-6 text-center"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              background: 'linear-gradient(135deg,rgba(109,40,217,0.18),rgba(167,139,250,0.10))',
              border: '1px solid rgba(167,139,250,0.2)',
              boxShadow: '0 8px 40px rgba(109,40,217,0.2)',
            }}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400/60 mb-4">Question</p>
            <p className="text-xl font-bold text-white leading-snug">{card.front}</p>
            {!flipped && (
              <p className="mt-5 text-xs text-white/30 font-semibold">Tap to reveal answer</p>
            )}
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl p-6 text-center"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              background: 'linear-gradient(135deg,rgba(30,20,70,0.95),rgba(50,30,100,0.95))',
              border: '1px solid rgba(167,139,250,0.3)',
              boxShadow: '0 8px 40px rgba(109,40,217,0.3)',
            }}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400/60 mb-4">Answer</p>
            <p className="text-lg font-semibold text-white/90 leading-snug">{card.back}</p>
          </div>
        </motion.div>
      </div>

      {/* Subject / topic tag */}
      <div className="flex items-center justify-center gap-1.5">
        <BookOpen size={12} className="text-white/30" />
        <span className="text-xs text-white/30 font-semibold">{card.subject} · {card.topic}</span>
      </div>

      {/* Action buttons — only after flip */}
      <AnimatePresence>
        {flipped && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3"
          >
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => onResult(false)}
              className="flex-1 py-4 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm"
              style={{
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.2)',
                color: '#FCA5A5',
              }}
            >
              <X size={16} /> Review again
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => onResult(true)}
              className="flex-1 py-4 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm"
              style={{
                background: 'rgba(167,139,250,0.15)',
                border: '1px solid rgba(167,139,250,0.3)',
                color: '#C4B5FD',
              }}
            >
              <Check size={16} /> Got it
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Completion screen ─────────────────────────────────────────────────────────
function CompletionScreen({ known, total, onRestart }: { known: number; total: number; onRestart: () => void }) {
  const navigate  = useNavigate();
  const retention = Math.round((known / total) * 100);

  const TIPS = [
    'Sleep locks in memory. You\'ve already done the hard work.',
    'Your brain will rehearse these cards as you sleep.',
    'Consistency beats intensity. 5 cards a night beats 100 cards once a week.',
    'REM sleep is your brain\'s filing system — trust the process.',
  ];
  const tip = TIPS[Math.floor(Math.random() * TIPS.length)];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center h-full gap-6 px-6 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 16, delay: 0.2 }}
      >
        <div
          className="w-24 h-24 rounded-full flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg,#4C1D95,#7C3AED)',
            boxShadow: '0 0 48px rgba(124,58,237,0.5)',
          }}
        >
          <Moon size={40} className="text-white" />
        </div>
      </motion.div>

      <div>
        <h2 className="font-heading text-3xl font-extrabold text-white mb-1">Good night</h2>
        <p className="text-white/50 text-sm">
          {known}/{total} cards recalled · {retention}% retention
        </p>
      </div>

      {/* Retention ring */}
      <div className="relative w-28 h-28">
        <svg width={112} height={112} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={56} cy={56} r={48} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8} />
          <motion.circle
            cx={56} cy={56} r={48} fill="none" stroke="#A78BFA" strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 48}
            initial={{ strokeDashoffset: 2 * Math.PI * 48 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 48 * (1 - retention / 100) }}
            transition={{ duration: 1.4, ease: 'easeOut', delay: 0.4 }}
            style={{ filter: 'drop-shadow(0 0 6px rgba(167,139,250,0.7))' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-heading text-2xl font-extrabold text-white">{retention}%</span>
          <span className="text-[10px] text-white/40 font-semibold">retention</span>
        </div>
      </div>

      {/* Sleep tip */}
      <div
        className="px-5 py-4 rounded-2xl max-w-xs"
        style={{
          background: 'rgba(167,139,250,0.08)',
          border: '1px solid rgba(167,139,250,0.15)',
        }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles size={12} style={{ color: '#A78BFA' }} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400/70">Sleep insight</span>
        </div>
        <p className="text-sm text-white/60 leading-relaxed">{tip}</p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => navigate('/home')}
          className="w-full py-4 rounded-2xl font-bold text-white text-base"
          style={{
            background: 'linear-gradient(135deg,#4C1D95,#7C3AED)',
            boxShadow: '0 8px 32px rgba(124,58,237,0.35)',
          }}
        >
          Back to home
        </motion.button>
        {known < total && (
          <button onClick={onRestart} className="flex items-center justify-center gap-1.5 text-sm text-white/40 font-semibold">
            <RotateCcw size={13} /> Review missed cards
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ── Night-Before Exam Checklist ───────────────────────────────────────────────
function NightBeforeChecklist({ examName, daysLeft, onClose }: { examName: string; daysLeft: number; onClose: () => void }) {
  const [items, setItems]     = useState<string[]>([]);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const result = await geminiJSON<string[]>(
          `You are helping a student the night before their ${examName} exam (${daysLeft} day${daysLeft === 1 ? '' : 's'} away).
Generate exactly 10 high-yield concept checklist items they should quickly review tonight.
Each item should be a short, specific concept (not a generic tip).
Return a JSON array of 10 strings, e.g. ["Newton's 3 laws and their applications", "Integration by parts formula", ...]
Keep each item under 8 words. No numbering. No markdown.`
        );
        const list = Array.isArray(result) ? result.slice(0, 10) : [];
        setItems(list);
        setChecked(new Array(list.length).fill(false));
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [examName, daysLeft]);

  const toggle = (i: number) => setChecked(prev => { const n = [...prev]; n[i] = !n[i]; return n; });
  const doneCount = checked.filter(Boolean).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col h-full px-5 pt-4 pb-6 gap-4 overflow-y-auto"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-1">
        <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <ChevronLeft size={16} className="text-white/60" />
        </button>
        <div>
          <div className="text-base font-bold text-white">Night Before Checklist</div>
          <div className="text-xs text-white/40">{examName} · {daysLeft === 1 ? 'Tomorrow!' : `${daysLeft} days away`}</div>
        </div>
      </div>

      {/* Urgency banner */}
      <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
        <AlertTriangle size={16} style={{ color: '#F59E0B', flexShrink: 0 }} />
        <p className="text-xs text-amber-300/80">
          {daysLeft <= 1 ? 'Your exam is tomorrow! Tick these key concepts.' : `Only ${daysLeft} days left — review these high-yield topics.`}
        </p>
      </div>

      {/* Checklist */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
            <Loader2 size={28} style={{ color: '#A78BFA' }} />
          </motion.div>
          <p className="text-sm text-white/40">Generating your checklist…</p>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-white/40 text-center">Couldn't generate checklist.<br />Check your connection and try again.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 flex-1">
          {items.map((item, i) => (
            <motion.button
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => toggle(i)}
              className="w-full text-left flex items-start gap-3 px-4 py-3 rounded-2xl transition-all"
              style={{
                background: checked[i] ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${checked[i] ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.07)'}`,
              }}
            >
              {checked[i]
                ? <CheckSquare size={16} style={{ color: '#A78BFA', marginTop: 1, flexShrink: 0 }} />
                : <Square size={16} style={{ color: 'rgba(255,255,255,0.25)', marginTop: 1, flexShrink: 0 }} />
              }
              <span className="text-sm leading-snug" style={{ color: checked[i] ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.85)', textDecoration: checked[i] ? 'line-through' : 'none' }}>
                {item}
              </span>
            </motion.button>
          ))}
        </div>
      )}

      {/* Progress footer */}
      {!loading && !error && items.length > 0 && (
        <div className="pt-2">
          <div className="flex justify-between text-xs text-white/40 mb-1.5">
            <span>{doneCount}/{items.length} checked</span>
            <span>{Math.round((doneCount / items.length) * 100)}% reviewed</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg,#7C3AED,#A78BFA)' }}
              animate={{ width: `${(doneCount / items.length) * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 px-6 text-center">
      <Moon size={48} style={{ color: 'rgba(167,139,250,0.4)' }} />
      <div>
        <h2 className="font-heading text-xl font-bold text-white mb-2">No cards due tonight</h2>
        <p className="text-sm text-white/40 leading-relaxed max-w-xs">
          You're all caught up. Create more flashcards during the day to build your night review queue.
        </p>
      </div>
      <button
        onClick={() => navigate('/flashcard')}
        className="px-6 py-3 rounded-2xl text-sm font-bold"
        style={{ background: 'rgba(167,139,250,0.15)', color: '#C4B5FD', border: '1px solid rgba(167,139,250,0.25)' }}
      >
        Go to flashcards
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SleepReviewPage() {
  const { user } = useAuth();
  const navigate    = useNavigate();
  const [phase, setPhase]     = useState<'intro' | 'review' | 'done' | 'checklist'>('intro');
  const [cards, setCards]     = useState<Flashcard[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [knownCount, setKnownCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty]     = useState(false);
  const [examDaysLeft, setExamDaysLeft] = useState<number | null>(null);
  const [examName, setExamName]         = useState<string>('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [cardsRes, profileRes] = await Promise.all([
        supabase
          .from('flashcards')
          .select('id, front, back, subject, topic, repetitions, ease_factor, interval')
          .eq('user_id', user.id)
          .lte('next_review_at', new Date().toISOString())
          .order('next_review_at', { ascending: true })
          .limit(5),
        supabase
          .from('profiles')
          .select('exam_date, exam_name')
          .eq('id', user.id)
          .single(),
      ]);
      setCards((cardsRes.data as Flashcard[]) ?? []);
      setEmpty(!cardsRes.data || cardsRes.data.length === 0);

      if (profileRes.data?.exam_date) {
        const days = Math.ceil((new Date(profileRes.data.exam_date).getTime() - Date.now()) / 86400000);
        if (days > 0 && days <= 7) {
          setExamDaysLeft(days);
          setExamName((profileRes.data as { exam_date: string; exam_name?: string }).exam_name ?? 'Your Exam');
        }
      }

      setLoading(false);
    })();
  }, [user]);

  const handleResult = useCallback(async (known: boolean) => {
    const card = cards[cardIndex];
    if (!card || !user) return;

    const quality = known ? 5 : 0;
    const update  = nextReview(card, quality);
    supabase.from('flashcards').update(update).eq('id', card.id).then(() => {});

    const nextIndex = cardIndex + 1;
    if (known) setKnownCount(prev => prev + 1);

    if (nextIndex >= cards.length) {
      setPhase('done');
    } else {
      setCardIndex(nextIndex);
    }
  }, [cardIndex, cards, user]);

  function handleRestart() {
    const missed = cards.filter((_, i) => i >= 0); // restart with all for simplicity
    setCards(missed);
    setCardIndex(0);
    setKnownCount(0);
    setPhase('review');
  }

  if (loading) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ background: 'linear-gradient(180deg,#0D0A1F 0%,#120E2E 100%)' }}
      >
        <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 2 }}>
          <Moon size={32} style={{ color: '#A78BFA' }} />
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ background: 'linear-gradient(180deg,#0D0A1F 0%,#120E2E 60%,#0A0818 100%)' }}
    >
      {/* Stars background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 30 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              width: Math.random() * 2 + 1,
              height: Math.random() * 2 + 1,
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              opacity: Math.random() * 0.4 + 0.1,
            }}
            animate={{ opacity: [0.1, 0.5, 0.1] }}
            transition={{ repeat: Infinity, duration: Math.random() * 4 + 2, delay: Math.random() * 3 }}
          />
        ))}
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center px-5 pt-14 pb-4">
        <button aria-label="Go back"
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <ChevronLeft size={18} className="text-white/60" />
        </button>
        <div className="flex-1 text-center">
          <p className="text-sm font-semibold text-white/40">Sleep Review</p>
        </div>
        <div className="w-9" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {phase === 'checklist' ? (
            <NightBeforeChecklist
              key="checklist"
              examName={examName}
              daysLeft={examDaysLeft ?? 1}
              onClose={() => setPhase('intro')}
            />
          ) : empty ? (
            <EmptyState key="empty" />
          ) : phase === 'intro' ? (
            <IntroCard
              key="intro"
              onStart={() => setPhase('review')}
              examName={examDaysLeft !== null ? examName : undefined}
              examDaysLeft={examDaysLeft ?? undefined}
              onOpenChecklist={examDaysLeft !== null ? () => setPhase('checklist') : undefined}
            />
          ) : phase === 'review' ? (
            <CardStep
              key={`card-${cardIndex}`}
              card={cards[cardIndex]}
              index={cardIndex}
              total={cards.length}
              onResult={handleResult}
            />
          ) : (
            <CompletionScreen
              key="done"
              known={knownCount}
              total={cards.length}
              onRestart={handleRestart}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
