import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Loader2, Zap, Heart, Shield, ChevronDown } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { geminiJSON } from '@/lib/gemini';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BossQuestion {
  question:    string;
  options:     string[];
  correctIndex: number;
  explanation: string;
  taunt:       string;
}

interface Boss {
  name:        string;
  emoji:       string;
  personality: string;
  intro:       string;
  deathLine:   string;
  color:       string;
}

type GamePhase = 'setup' | 'loading' | 'fight' | 'victory' | 'defeat';

// ── Boss catalogue ────────────────────────────────────────────────────────────

const BOSS_CATALOGUE: Boss[] = [
  { name: 'Professor Paradox',  emoji: '🧙‍♂️', personality: 'smug', intro: 'You dare challenge the laws of physics? Adorable.', deathLine: 'Impossible... my formulas were perfect!', color: '#5B6AF5' },
  { name: 'Lady Entropy',       emoji: '💀', personality: 'cold',  intro: 'Everything tends toward disorder. Including your marks.', deathLine: 'My disorder... could not be contained...', color: '#8B5CF6' },
  { name: 'Baron Valence',      emoji: '⚗️', personality: 'pompous', intro: 'My chemical bonds are unbreakable! Can you say the same?', deathLine: 'My bonds... shattered by a student?!', color: '#10B981' },
  { name: 'The Integral',       emoji: '∫',  personality: 'cold',  intro: 'I have infinite area under my curve. You have zero chance.', deathLine: 'Converging to zero... defeated...', color: '#F59E0B' },
  { name: 'Quantum Specter',    emoji: '👻', personality: 'eerie', intro: 'I exist in superposition — right and wrong simultaneously. Can you collapse my wavefunction?', deathLine: 'Decoherence... you observed my weakness...', color: '#EC4899' },
];

const SUBJECTS = ['Physics', 'Chemistry', 'Maths', 'Biology'];

// ── HP bar ────────────────────────────────────────────────────────────────────

function HpBar({ current, max, color, label }: { current: number; max: number; color: string; label: string }) {
  const pct = Math.max(0, (current / max) * 100);
  return (
    <div className="flex-1">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-bold text-white/60">{label}</span>
        <span className="text-xs font-bold tabular-nums" style={{ color }}>{current}/{max}</span>
      </div>
      <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <motion.div
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 200, damping: 24 }}
          className="h-full rounded-full"
          style={{ background: color, boxShadow: `0 0 10px ${color}88` }}
        />
      </div>
    </div>
  );
}

// ── Boss character ────────────────────────────────────────────────────────────

