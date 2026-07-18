import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, ChevronLeft, ChevronRight, Sparkles, BookOpen, Loader2, Undo2, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { geminiJSON } from '@/lib/gemini';
import { track } from '@/lib/analytics';
import { loadUnlockedIds, checkFlashcardCountAchievements } from '@/lib/achievements';
import { useHaptic } from '@/hooks/useHaptic';
import { OfflineCache } from '@/lib/offlineCache';
import { getSubjectTheme } from '@/lib/subjectColors';
import type { Flashcard } from '@/types';
import { indexUserItem } from '@/lib/userContentIndex';
import { getFeatureTheme } from '@/lib/featureTheme';

type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

function sm2(card: Flashcard, rating: ReviewRating): Partial<Flashcard> {
  const q  = { again: 0, hard: 1, good: 3, easy: 5 }[rating];
  const ef = Math.max(1.3, card.ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  const reps = rating === 'again' ? 0 : card.repetitions + 1;
  const interval = reps === 0 ? 1 : reps === 1 ? 6 : Math.round(card.interval * ef);
  const next = new Date(); next.setDate(next.getDate() + interval);
  return { ease_factor: ef, repetitions: reps, interval, next_review: next.toISOString() };
}

const ratingConfig = {
  again: { label: 'Again', color: '#F87171', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.3)',    days: '<1d' },
  hard:  { label: 'Hard',  color: '#FBBF24', bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.3)',   days: '3d'  },
  good:  { label: 'Good',  color: '#34D399', bg: 'rgba(16,185,129,0.1)',   border: 'rgba(16,185,129,0.3)',   days: '7d'  },
  easy:  { label: 'Easy',  color: '#818CF8', bg: 'rgba(91,106,245,0.1)',   border: 'rgba(91,106,245,0.3)',   days: '14d' },
};

export default function FlashcardPage() {
  const { profile }       = useAuth();
  const haptic            = useHaptic();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [view, setView]   = useState<'menu' | 'review' | 'create' | 'done' | 'empty'>('menu');
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack]   = useState('');
  const [subject, setSubject]   = useState('');
  const [generating, setGenerating]   = useState(false);
  const [loadingCards, setLoadingCards] = useState(false);
  const [loadError, setLoadError]       = useState('');
  const [aiTopic, setAiTopic]   = useState('');
  const [aiError, setAiError]   = useState('');
  const [undoStack, setUndoStack] = useState<Array<{
    cardIdx: number;
    prevValues: { ease_factor: number; repetitions: number; interval: number; next_review: string };
  }>>([]);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(undoTimerRef.current), []);

  async function loadCards() {
    if (!profile) return;
    setLoadError('');
    setLoadingCards(true);
    setIsOfflineMode(false);
    try {
      const { data, error } = await supabase
        .from('flashcards').select('*').eq('user_id', profile.id)
        .lte('next_review', new Date().toISOString()).order('next_review').limit(20);
      if (error) throw new Error(error.message);
      const loaded = (data as Flashcard[]) ?? [];
      // Fetch all cards too (for cache — we cache the due subset)
      OfflineCache.cacheFlashcardDeck({
        id: profile.id,
        subject: 'all',
        topic: 'due',
        cards: loaded.map(c => ({ front: c.front, back: c.back, due_at: c.next_review })),
      }).catch(() => {});
      setCards(loaded);
      setCurrent(0); setFlipped(false);
      setView(loaded.length > 0 ? 'review' : 'empty');
    } catch {
      // Network failure — try offline cache
      const cached = await OfflineCache.getFlashcardDeck('all');
      if (cached && cached.cards.length > 0) {
        const offlineCards = cached.cards.map((c, i) => ({
          id: `offline_${i}`,
          user_id: profile.id,
          front: c.front,
          back: c.back,
          subject: '',
          topic: '',
          ease_factor: 2.5,
          interval: 1,
          repetitions: 0,
          next_review: c.due_at,
        } as Flashcard));
        setCards(offlineCards);
        setCurrent(0); setFlipped(false);
        setIsOfflineMode(true);
        setView('review');
      } else {
        setLoadError('No connection. No cached cards available.');
      }
    } finally {
      setLoadingCards(false);
    }
  }

  async function handleRating(rating: ReviewRating) {
    if (!profile || !cards[current]) return;
    if (isOfflineMode) return;
    // Haptic tier matches rating difficulty
    if (rating === 'easy') haptic.success();
    else if (rating === 'good') haptic.medium();
    else haptic.light();
    const prevValues = {
      ease_factor: cards[current].ease_factor,
      repetitions: cards[current].repetitions,
      interval:    cards[current].interval,
      next_review: cards[current].next_review,
    };
    const { error } = await supabase
      .from('flashcards').update(sm2(cards[current], rating)).eq('id', cards[current].id);
    if (error) { console.error('[FlashcardPage] handleRating error:', error.message); return; }
    // 5-second undo window — stack up to 5 entries
    clearTimeout(undoTimerRef.current);
    setUndoStack(s => [...s.slice(-4), { cardIdx: current, prevValues }]);
    undoTimerRef.current = setTimeout(() => setUndoStack([]), 5000);
    if (current + 1 >= cards.length) {
      track('flashcard_session_complete', { cards_reviewed: cards.length });
      const unlocked = await loadUnlockedIds(profile.id);
      await checkFlashcardCountAchievements(profile.id, unlocked);
      setView('done'); return;
    }
    setFlipped(false);
    setTimeout(() => setCurrent(c => c + 1), 150);
  }

  async function undoRating() {
    if (undoStack.length === 0 || !profile) return;
    clearTimeout(undoTimerRef.current);
    const last = undoStack[undoStack.length - 1];
    await supabase.from('flashcards').update(last.prevValues).eq('id', cards[last.cardIdx].id);
    setCurrent(last.cardIdx);
    setFlipped(false);
    const newStack = undoStack.slice(0, -1);
    setUndoStack(newStack);
    if (newStack.length > 0) {
      undoTimerRef.current = setTimeout(() => setUndoStack([]), 5000);
    }
  }

  async function saveCard() {
    if (!profile || !newFront.trim() || !newBack.trim()) return;
    const { data: fcData, error } = await supabase.from('flashcards').insert({
      user_id: profile.id, front: newFront.trim(), back: newBack.trim(),
      subject, topic: '', ease_factor: 2.5, interval: 1, repetitions: 0,
      next_review: new Date().toISOString(),
    }).select('id').single();
    if (error) { console.error('[FlashcardPage] saveCard error:', error.message); return; }
    if (fcData?.id) indexUserItem('flashcard', fcData.id).catch(() => {});
    setNewFront(''); setNewBack(''); setView('menu');
  }

  async function generateWithAI() {
    if (!profile || !aiTopic.trim()) return;
    setGenerating(true); setAiError('');
    try {
      const parsed = await geminiJSON<{ front: string; back: string }[]>(
        `Generate 5 flashcards for: "${aiTopic}". Return ONLY valid JSON array: [{"front":"question","back":"answer"}]. No markdown.`
      );
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('No cards were generated. Please try a different topic.');
      const { data: aiCards, error } = await supabase.from('flashcards').insert(parsed.map(c => ({
        user_id: profile.id, front: c.front, back: c.back,
        subject: aiTopic, topic: aiTopic, ease_factor: 2.5,
        interval: 1, repetitions: 0, next_review: new Date().toISOString(),
      }))).select('id');
      if (error) throw new Error('Could not save cards. Please try again.');
      (aiCards ?? []).forEach(fc => indexUserItem('flashcard', fc.id).catch(() => {}));
      track('ai_flashcards_generated', { topic: aiTopic, count: parsed.length, source: 'ai_generate' });
      setAiTopic(''); setView('menu');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Generation failed. Please try again.');
    } finally { setGenerating(false); }
  }

  const card = cards[current];
  const subTheme = getSubjectTheme(card?.subject ?? subject ?? '');
  const ft = getFeatureTheme('flashcards');

  return (
    <div className="h-full native-scroll px-4 pt-5 pb-nav"
      data-feature="flashcards"
      style={{ background: 'transparent', backgroundImage: ft.meshGradient, backgroundAttachment: 'fixed' }}>
      <AnimatePresence mode="wait">

        {/* ── MENU ── */}
        {view === 'menu' && (
          <motion.div key="menu" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5">
            <div className="page-hero flex items-center gap-3 -mx-4 px-4 pt-2 pb-4 mb-1 rounded-b-3xl">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: ft.gradient, boxShadow: `0 4px 16px ${ft.glowRgba}` }}>
                <BookOpen size={20} className="text-white" />
              </div>
              <div>
                <p className="text-eyebrow">Spaced Repetition</p>
                <h1 className="text-display">Flashcards</h1>
              </div>
            </div>
            {loadError && (
              <div className="rounded-2xl px-4 py-3" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                <p className="text-sm" style={{ color: '#F87171' }}>{loadError}</p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <Button size="lg" onClick={loadCards} disabled={loadingCards} className="w-full">
                {loadingCards
                  ? <><Loader2 size={18} className="animate-spin" />Loading cards…</>
                  : <><BookOpen size={18} />Review Due Cards</>}
              </Button>
              <Button size="lg" variant="secondary" onClick={() => setView('create')} className="w-full"><Plus size={18} />Create Card</Button>

              {/* AI Generate */}
              <div className="card-l1 rounded-3xl p-4 flex flex-col gap-3">
                <p className="text-sm font-semibold text-white flex items-center gap-2">
                  <Sparkles size={16} className="text-primary" /> Generate with AI
                </p>
                <input type="text" placeholder="Topic (e.g. Photosynthesis)"
                  value={aiTopic} onChange={e => { setAiTopic(e.target.value); setAiError(''); }}
                  className="rounded-2xl px-4 h-11 w-full text-sm outline-none text-white placeholder:text-white/30"
                  style={{ background: 'var(--ink-050)', border: '1px solid var(--ink-080)', WebkitUserSelect: 'text', userSelect: 'text' }} />
                {aiError && (
                  <div className="rounded-2xl px-3 py-2" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                    <p className="text-xs" style={{ color: '#F87171' }}>{aiError}</p>
                  </div>
                )}
                <Button onClick={generateWithAI} disabled={generating || !aiTopic.trim()} className="w-full">
                  {generating ? 'Generating…' : 'Generate 5 Cards'}
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── REVIEW ── */}
        {view === 'review' && card && (
          <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full gap-4">
            {isOfflineMode && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-medium"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#FBBF24' }}>
                <WifiOff size={14} />
                Offline mode — ratings disabled until reconnected
              </div>
            )}
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setView('menu')}>
                <ChevronLeft size={18} />Back
              </Button>
              <div className="flex items-center gap-2">
                <div className="h-1.5 rounded-full overflow-hidden bg-secondary w-32">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${((current + 1) / cards.length) * 100}%`, background: `linear-gradient(135deg,${subTheme.accent},${subTheme.text})` }} />
                </div>
                <span className="text-xs text-muted-foreground font-medium">{current + 1}/{cards.length}</span>
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center" onClick={() => { haptic.light(); setFlipped(f => !f); }}>
              <motion.div className="w-full relative" style={{ perspective: 1000 }}>
                <motion.div className="w-full" style={{ transformStyle: 'preserve-3d' }}
                  animate={{ rotateY: flipped ? 180 : 0 }} transition={{ duration: 0.4 }}>
                  {/* Front */}
                  <div className="w-full rounded-3xl min-h-[260px] flex items-center justify-center p-6"
                    style={{
                      background: 'var(--v2-card)',
                      border: `1.5px solid rgba(${subTheme.accentRgb},0.3)`,
                      backfaceVisibility: 'hidden',
                    }}>
                    <div className="text-center w-full">
                      <span className="inline-block text-xs font-extrabold uppercase tracking-widest px-3 py-1 rounded-full mb-4"
                        style={{ background: `rgba(${subTheme.accentRgb},0.15)`, color: subTheme.accent }}>Question</span>
                      <div className="overflow-y-auto max-h-[180px]">
                        <p className="font-heading text-lg font-bold leading-snug" style={{ color: 'var(--v2-text-1)' }}>{card.front}</p>
                      </div>
                      <p className="text-xs mt-5 flex items-center justify-center gap-1.5" style={{ color: 'var(--v2-text-4)' }}>
                        Tap to reveal answer
                      </p>
                    </div>
                  </div>
                  {/* Back */}
                  <div className="w-full rounded-3xl min-h-[260px] flex items-center justify-center p-6 absolute inset-0"
                    style={{
                      background: 'var(--v2-card)',
                      border: `1.5px solid rgba(${subTheme.accentRgb},0.45)`,
                      backfaceVisibility: 'hidden',
                      transform: 'rotateY(180deg)',
                    }}>
                    <div className="text-center w-full">
                      <span className="inline-block text-xs font-extrabold uppercase tracking-widest px-3 py-1 rounded-full mb-4"
                        style={{ background: `rgba(${subTheme.accentRgb},0.20)`, color: subTheme.accent }}>Answer</span>
                      <div className="overflow-y-auto max-h-[180px]">
                        <p className="font-heading text-lg font-bold leading-snug" style={{ color: 'var(--v2-text-1)' }}>{card.back}</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            </div>

            {flipped && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-4 gap-2">
                {isOfflineMode ? (
                  <p className="col-span-4 text-center text-xs text-muted-foreground py-2">Reconnect to rate cards</p>
                ) : (Object.entries(ratingConfig) as [ReviewRating, typeof ratingConfig.again][]).map(([r, cfg]) => (
                  <button key={r} onClick={() => handleRating(r)}
                    className="flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-all active:scale-95 border"
                    style={{ background: cfg.bg, borderColor: cfg.border }}>
                    <span className="text-sm font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
                    <span className="text-xs text-muted-foreground">{cfg.days}</span>
                  </button>
                ))}
              </motion.div>
            )}

            {!flipped && (
              <div className="flex gap-3">
                <Button variant="outline" size="sm" disabled={current === 0} aria-label="Previous card"
                  onClick={() => { setCurrent(c => c - 1); setFlipped(false); }}>
                  <ChevronLeft size={16} />
                </Button>
                <Button variant="secondary" className="flex-1" onClick={() => { haptic.light(); setFlipped(true); }}>Show Answer</Button>
                <Button variant="outline" size="sm" aria-label="Next card"
                  onClick={() => { setCurrent(c => c + 1); setFlipped(false); }}>
                  <ChevronRight size={16} />
                </Button>
              </div>
            )}

            {/* ── Undo banner ── */}
            <AnimatePresence>
              {undoStack.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.18 }}
                  className="flex items-center justify-between px-4 py-2.5 rounded-2xl"
                  style={{ background: 'rgba(91,106,245,0.08)', border: '1.5px solid rgba(91,106,245,0.18)' }}>
                  <span className="text-xs text-muted-foreground">
                    Rating saved{undoStack.length > 1 ? ` · ${undoStack.length} in stack` : ''}
                  </span>
                  <button onClick={undoRating}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl active:scale-95 transition-all"
                    style={{ background: 'rgba(91,106,245,0.15)', color: '#5B6AF5' }}>
                    <Undo2 size={13} />
                    Undo
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Up Next preview ── */}
            {current + 1 < cards.length && (
              <div className="rounded-2xl px-3 py-2.5"
                style={{ background: 'var(--ink-045)', border: '1px solid var(--ink-060)' }}>
                <p className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--ink-500)' }}>Up Next</p>
                <div className="flex flex-col gap-1">
                  {cards.slice(current + 1, current + 3).map((c, i) => (
                    <div key={c.id} className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--ink-500)' }}>{i + 1}.</span>
                      <p className="text-xs truncate" style={{ color: 'var(--ink-700)' }}>{c.front}</p>
                    </div>
                  ))}
                  {cards.length - current - 1 > 2 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      +{cards.length - current - 3} more
                    </p>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ── CREATE ── */}
        {view === 'create' && (
          <motion.div key="create" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setView('menu')}><ChevronLeft size={18} />Back</Button>
              <h2 className="font-heading font-bold text-white">New Flashcard</h2>
            </div>
            {[
              { placeholder: 'Subject', value: subject, setter: setSubject },
              { placeholder: 'Front — Question or term', value: newFront, setter: setNewFront },
              { placeholder: 'Back — Answer or definition', value: newBack, setter: setNewBack },
            ].map(({ placeholder, value, setter }) => (
              <input key={placeholder} placeholder={placeholder} value={value}
                onChange={e => setter(e.target.value)}
                className="rounded-2xl px-4 h-12 text-white placeholder:text-white/30 text-sm outline-none w-full"
                style={{ background: 'var(--ink-055)', border: '1px solid var(--ink-080)', WebkitUserSelect: 'text', userSelect: 'text' }} />
            ))}
            <Button size="lg" onClick={saveCard} disabled={!newFront.trim() || !newBack.trim()} className="w-full">
              Save Flashcard
            </Button>
          </motion.div>
        )}

        {/* ── EMPTY — no cards due ── */}
        {view === 'empty' && (
          <motion.div key="empty" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <BookOpen size={56} className="text-white/25" strokeWidth={1.4} />
            <div>
              <h2 className="text-display">Nothing due today</h2>
              <p className="mt-1" style={{ color: 'var(--ink-400)' }}>All cards are reviewed. Come back tomorrow.</p>
            </div>
            <Button size="lg" onClick={() => setView('menu')} className="w-full">Back to Menu</Button>
          </motion.div>
        )}

        {/* ── DONE — reviewed all cards in session ── */}
        {view === 'done' && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)', boxShadow: '0 0 32px rgba(91,106,245,0.4)' }}>
              <Sparkles size={36} className="text-white" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-display">All caught up!</h2>
              <p className="mt-1" style={{ color: 'var(--ink-400)' }}>Come back tomorrow for more.</p>
            </div>
            <Button size="lg" onClick={() => setView('menu')} className="w-full">Back to Menu</Button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
