// ─────────────────────────────────────────────────────────────────────────────
// OnboardingTour — 3-step post-signup feature walkthrough with Novo as guide
// Fires once after the user's first arrival on HomePage.
// Stored: localStorage key `edora_tour_done_<userId>`
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flame, Zap, CalendarClock, Target,
  CheckCircle2, ChevronRight, X,
  Bot, Sparkles,
} from 'lucide-react';
import { NovoAvatar } from '@/components/novo/NovoAvatar';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

async function haptic() {
  try { await Haptics.impact({ style: ImpactStyle.Light }); } catch { /* web */ }
}

// ── Step definitions ──────────────────────────────────────────────────────────
const STEPS = [
  {
    id: 'home',
    novoState: 'celebrating' as const,
    heading: 'Your personalised dashboard',
    body: "I've built your home around your exam, study history, and weak topics. Everything you need — in one glance.",
    illustration: 'home' as const,
    cta: 'Show me more',
  },
  {
    id: 'novo',
    novoState: 'talking' as const,
    heading: "I'm here 24/7",
    body: 'Tap my icon in the nav bar to chat. Ask me to explain a concept, quiz you, or work through a problem step by step.',
    illustration: 'chat' as const,
    cta: 'Got it',
  },
  {
    id: 'courses',
    novoState: 'idle' as const,
    heading: 'NCERT — chapter by chapter',
    body: 'Full NCERT lessons with key points, exam tips, and XP rewards. Every chapter you complete unlocks the next.',
    illustration: 'course' as const,
    cta: "Let's go",
  },
] as const;

// ── Illustrations ─────────────────────────────────────────────────────────────