function BossSprite({ boss, hp, maxHp, shaking }: { boss: Boss; hp: number; maxHp: number; shaking: boolean }) {
  const hpPct = hp / maxHp;
  return (
    <motion.div
      animate={shaking ? { x: [-8, 8, -6, 6, -4, 4, 0] } : {}}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center gap-2">
      <motion.div
        animate={{
          y: [0, -8, 0],
          scale: hpPct < 0.3 ? [1, 0.97, 1] : 1,
        }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        className="w-28 h-28 rounded-3xl flex items-center justify-center relative"
        style={{
          background: `radial-gradient(circle at 40% 35%, ${boss.color}44, ${boss.color}22)`,
          border: `2px solid ${boss.color}55`,
          boxShadow: `0 0 40px ${boss.color}44`,
          opacity: hpPct < 0.3 ? 0.7 : 1,
          filter: hpPct < 0.3 ? 'grayscale(0.4)' : 'none',
        }}>
        <span className="text-6xl">{boss.emoji}</span>
        {hpPct < 0.3 && (
          <motion.div
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            className="absolute inset-0 rounded-3xl"
            style={{ background: `${boss.color}22` }}
          />
        )}
      </motion.div>
      <div className="text-center">
        <p className="font-heading font-extrabold text-white text-base">{boss.name}</p>
        <p className="text-xs font-medium" style={{ color: boss.color }}>
          {hpPct > 0.6 ? '💢 Confident' : hpPct > 0.3 ? '😤 Weakening' : '😰 Critical!'}
        </p>
      </div>
    </motion.div>
  );
}

// ── Attack flash overlay ──────────────────────────────────────────────────────

function AttackFlash({ type }: { type: 'correct' | 'wrong' | null }) {
  return (
    <AnimatePresence>
      {type && (
        <motion.div
          key={type + Date.now()}
          initial={{ opacity: 0.7 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-50 pointer-events-none"
          style={{ background: type === 'correct' ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)' }}
        />
      )}
    </AnimatePresence>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function BossFightPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase]         = useState<GamePhase>('setup');
  const [subject, setSubject]     = useState('Physics');
  const [chapter, setChapter]     = useState('');
  const [boss, setBoss]           = useState<Boss>(BOSS_CATALOGUE[0]);
  const [questions, setQuestions] = useState<BossQuestion[]>([]);
  const [qIndex, setQIndex]       = useState(0);
  const [bossHp, setBossHp]       = useState(100);
  const [playerHp, setPlayerHp]   = useState(100);
  const [selected, setSelected]   = useState<number | null>(null);
  const [flash, setFlash]         = useState<'correct' | 'wrong' | null>(null);
  const [shaking, setShaking]     = useState(false);
  const [taunt, setTaunt]         = useState<string>('');
  const [xpEarned, setXpEarned]   = useState(0);
  const [startError, setStartError] = useState('');

  const BOSS_MAX_HP   = 100;
  const PLAYER_MAX_HP = 100;
  const DMG_CORRECT   = 12; // player deals to boss
  const DMG_WRONG     = 15; // boss deals to player

  // ── Question generation: edge function → Gemini local fallback → error ──
  async function startFight() {
    if (!user || !chapter.trim()) return;
    setStartError('');
    setPhase('loading');

    const b = BOSS_CATALOGUE[Math.floor(Math.random() * BOSS_CATALOGUE.length)];
    setBoss(b);

    const qs = await fetchQuestions(b, subject, chapter.trim());
    if (!qs) {
      setPhase('setup');
      setStartError('Could not generate questions. Check your connection and try again.');
      return;
    }

    setQuestions(qs);
    setQIndex(0);
    setBossHp(BOSS_MAX_HP);
    setPlayerHp(PLAYER_MAX_HP);
    setSelected(null);
    setTaunt(b.intro);
    setPhase('fight');
  }

  async function fetchQuestions(
    b: Boss, subj: string, chap: string
  ): Promise<BossQuestion[] | null> {
    // Tier 1: Supabase edge function (best quality, server-side)
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('boss-fight', {
        body: { subject: subj, chapter: chap, bossName: b.name, bossPersonality: b.personality },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      const qs: BossQuestion[] = res.data?.questions ?? [];
      if (qs.length >= 5) return qs.slice(0, 10);
    } catch { /* fall through to Tier 2 */ }

    // Tier 2: Gemini local generation (client-side, no edge function required)
    try {
      const prompt = `Generate 8 multiple-choice quiz questions for a student studying "${chap}" in ${subj}.
Each question should test genuine understanding, not just recall.
Return a JSON array — no markdown, no wrapper object — with this schema:
[{
  "question": "...",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "correctIndex": 0,
  "explanation": "One concise sentence explaining why the answer is correct.",
  "taunt": "A short dramatic taunt from a villain boss (1 sentence, 10 words max)."
}]`;
      const qs = await geminiJSON<BossQuestion[]>(prompt);
      if (Array.isArray(qs) && qs.length >= 5) return qs.slice(0, 10);
    } catch { /* fall through to null */ }

    return null;
  }

  async function handleAnswer(idx: number) {
    if (selected !== null) return;
    setSelected(idx);

    const q = questions[qIndex];
    const correct = idx === q.correctIndex;

    if (correct) {
      const newBossHp = Math.max(0, bossHp - DMG_CORRECT);
      setBossHp(newBossHp);
      setFlash('correct');
      setShaking(true);
      setTaunt(q.taunt || '...tch.');
      setTimeout(() => { setShaking(false); setFlash(null); }, 500);

      if (newBossHp <= 0) {
        // Victory!
        const xp = 50 + Math.floor(playerHp / 10) * 5;
        setXpEarned(xp);
        if (user) {
          supabase.rpc('increment_xp', { user_id: user.id, amount: xp }).then(() => {});
          supabase.from('boss_fight_sessions').insert({
            user_id: user.id, subject, chapter, boss_name: boss.name,
            result: 'victory', questions_answered: qIndex + 1,
            xp_earned: xp, player_hp_remaining: playerHp,
          }).then(() => {});
        }
        setTimeout(() => setPhase('victory'), 600);
        return;
      }
    } else {
      const newPlayerHp = Math.max(0, playerHp - DMG_WRONG);
      setPlayerHp(newPlayerHp);
      setFlash('wrong');
      setTaunt(q.taunt || 'Ha! Pathetic!');
      setTimeout(() => setFlash(null), 500);

      if (newPlayerHp <= 0) {
        if (user) {
          supabase.from('boss_fight_sessions').insert({
            user_id: user.id, subject, chapter, boss_name: boss.name,
            result: 'defeat', questions_answered: qIndex + 1,
            xp_earned: 0, player_hp_remaining: 0,
          }).then(() => {});
        }
        setTimeout(() => setPhase('defeat'), 600);
        return;
      }
    }

    // Advance to next question after showing result
    setTimeout(() => {
      const nextIdx = qIndex + 1;
      if (nextIdx >= questions.length) {
        // All questions used up — boss wins on HP
        setPhase(bossHp <= 20 ? 'victory' : 'defeat');
      } else {
        setQIndex(nextIdx);
        setSelected(null);
      }
    }, 1400);
  }

  const currentQ = questions[qIndex];

  return (
    <div className="flex flex-col h-full">
      <AttackFlash type={flash} />

      {/* ── Setup screen ── */}
      {phase === 'setup' && (
        <div className="flex flex-col h-full px-4 pt-4 pb-nav">
          <div className="flex items-center gap-3 mb-6">
            <Link to="/home"
              className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <ArrowLeft size={18} className="text-white" />
            </Link>
            <div>
              <h1 className="font-heading font-extrabold text-white text-lg">👾 Chapter Boss Fight</h1>
              <p className="text-xs text-white/40">Defeat the AI villain. Earn XP.</p>
            </div>
          </div>

          {/* Boss preview */}
          <div className="flex gap-3 mb-6 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {BOSS_CATALOGUE.map((b, i) => (
              <motion.div key={i} whileTap={{ scale: 0.93 }}
                onClick={() => setBoss(b)}
                className="shrink-0 flex flex-col items-center gap-2 p-3 rounded-2xl cursor-pointer"
                style={{
                  background: boss.name === b.name ? `${b.color}22` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${boss.name === b.name ? b.color : 'rgba(255,255,255,0.07)'}`,
                  minWidth: 80,
                }}>
                <span className="text-3xl">{b.emoji}</span>
                <p className="text-[10px] font-bold text-center text-white/70 leading-tight">{b.name.split(' ')[0]}</p>
              </motion.div>
            ))}
          </div>

          {/* Boss info */}
          <div className="p-4 rounded-2xl mb-5"
            style={{ background: `${boss.color}15`, border: `1px solid ${boss.color}33` }}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">{boss.emoji}</span>
              <div>
                <p className="font-bold text-white">{boss.name}</p>
                <p className="text-xs" style={{ color: boss.color }}>HP: {BOSS_MAX_HP} · 10 questions</p>
              </div>
            </div>
            <p className="text-sm italic text-white/60">"{boss.intro}"</p>
          </div>

          {/* Subject select */}
          <div className="mb-4">
            <p className="text-xs font-bold text-white/50 mb-2 uppercase tracking-wider">Subject</p>
            <div className="flex gap-2 flex-wrap">
              {SUBJECTS.map(s => (
                <button key={s} onClick={() => setSubject(s)}
                  className="px-3 py-2 rounded-xl text-sm font-bold transition-all active:scale-95"
                  style={{
                    background: subject === s ? 'rgba(91,106,245,0.2)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${subject === s ? 'rgba(91,106,245,0.5)' : 'rgba(255,255,255,0.08)'}`,
                    color: subject === s ? '#A0AEFF' : 'rgba(255,255,255,0.5)',
                  }}>{s}</button>
              ))}
            </div>
          </div>

          {/* Chapter input */}
          <div className="mb-6">
            <p className="text-xs font-bold text-white/50 mb-2 uppercase tracking-wider">Chapter / Topic</p>
            <input
              type="text"
              placeholder={`e.g. ${subject === 'Physics' ? 'Thermodynamics' : subject === 'Chemistry' ? 'Chemical Bonding' : subject === 'Maths' ? 'Differential Equations' : 'Cell Division'}`}
              value={chapter}
              onChange={e => setChapter(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && chapter.trim() && startFight()}
              className="w-full px-4 py-3 rounded-2xl text-white text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', caretColor: '#5B6AF5' }}
            />
          </div>

          {startError && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-medium"
              style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#F87171' }}>
              <span>⚠</span>{startError}
            </div>
          )}

          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => { setStartError(''); startFight(); }}
            disabled={!chapter.trim()}
            className="w-full py-4 rounded-2xl font-heading font-extrabold text-white text-lg disabled:opacity-40"
            style={{ background: `linear-gradient(135deg, ${boss.color}, ${boss.color}cc)`, boxShadow: `0 8px 32px ${boss.color}55` }}>
            ⚔️ Start Fight
          </motion.button>
        </div>
      )}

      {/* ── Loading ── */}
      {phase === 'loading' && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
            <span className="text-5xl">{boss.emoji}</span>
          </motion.div>
          <p className="text-white font-bold">Summoning {boss.name}…</p>
          <p className="text-white/40 text-sm">Generating battle questions…</p>
        </div>
      )}

      {/* ── Fight screen ── */}
      {phase === 'fight' && currentQ && (
        <div className="flex flex-col h-full px-4 pt-4 pb-nav">
          {/* HP bars */}
          <div className="flex gap-4 items-center mb-4">
            <HpBar current={playerHp} max={PLAYER_MAX_HP} color="#10B981" label="You" />
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <Zap size={14} color="#F59E0B" />
              <span className="text-[10px] text-white/40 font-bold">{qIndex + 1}/{questions.length}</span>
            </div>
            <HpBar current={bossHp} max={BOSS_MAX_HP} color={boss.color} label={boss.name.split(' ')[0]} />
          </div>

          {/* Boss + taunt */}
          <div className="flex flex-col items-center mb-4">
            <BossSprite boss={boss} hp={bossHp} maxHp={BOSS_MAX_HP} shaking={shaking} />
            <AnimatePresence mode="wait">
              <motion.div
                key={taunt}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-3 px-4 py-2 rounded-2xl max-w-[260px] text-center"
                style={{ background: `${boss.color}18`, border: `1px solid ${boss.color}33` }}>
                <p className="text-sm italic" style={{ color: `${boss.color}dd` }}>"{taunt}"</p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Question */}
          <div className="p-4 rounded-2xl mb-4 flex-1"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="text-sm font-bold text-white leading-relaxed mb-4">{currentQ.question}</p>

            <div className="flex flex-col gap-2">
              {currentQ.options.map((opt, i) => {
                const isSelected  = selected === i;
                const isCorrect   = i === currentQ.correctIndex;
                const showResult  = selected !== null;
                const optColor    = showResult
                  ? isCorrect ? '#10B981' : isSelected ? '#EF4444' : 'rgba(255,255,255,0.3)'
                  : 'rgba(255,255,255,0.7)';

                return (
                  <motion.button
                    key={i}
                    whileTap={selected === null ? { scale: 0.98 } : {}}
                    onClick={() => handleAnswer(i)}
                    disabled={selected !== null}
                    className="px-4 py-3 rounded-xl text-left text-sm font-medium transition-all"
                    style={{
                      background: showResult
                        ? isCorrect ? 'rgba(16,185,129,0.15)' : isSelected ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.03)'
                        : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${showResult
                        ? isCorrect ? 'rgba(16,185,129,0.4)' : isSelected ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.06)'
                        : 'rgba(255,255,255,0.1)'}`,
                      color: optColor,
                    }}>
                    <span className="font-bold mr-2">{['A', 'B', 'C', 'D'][i]}.</span>
                    {opt}
                  </motion.button>
                );
              })}
            </div>

            {/* Explanation */}
            <AnimatePresence>
              {selected !== null && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-3 p-3 rounded-xl overflow-hidden"
                  style={{ background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.2)' }}>
                  <p className="text-xs text-white/70 leading-relaxed">{currentQ.explanation}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* ── Victory screen ── */}
      {phase === 'victory' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center flex-1 px-6 gap-6 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.2 }}>
            <span className="text-8xl">🏆</span>
          </motion.div>
          <div>
            <h2 className="font-heading font-extrabold text-white text-3xl mb-2">Victory!</h2>
            <p className="text-white/60 text-sm italic">"{boss.deathLine}"</p>
          </div>
          <div className="p-4 rounded-2xl w-full"
            style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)' }}>
            <p className="text-white/60 text-sm mb-1">XP Earned</p>
            <p className="text-4xl font-black" style={{ color: '#10B981' }}>+{xpEarned} XP</p>
            <p className="text-white/40 text-xs mt-1">HP remaining bonus included</p>
          </div>
          <div className="flex gap-3 w-full">
            <button onClick={() => setPhase('setup')}
              className="flex-1 py-3 rounded-2xl font-bold text-sm"
              style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)' }}>
              Fight Again
            </button>
            <button onClick={() => navigate('/home')}
              className="flex-1 py-3 rounded-2xl font-bold text-sm text-white"
              style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
              Home
            </button>
          </div>
        </motion.div>
      )}

      {/* ── Defeat screen ── */}
      {phase === 'defeat' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center flex-1 px-6 gap-6 text-center">
          <span className="text-8xl">💀</span>
          <div>
            <h2 className="font-heading font-extrabold text-white text-3xl mb-2">Defeated</h2>
            <p className="text-white/50 text-sm">Keep training. You'll get {boss.name} next time.</p>
          </div>
          <div className="p-4 rounded-2xl w-full"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <p className="text-white/60 text-sm mb-1">Questions answered before defeat</p>
            <p className="text-3xl font-black text-white">{qIndex}</p>
            <p className="text-white/40 text-xs mt-1">Study {subject} — {chapter} and try again</p>
          </div>
          <div className="flex gap-3 w-full">
            <button onClick={() => setPhase('setup')}
              className="flex-1 py-3 rounded-2xl font-bold text-sm"
              style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)' }}>
              Retry
            </button>
            <button onClick={() => navigate('/chat')}
              className="flex-1 py-3 rounded-2xl font-bold text-sm text-white"
              style={{ background: 'linear-gradient(135deg, #EF4444, #F59E0B)' }}>
              Study with Novo
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
