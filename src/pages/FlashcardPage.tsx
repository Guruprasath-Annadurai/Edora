import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, ChevronLeft, ChevronRight, Sparkles, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { Flashcard } from '@/types';

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
  again: { label: 'Again', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA', days: '<1d' },
  hard:  { label: 'Hard',  color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A', days: '3d'  },
  good:  { label: 'Good',  color: '#10B981', bg: '#F0FDF4', border: '#BBF7D0', days: '7d'  },
  easy:  { label: 'Easy',  color: '#5B6AF5', bg: '#EEF1FF', border: '#C7D2FE', days: '14d' },
};

export default function FlashcardPage() {
  const { profile }       = useAuth();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [view, setView]   = useState<'menu' | 'review' | 'create' | 'done'>('menu');
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack]   = useState('');
  const [subject, setSubject]   = useState('');
  const [generating, setGenerating] = useState(false);
  const [aiTopic, setAiTopic]   = useState('');

  async function loadCards() {
    if (!profile) return;
    const { data } = await supabase
      .from('flashcards').select('*').eq('user_id', profile.id)
      .lte('next_review', new Date().toISOString()).order('next_review').limit(20);
    setCards((data as Flashcard[]) ?? []);
    setCurrent(0); setFlipped(false); setView('review');
  }

  async function handleRating(rating: ReviewRating) {
    if (!cards[current]) return;
    await supabase.from('flashcards').update(sm2(cards[current], rating)).eq('id', cards[current].id);
    if (current + 1 >= cards.length) { setView('done'); return; }
    setFlipped(false);
    setTimeout(() => setCurrent(c => c + 1), 150);
  }

  async function saveCard() {
    if (!profile || !newFront.trim() || !newBack.trim()) return;
    await supabase.from('flashcards').insert({
      user_id: profile.id, front: newFront.trim(), back: newBack.trim(),
      subject, topic: '', ease_factor: 2.5, interval: 1, repetitions: 0,
      next_review: new Date().toISOString(),
    });
    setNewFront(''); setNewBack(''); setView('menu');
  }

  async function generateWithAI() {
    if (!aiTopic.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`,
        {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `Generate 5 flashcards for: "${aiTopic}". Return ONLY valid JSON array: [{"front":"question","back":"answer"}]. No markdown.` }] }],
          }),
        }
      );
      const data   = await res.json();
      const text   = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) as { front: string; back: string }[];
      if (profile && parsed.length) {
        await supabase.from('flashcards').insert(parsed.map(c => ({
          user_id: profile.id, front: c.front, back: c.back,
          subject: aiTopic, topic: aiTopic, ease_factor: 2.5,
          interval: 1, repetitions: 0, next_review: new Date().toISOString(),
        })));
      }
      setAiTopic(''); setView('menu');
    } catch { /* ignore */ } finally { setGenerating(false); }
  }

  const card = cards[current];

  return (
    <div className="h-full native-scroll px-4 py-4 bg-background">
      <AnimatePresence mode="wait">

        {/* ── MENU ── */}
        {view === 'menu' && (
          <motion.div key="menu" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5">
            <div>
              <h1 className="font-heading text-2xl font-bold text-foreground">Flashcards</h1>
              <p className="text-muted-foreground text-sm mt-0.5">SM-2 spaced repetition</p>
            </div>
            <div className="flex flex-col gap-3">
              <Button size="lg" onClick={loadCards} className="w-full"><BookOpen size={18} />Review Due Cards</Button>
              <Button size="lg" variant="secondary" onClick={() => setView('create')} className="w-full"><Plus size={18} />Create Card</Button>

              {/* AI Generate */}
              <div className="bg-white border border-border rounded-3xl p-4 flex flex-col gap-3 shadow-card">
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Sparkles size={16} className="text-primary" /> Generate with AI
                </p>
                <input type="text" placeholder="Topic (e.g. Photosynthesis)"
                  value={aiTopic} onChange={e => setAiTopic(e.target.value)}
                  className="bg-secondary border border-border rounded-2xl px-4 h-11 w-full text-foreground placeholder:text-muted-foreground text-sm outline-none"
                  style={{ WebkitUserSelect: 'text', userSelect: 'text' }} />
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
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setView('menu')}>
                <ChevronLeft size={18} />Back
              </Button>
              <div className="flex items-center gap-2">
                <div className="h-1.5 rounded-full overflow-hidden bg-secondary w-32">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${((current + 1) / cards.length) * 100}%`, background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }} />
                </div>
                <span className="text-xs text-muted-foreground font-medium">{current + 1}/{cards.length}</span>
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center" onClick={() => setFlipped(f => !f)}>
              <motion.div className="w-full relative" style={{ perspective: 1000 }}>
                <motion.div className="w-full" style={{ transformStyle: 'preserve-3d' }}
                  animate={{ rotateY: flipped ? 180 : 0 }} transition={{ duration: 0.4 }}>
                  {/* Front */}
                  <div className="bg-white border border-border rounded-3xl w-full min-h-[260px] flex items-center justify-center p-6 shadow-card-lg"
                    style={{ backfaceVisibility: 'hidden' }}>
                    <div className="text-center">
                      <span className="text-xs text-primary font-semibold uppercase tracking-wide mb-4 block">Question</span>
                      <p className="font-heading text-lg font-semibold text-foreground leading-snug">{card.front}</p>
                      <p className="text-xs text-muted-foreground mt-4">Tap to reveal answer</p>
                    </div>
                  </div>
                  {/* Back */}
                  <div className="bg-secondary border border-primary/20 rounded-3xl w-full min-h-[260px] flex items-center justify-center p-6 absolute inset-0 shadow-card-lg"
                    style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                    <div className="text-center">
                      <span className="text-xs text-green-500 font-semibold uppercase tracking-wide mb-4 block">Answer</span>
                      <p className="font-heading text-lg font-semibold text-foreground leading-snug">{card.back}</p>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            </div>

            {flipped && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-4 gap-2">
                {(Object.entries(ratingConfig) as [ReviewRating, typeof ratingConfig.again][]).map(([r, cfg]) => (
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
                <Button variant="outline" size="sm" disabled={current === 0}
                  onClick={() => { setCurrent(c => c - 1); setFlipped(false); }}>
                  <ChevronLeft size={16} />
                </Button>
                <Button variant="secondary" className="flex-1" onClick={() => setFlipped(true)}>Show Answer</Button>
                <Button variant="outline" size="sm"
                  onClick={() => { setCurrent(c => c + 1); setFlipped(false); }}>
                  <ChevronRight size={16} />
                </Button>
              </div>
            )}
          </motion.div>
        )}

        {/* ── CREATE ── */}
        {view === 'create' && (
          <motion.div key="create" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setView('menu')}><ChevronLeft size={18} />Back</Button>
              <h2 className="font-heading font-bold text-foreground">New Flashcard</h2>
            </div>
            {[
              { placeholder: 'Subject', value: subject, setter: setSubject },
              { placeholder: 'Front — Question or term', value: newFront, setter: setNewFront },
              { placeholder: 'Back — Answer or definition', value: newBack, setter: setNewBack },
            ].map(({ placeholder, value, setter }) => (
              <input key={placeholder} placeholder={placeholder} value={value}
                onChange={e => setter(e.target.value)}
                className="bg-white border border-border rounded-2xl px-4 h-12 text-foreground placeholder:text-muted-foreground text-sm outline-none w-full shadow-card"
                style={{ WebkitUserSelect: 'text', userSelect: 'text' }} />
            ))}
            <Button size="lg" onClick={saveCard} disabled={!newFront.trim() || !newBack.trim()} className="w-full">
              Save Flashcard
            </Button>
          </motion.div>
        )}

        {/* ── DONE ── */}
        {view === 'done' && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div className="text-6xl">🎉</div>
            <div>
              <h2 className="font-heading text-2xl font-bold text-foreground">All caught up!</h2>
              <p className="text-muted-foreground mt-1">Come back tomorrow for more.</p>
            </div>
            <Button size="lg" onClick={() => setView('menu')} className="w-full">Back to Menu</Button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