function HomeIllustration() {
  return (
    <div className="flex flex-col gap-2.5">
      {/* Exam countdown mock */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="flex items-center gap-3 rounded-2xl px-3.5 py-3"
        style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}
      >
        <CalendarClock size={16} style={{ color: '#FBBF24', flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <p className="ds-eyebrow" style={{ color: '#FBBF24' }}>Build Momentum</p>
          <p className="text-xs font-bold text-white">JEE Main</p>
        </div>
        <div className="text-right">
          <p className="font-heading font-extrabold text-2xl leading-none" style={{ color: '#FBBF24' }}>42</p>
          <p className="text-[9px] text-white/35">days left</p>
        </div>
      </motion.div>

      {/* Weak topic mock */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
        className="flex items-center gap-3 rounded-2xl px-3.5 py-3"
        style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.14)' }}
      >
        <Target size={14} style={{ color: '#F87171', flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white truncate">Gravitation</p>
          <p className="text-[10px] text-white/40">Physics · Needs attention</p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(248,113,113,0.14)', color: '#F87171' }}>Quiz</span>
          <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(139,92,246,0.14)', color: '#C4B5FD' }}>Chat</span>
        </div>
      </motion.div>

      {/* XP + streak row mock */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26 }}
        className="flex gap-2.5"
      >
        <div className="flex-1 flex items-center gap-2.5 rounded-2xl px-3 py-2.5"
          style={{ background: 'linear-gradient(135deg,rgba(91,106,245,0.12),rgba(139,92,246,0.08))', border: '1px solid rgba(91,106,245,0.18)' }}>
          <Zap size={13} style={{ color: '#A0AEFF' }} />
          <div>
            <p className="text-[9px] text-white/40 font-bold uppercase tracking-wider">Level 4</p>
            <p className="text-xs font-extrabold text-white">2,480 XP</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-2xl px-3 py-2.5"
          style={{ background: 'rgba(251,113,33,0.1)', border: '1px solid rgba(251,113,33,0.22)' }}>
          <Flame size={12} style={{ color: '#FB923C' }} />
          <span className="text-xs font-extrabold" style={{ color: '#FB923C' }}>12</span>
        </div>
      </motion.div>
    </div>
  );
}

function ChatIllustration() {
  return (
    <div className="flex flex-col gap-2.5">
      {/* User message bubble */}
      <motion.div
        initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
        className="self-end max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-2.5"
        style={{ background: 'linear-gradient(135deg,#5B6AF5,#7C3AED)', boxShadow: '0 4px 16px rgba(91,106,245,0.3)' }}
      >
        <p className="text-xs font-semibold text-white">Explain Newton's 3rd Law simply</p>
      </motion.div>

      {/* Novo response bubble */}
      <motion.div
        initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.28 }}
        className="self-start max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-3"
        style={{ background: 'var(--s1)', border: '1px solid var(--b1)' }}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className="w-4 h-4 rounded-full flex items-center justify-center bg-gradient-novo">
            <Bot size={9} className="text-white" />
          </div>
          <p className="ds-eyebrow" style={{ color: '#A0AEFF' }}>Novo</p>
        </div>
        <p className="text-xs text-white leading-relaxed">
          For every action there's an equal and opposite reaction.{' '}
          <span style={{ color: '#A0AEFF' }}>When you push a wall, it pushes back with the same force.</span>
        </p>
      </motion.div>

      {/* Suggestion chips */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.46 }}
        className="flex flex-wrap gap-1.5"
      >
        {['Give me an example', 'Quiz me on this'].map(chip => (
          <div key={chip}
            className="text-[10px] font-semibold px-3 py-1.5 rounded-xl"
            style={{ background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.2)', color: '#A0AEFF' }}>
            {chip}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

function CourseIllustration() {
  return (
    <div className="flex flex-col gap-2">
      {/* Subject progress card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="flex items-center gap-3 rounded-2xl px-3.5 py-3"
        style={{ background: 'rgba(196,181,253,0.08)', border: '1px solid rgba(196,181,253,0.18)' }}
      >
        <div className="icon-container icon-sm shrink-0" style={{ background: 'rgba(196,181,253,0.12)' }}>
          <span className="text-sm">⚛️</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white">Physics Class 10</p>
          <p className="text-[10px] text-white/40 mb-1.5">3 of 12 chapters done</p>
          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: '#C4B5FD' }}
              initial={{ width: '0%' }}
              animate={{ width: '25%' }}
              transition={{ delay: 0.4, duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        </div>
      </motion.div>

      {/* Lesson list */}
      {[
        { label: 'Lesson 1 — Force & Motion', done: true },
        { label: 'Lesson 2 — Laws of Motion', done: true },
        { label: 'Lesson 3 — Gravitation',    done: false, current: true },
      ].map((l, i) => (
        <motion.div
          key={l.label}
          initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.18 + i * 0.08 }}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5"
          style={{
            background: l.current ? 'rgba(91,106,245,0.08)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${l.current ? 'rgba(91,106,245,0.2)' : 'rgba(255,255,255,0.05)'}`,
          }}
        >
          <CheckCircle2 size={13} style={{ color: l.done ? '#10B981' : 'rgba(255,255,255,0.18)', flexShrink: 0 }} />
          <p className="text-xs flex-1 truncate" style={{
            color: l.done ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.85)',
            fontWeight: l.current ? 700 : 500,
          }}>
            {l.label}
          </p>
          {l.current && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0"
              style={{ background: 'rgba(91,106,245,0.15)', color: '#A0AEFF' }}>
              Next
            </span>
          )}
        </motion.div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface OnboardingTourProps {
  onDone: () => void;
}

export function OnboardingTour({ onDone }: OnboardingTourProps) {
  const [step, setStep]     = useState(0);
  const [exiting, setExiting] = useState(false);
  const totalSteps          = STEPS.length;
  const current             = STEPS[step];
  const isLast              = step === totalSteps - 1;

  const advance = useCallback(async () => {
    await haptic();
    if (isLast) {
      setExiting(true);
      setTimeout(onDone, 280);
    } else {
      setStep(s => s + 1);
    }
  }, [isLast, onDone]);

  const skip = useCallback(async () => {
    await haptic();
    setExiting(true);
    setTimeout(onDone, 280);
  }, [onDone]);

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          key="tour-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-[9000] flex flex-col"
          style={{ background: 'rgba(5,4,15,0.88)', backdropFilter: 'blur(8px)' }}
        >
          {/* ── Header: progress dots + skip ── */}
          <div
            className="flex items-center justify-between px-5 pb-3"
            style={{ paddingTop: 'max(20px, env(safe-area-inset-top))' }}
          >
            <div className="flex items-center gap-1.5">
              {STEPS.map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    width:      i === step ? 20 : 6,
                    background: i === step ? '#A855F7' : 'rgba(255,255,255,0.18)',
                  }}
                  transition={{ duration: 0.28 }}
                  className="h-1.5 rounded-full"
                />
              ))}
            </div>
            <button
              onClick={skip}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold active:scale-90 transition-transform"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid var(--b2)', color: 'var(--t3)' }}
            >
              Skip <X size={11} />
            </button>
          </div>

          {/* ── Step content ── */}
          <div className="flex-1 flex flex-col px-5 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -28 }}
                transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                className="flex flex-col h-full"
              >
                {/* Novo avatar + pulsing glow */}
                <div className="flex justify-center mb-4">
                  <div className="relative">
                    <motion.div
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        width: 80, height: 80,
                        background: 'radial-gradient(circle, rgba(124,58,237,0.28), transparent 70%)',
                        top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                      }}
                      animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.9, 0.5] }}
                      transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
                    />
                    <NovoAvatar state={current.novoState} size="lg" />
                  </div>
                </div>

                {/* Speech bubble */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.07 }}
                  className="rounded-3xl px-[18px] py-4 mb-5 relative"
                  style={{
                    background: 'linear-gradient(135deg,rgba(91,106,245,0.12),rgba(139,92,246,0.10))',
                    border: '1px solid rgba(124,58,237,0.25)',
                  }}
                >
                  {/* Bubble tip */}
                  <div
                    className="absolute"
                    style={{
                      top: -7, left: '50%', transform: 'translateX(-50%)',
                      width: 0, height: 0,
                      borderLeft: '7px solid transparent',
                      borderRight: '7px solid transparent',
                      borderBottom: '7px solid rgba(124,58,237,0.35)',
                    }}
                  />
                  <h2 className="font-heading text-[18px] font-extrabold text-white leading-tight mb-1.5">
                    {current.heading}
                  </h2>
                  <p className="text-sm leading-relaxed text-white/60">
                    {current.body}
                  </p>
                </motion.div>

                {/* Illustration panel */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.13 }}
                  className="flex-1 overflow-hidden rounded-3xl p-4"
                  style={{ background: 'var(--s3)', border: '1px solid var(--b1)', maxHeight: 240 }}
                >
                  {current.illustration === 'home'   && <HomeIllustration />}
                  {current.illustration === 'chat'   && <ChatIllustration />}
                  {current.illustration === 'course' && <CourseIllustration />}
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── CTA button ── */}
          <div
            className="px-5 pt-4"
            style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
          >
            <motion.button
              onClick={advance}
              whileTap={{ scale: 0.97 }}
              className="w-full py-4 rounded-2xl font-heading text-base font-bold text-white flex items-center justify-center gap-2 bg-gradient-novo"
              style={{ boxShadow: '0 8px 28px rgba(124,58,237,0.45)', minHeight: 52 }}
            >
              {isLast ? (
                <>
                  <Sparkles size={16} />
                  Start learning
                </>
              ) : (
                <>
                  {current.cta}
                  <ChevronRight size={17} />
                </>
              )}
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
