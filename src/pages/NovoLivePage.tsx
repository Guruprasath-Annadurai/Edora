// ═══════════════════════════════════════════════════════════════
// Edora — NovoLivePage
// Voice-powered structured academic tutoring sessions with Novo AI.
// Full voice conversation loop: lesson → checkpoint → summary → cards.
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, MicOff, Volume2, PhoneOff, ArrowLeft,
  BookOpen, GraduationCap, Sparkles, Settings2,
  CheckCircle2, Loader2, AlertCircle, Trophy,
  ChevronDown, ChevronUp,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useVoiceStudy } from '@/hooks/useVoiceStudy';
import { supabase } from '@/lib/supabase';
import { createCardsFromSession } from '@/lib/spacedRepetition';
import { geminiJSON } from '@/lib/gemini';

// ── Types ─────────────────────────────────────────────────────────────────────

type StudyLevel = 'school' | 'college' | 'competitive' | 'professional';
type PagePhase  = 'setup' | 'session' | 'complete';

interface LocalMessage {
  id: string;
  role: 'novo' | 'student';
  content: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LEVEL_LABELS: Record<StudyLevel, string> = {
  school:      'School',
  college:     'College',
  competitive: 'Competitive Exam',
  professional: 'Professional',
};

const SUBJECT_VOCAB: Record<string, string> = {
  physics:     'Use precise physics terms: force, velocity, acceleration, momentum, energy, field, wave, quantum.',
  mathematics: 'Use precise math terms: function, derivative, integral, vector, matrix, proof, theorem, conjecture.',
  chemistry:   'Use precise chemistry terms: bond, orbital, reaction, equilibrium, oxidation, catalyst, valence.',
  biology:     'Use precise biology terms: cell, protein, gene, evolution, homeostasis, membrane, metabolism.',
  history:     'Ground explanations in dates, causes, consequences, and key figures. Use historiographical terms.',
  economics:   'Use precise economics terms: supply, demand, elasticity, equilibrium, utility, marginal, GDP.',
  literature:  'Use literary terms: theme, motif, narrative, irony, symbolism, characterization, structure.',
  computer:    'Use precise CS terms: algorithm, complexity, recursion, abstraction, memory, concurrency.',
  programming: 'Use precise CS terms: algorithm, complexity, recursion, abstraction, memory, concurrency.',
};

function subjectVocabHint(subject: string): string {
  const key = Object.keys(SUBJECT_VOCAB).find(k => subject.toLowerCase().includes(k));
  return key ? `\nVOCABULARY: ${SUBJECT_VOCAB[key]}` : '';
}

function buildSystemPrompt(subject: string, topic: string, studyLevel: StudyLevel): string {
  return `You are Novo, an expert AI tutor conducting a structured live voice lesson.
Topic: ${topic} | Subject: ${subject} | Level: ${LEVEL_LABELS[studyLevel]}${subjectVocabHint(subject)}

LESSON STRUCTURE — follow this flow:
1. INTRO (1-2 turns): Greet warmly, state what you'll cover, ask if they're ready.
2. TEACHING (3-5 turns): Teach the topic in clear spoken steps. No bullet points. Ask "Does that make sense?" after each key concept.
3. CHECKPOINT (2-3 turns): Ask a probing question to test understanding. Give feedback on their answer.
4. SUMMARY (1 turn): Recap the 3 key points covered.

RULES:
- Keep ALL responses under 4 sentences (they're listening, not reading)
- No markdown, no bullet points, no asterisks
- Use conversational, encouraging language
- When student answers, give specific feedback before continuing
- After the summary, say "We've covered everything for today. You did great!"`;
}

// ── Phase indicator chip ──────────────────────────────────────────────────────

function PhaseChip({ phase }: { phase: string }) {
  const map: Record<string, { label: string; color: string }> = {
    idle:       { label: 'Ready',      color: '#10B981' },
    requesting: { label: 'Connecting', color: '#F59E0B' },
    listening:  { label: 'Listening',  color: '#EF4444' },
    processing: { label: 'Thinking',   color: '#5B6AF5' },
    speaking:   { label: 'Speaking',   color: '#8B5CF6' },
    error:      { label: 'Error',      color: '#EF4444' },
  };
  const info = map[phase] ?? { label: phase, color: '#6B7280' };

  return (
    <motion.div
      key={phase}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={{
        background: `${info.color}22`,
        border: `1px solid ${info.color}44`,
      }}
    >
      <div
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: info.color }}
      />
      <span className="text-[11px] font-semibold" style={{ color: info.color }}>
        {info.label}
      </span>
    </motion.div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, index }: { msg: LocalMessage; index: number }) {
  const isNovo = msg.role === 'novo';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: Math.min(index * 0.04, 0.3), duration: 0.25 }}
      className={`flex flex-col gap-1 mb-3 ${isNovo ? 'items-start' : 'items-end'}`}
    >
      <span
        className="text-[11px] font-bold px-1"
        style={{ color: isNovo ? '#8B5CF6' : 'rgba(255,255,255,0.4)' }}
      >
        {isNovo ? 'Novo' : 'You'}
      </span>
      <div
        className="max-w-[82%] px-4 py-3 rounded-2xl"
        style={
          isNovo
            ? {
                background: 'linear-gradient(135deg, rgba(91,106,245,0.18), rgba(139,92,246,0.18))',
                border: '1px solid rgba(139,92,246,0.3)',
                borderTopLeftRadius: 4,
              }
            : {
                background: 'rgba(255,255,255,0.055)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderTopRightRadius: 4,
              }
        }
      >
        <p className="text-sm leading-relaxed text-white">{msg.content}</p>
      </div>
    </motion.div>
  );
}

// ── Animated waveform ─────────────────────────────────────────────────────────

function Waveform() {
  return (
    <div className="flex items-end gap-1 h-8">
      {[0, 1, 2, 3, 4].map(i => (
        <motion.div
          key={i}
          className="w-1.5 rounded-full"
          style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
          animate={{ height: ['6px', '24px', '10px', '28px', '8px', '6px'] }}
          transition={{
            duration: 1.1,
            delay: i * 0.15,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

// ── Speaking pulse rings ──────────────────────────────────────────────────────

function SpeakingPulse() {
  return (
    <div className="relative flex items-center justify-center w-24 h-24 mx-auto">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="absolute rounded-full border-2"
          style={{ borderColor: 'rgba(139,92,246,0.4)' }}
          animate={{ scale: [1, 1.6 + i * 0.3], opacity: [0.8, 0] }}
          transition={{
            duration: 1.8,
            delay: i * 0.5,
            repeat: Infinity,
            ease: 'easeOut',
          }}
          initial={{ width: 40, height: 40 }}
        />
      ))}
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
      >
        <Volume2 size={20} className="text-white" />
      </div>
    </div>
  );
}

// ── Processing dots ───────────────────────────────────────────────────────────

function ProcessingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="w-2 h-2 rounded-full"
          style={{ background: 'rgba(139,92,246,0.6)' }}
          animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 0.9, delay: i * 0.25, repeat: Infinity }}
        />
      ))}
    </div>
  );
}

// ── Setup Screen ──────────────────────────────────────────────────────────────

interface SetupScreenProps {
  subject:       string;
  topic:         string;
  studyLevel:    StudyLevel;
  voiceSpeed:    'slow' | 'normal' | 'fast';
  onSubjectChange: (v: string) => void;
  onTopicChange:   (v: string) => void;
  onLevelChange:   (v: StudyLevel) => void;
  onSpeedChange:   (v: 'slow' | 'normal' | 'fast') => void;
  onStart:       () => void;
  isAvailable:          boolean;
  isAvailabilityChecked: boolean;
}

function SetupScreen({
  subject, topic, studyLevel, voiceSpeed,
  onSubjectChange, onTopicChange, onLevelChange, onSpeedChange,
  onStart, isAvailable, isAvailabilityChecked,
}: SetupScreenProps) {
  const navigate = useNavigate();
  const deviceBlocked = isAvailabilityChecked && !isAvailable;
  const canStart = subject.trim().length > 0 && topic.trim().length > 0 && !deviceBlocked;

  const levels: { key: StudyLevel; label: string }[] = [
    { key: 'school',      label: 'School' },
    { key: 'college',     label: 'College' },
    { key: 'competitive', label: 'Competitive Exam' },
    { key: 'professional', label: 'Professional' },
  ];

  const features: { icon: LucideIcon; title: string; desc: string }[] = [
    { icon: BookOpen,       title: 'Structured lesson',   desc: 'Novo teaches the topic step by step' },
    { icon: GraduationCap,  title: 'Socratic questions',  desc: 'Novo asks questions to check understanding' },
    { icon: Sparkles,       title: 'Auto flashcards',     desc: 'Cards created from your session automatically' },
  ];

  return (
    <div
      className="flex flex-col h-full overflow-y-auto pb-nav"
      style={{ background: 'linear-gradient(160deg, #0f0f1a 0%, #13102a 100%)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-6 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'rgba(255,255,255,0.055)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', border: '1px solid rgba(255,255,255,0.10)' }}
        >
          <ArrowLeft size={17} className="text-white" />
        </button>
        <div className="flex-1">
          <h1 className="font-heading text-2xl font-bold text-white">Novo Live</h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Voice-powered structured lessons
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="px-4 flex flex-col gap-4 pb-8">
        {/* Subject */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Subject
          </label>
          <input
            value={subject}
            onChange={e => onSubjectChange(e.target.value)}
            placeholder="e.g. Physics, Mathematics…"
            className="w-full px-4 py-3.5 rounded-2xl text-sm text-white outline-none placeholder:opacity-30 transition-all"
            style={{
              background: 'rgba(255,255,255,0.07)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.14)',
            }}
          />
        </div>

        {/* Topic */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Topic
          </label>
          <input
            value={topic}
            onChange={e => onTopicChange(e.target.value)}
            placeholder="e.g. Newton's Laws, Quadratic Equations…"
            className="w-full px-4 py-3.5 rounded-2xl text-sm text-white outline-none placeholder:opacity-30 transition-all"
            style={{
              background: 'rgba(255,255,255,0.07)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.14)',
            }}
          />
        </div>

        {/* Study Level */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Study Level
          </label>
          <div className="grid grid-cols-2 gap-2">
            {levels.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => onLevelChange(key)}
                className="py-3 px-3 rounded-2xl text-sm font-semibold transition-all active:scale-95"
                style={
                  studyLevel === key
                    ? {
                        background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)',
                        color: '#fff',
                        border: '1px solid transparent',
                      }
                    : {
                        background: 'rgba(255,255,255,0.055)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        color: 'rgba(255,255,255,0.7)',
                        border: '1px solid rgba(255,255,255,0.12)',
                      }
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Voice Speed */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Voice Speed
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {(['slow', 'normal', 'fast'] as const).map(speed => (
              <button
                key={speed}
                onClick={() => onSpeedChange(speed)}
                className="py-2.5 px-2 rounded-2xl text-xs font-semibold transition-all active:scale-95 capitalize"
                style={
                  voiceSpeed === speed
                    ? { background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)', color: '#fff', border: '1px solid transparent' }
                    : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }
                }
              >
                {speed.charAt(0).toUpperCase() + speed.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Device not supported notice */}
        {deviceBlocked && (
          <div className="flex items-start gap-3 px-4 py-3.5 rounded-2xl"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(239,100,100,0.9)' }}>
              Voice recognition isn't available on this device. It requires Google speech services (Play Services).
            </p>
          </div>
        )}

        {/* Start button */}
        <button
          onClick={onStart}
          disabled={!canStart}
          className="w-full py-4 rounded-2xl text-base font-bold text-white mt-2 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
        >
          <Mic size={18} />
          Start Live Session
        </button>

        <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Novo will teach, pause to listen, then quiz you. Speak naturally.
        </p>

        {/* Feature preview cards */}
        <div className="flex flex-col gap-2 mt-2">
          {features.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.07 }}
              className="flex items-start gap-3 px-4 py-3.5 rounded-2xl"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {(() => { const FIcon = f.icon; return <FIcon size={18} className="text-primary shrink-0 mt-0.5" />; })()}
              <div>
                <p className="text-sm font-bold text-white">{f.title}</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{f.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Complete Screen ───────────────────────────────────────────────────────────

interface CompleteScreenProps {
  subject:     string;
  topic:       string;
  turnCount:   number;
  cardCount:   number;
  generating:  boolean;
  messages:    LocalMessage[];
  onNewSession: () => void;
}

function CompleteScreen({ subject, topic, turnCount, cardCount, generating, messages, onNewSession }: CompleteScreenProps) {
  const navigate = useNavigate();
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center h-full px-6 text-center"
      style={{ background: 'linear-gradient(160deg, #0f0f1a 0%, #13102a 100%)' }}
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.1 }}
        className="w-24 h-24 rounded-3xl flex items-center justify-center mb-6"
        style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}
      >
        <Trophy size={48} className="text-white" />
      </motion.div>

      <h1 className="font-heading text-3xl font-bold text-white mb-2">
        Session Complete!
      </h1>
      <p className="text-sm mb-8" style={{ color: 'rgba(255,255,255,0.5)' }}>
        {subject} · {topic}
      </p>

      {/* Stats */}
      <div className="flex gap-4 mb-8 w-full justify-center">
        <div
          className="flex-1 max-w-[140px] px-4 py-4 rounded-2xl text-center"
          style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', border: '1px solid rgba(255,255,255,0.10)' }}
        >
          <p className="text-2xl font-bold text-white">{turnCount}</p>
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>Turns</p>
        </div>
        <div
          className="flex-1 max-w-[140px] px-4 py-4 rounded-2xl text-center"
          style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', border: '1px solid rgba(255,255,255,0.10)' }}
        >
          {generating ? (
            <Loader2 size={22} className="text-purple-400 animate-spin mx-auto" />
          ) : (
            <p className="text-2xl font-bold text-white">{cardCount}</p>
          )}
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {generating ? 'Creating…' : 'Flashcards'}
          </p>
        </div>
      </div>

      {/* Key topics */}
      <div
        className="w-full max-w-sm px-4 py-3.5 rounded-2xl mb-8 text-left"
        style={{ background: 'rgba(91,106,245,0.12)', border: '1px solid rgba(91,106,245,0.25)' }}
      >
        <div className="flex items-center gap-2 mb-2">
          <BookOpen size={14} className="text-indigo-400" />
          <span className="text-xs font-bold text-indigo-400 uppercase tracking-wide">Topic Covered</span>
        </div>
        <p className="text-sm font-semibold text-white">{topic}</p>
        <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>in {subject}</p>
      </div>

      {/* Transcript */}
      {messages.length > 0 && (
        <div className="w-full max-w-sm mb-2">
          <button
            onClick={() => setTranscriptOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition-all active:scale-98"
            style={{
              background: 'rgba(255,255,255,0.055)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.7)',
            }}>
            <span>Session Transcript ({messages.length} turns)</span>
            {transcriptOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <AnimatePresence>
            {transcriptOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <div className="mt-2 max-h-60 overflow-y-auto flex flex-col gap-2 pr-0.5"
                  style={{ scrollbarWidth: 'thin' }}>
                  {messages.map(m => (
                    <div key={m.id}
                      className="px-3 py-2 rounded-xl text-xs leading-relaxed"
                      style={{
                        background: m.role === 'novo' ? 'rgba(139,92,246,0.12)' : 'rgba(16,185,129,0.1)',
                        border: `1px solid ${m.role === 'novo' ? 'rgba(139,92,246,0.2)' : 'rgba(16,185,129,0.2)'}`,
                        color: 'rgba(255,255,255,0.75)',
                        marginLeft: m.role === 'student' ? '15%' : '0',
                        marginRight: m.role === 'novo' ? '15%' : '0',
                      }}>
                      <span className="font-bold block mb-0.5"
                        style={{ color: m.role === 'novo' ? '#A78BFA' : '#34D399', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {m.role === 'novo' ? 'Novo' : 'You'}
                      </span>
                      {m.content}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3 w-full max-w-sm">
        <button
          onClick={() => navigate('/spaced-review')}
          className="w-full py-4 rounded-2xl text-base font-bold text-white transition-all active:scale-95 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
        >
          <CheckCircle2 size={18} />
          Review Flashcards
        </button>
        <button
          onClick={onNewSession}
          className="w-full py-4 rounded-2xl text-sm font-bold transition-all active:scale-95"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.8)',
          }}
        >
          New Session
        </button>
      </div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function NovoLivePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  type VoiceSpeed = 'slow' | 'normal' | 'fast';

  // ── Setup state ──
  const [subject,    setSubject]    = useState('');
  const [topic,      setTopic]      = useState('');
  const [studyLevel, setStudyLevel] = useState<StudyLevel>('college');
  const [voiceSpeed, setVoiceSpeed] = useState<VoiceSpeed>('normal');
  const [pagePhase,  setPagePhase]  = useState<PagePhase>('setup');

  // ── Session state ──
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [sessionId]  = useState(() => `live-${Date.now()}`);
  const [generatingCards, setGeneratingCards] = useState(false);
  const [cardCount,  setCardCount]  = useState(0);
  const [prevTurnsLen, setPrevTurnsLen] = useState(0);
  const [showMicRationale, setShowMicRationale] = useState(false);
  const micRationaleShownRef = useRef(false);

  // ── Voice hook (initialized with empty prompt; updated on session start) ──
  const [systemPrompt, setSystemPrompt] = useState('');
  const voice = useVoiceStudy(systemPrompt, user?.id ?? null, undefined, voiceSpeed);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);

  // Refs that track mutable session state for the unmount cleanup
  const sessionStateRef = useRef({ pagePhase, localMessages, subject, topic });
  useEffect(() => {
    sessionStateRef.current = { pagePhase, localMessages, subject, topic };
  }, [pagePhase, localMessages, subject, topic]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // If user navigates away mid-session, persist what we have so it's not lost
      const { pagePhase: phase, localMessages: msgs, subject: subj, topic: tpc } = sessionStateRef.current;
      if (!user || phase !== 'session' || msgs.length < 2) return;
      supabase.from('voice_tutor_sessions').insert({
        user_id:        user.id,
        subject:        subj,
        topic:          tpc,
        status:         'interrupted',
        turns_count:    msgs.length,
        transcript:     msgs.map(m => ({ role: m.role, content: m.content })),
        sr_cards_added: 0,
      }).then(undefined, () => {});
    };
  }, [user]);

  // ── Auto-scroll to bottom ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localMessages]);

  // ── Mirror voice turns into local messages ──
  useEffect(() => {
    if (pagePhase !== 'session') return;
    if (voice.turns.length === prevTurnsLen) return;

    const newTurns = voice.turns.slice(prevTurnsLen);
    const mapped: LocalMessage[] = newTurns.map(t => ({
      id:      t.id,
      role:    t.role === 'user' ? 'student' : 'novo',
      content: t.content,
    }));

    setLocalMessages(prev => [...prev, ...mapped]);
    setPrevTurnsLen(voice.turns.length);
  }, [voice.turns, prevTurnsLen, pagePhase]);

  // ── Start session ──
  const handleStart = useCallback(() => {
    if (!subject.trim() || !topic.trim()) return;

    // Show microphone rationale before the OS permission dialog fires
    if (Capacitor.isNativePlatform() && !micRationaleShownRef.current) {
      setShowMicRationale(true);
      return;
    }

    const prompt = buildSystemPrompt(subject, topic, studyLevel);
    setSystemPrompt(prompt);
    voice.reset();
    setLocalMessages([]);
    setPrevTurnsLen(0);
    setPagePhase('session');

    // Pre-load Novo's opening greeting (doesn't go through voice)
    const openingMsg: LocalMessage = {
      id:      `novo-open-${Date.now()}`,
      role:    'novo',
      content: `Hi! I'm Novo and I'll be teaching you about ${topic} in ${subject} today. Are you ready to get started? Tap the mic and say "yes" whenever you're ready!`,
    };
    setLocalMessages([openingMsg]);
  }, [subject, topic, studyLevel, voice]);

  function proceedWithSession() {
    micRationaleShownRef.current = true;
    setShowMicRationale(false);
    handleStart();
  }

  // ── End session → generate cards ──
  const handleEndSession = useCallback(async () => {
    if (!user || !mountedRef.current) return;

    setPagePhase('complete');
    setGeneratingCards(true);

    try {
      const transcript = [...localMessages, ...voice.turns.map(t => ({
        id: t.id,
        role: (t.role === 'user' ? 'student' : 'novo') as 'novo' | 'student',
        content: t.content,
      }))]
        .map(m => `${m.role === 'novo' ? 'Novo' : 'Student'}: ${m.content}`)
        .join('\n');

      const pairs = await geminiJSON<Array<{ front: string; back: string }>>(
        `Generate 5-8 flashcards from this tutoring session on "${topic}". Return [{front, back}] JSON only. Session:\n${transcript.slice(0, 3000)}`,
      );

      if (!mountedRef.current) return;

      await createCardsFromSession(user.id, subject, topic, sessionId, pairs);

      await supabase.from('voice_tutor_sessions').insert({
        user_id:       user.id,
        subject,
        topic,
        status:        'complete',
        turns_count:   localMessages.length + voice.turns.length,
        transcript:    localMessages.map(m => ({ role: m.role, content: m.content })),
        sr_cards_added: pairs.length,
      });

      if (mountedRef.current) {
        setCardCount(pairs.length);
      }
    } catch (err) {
      console.error('[NovoLive] end session error:', err);
      if (mountedRef.current) setCardCount(0);
    } finally {
      if (mountedRef.current) setGeneratingCards(false);
    }
  }, [user, subject, topic, sessionId, localMessages, voice.turns]);

  // ── Reset to setup ──
  const handleNewSession = useCallback(() => {
    voice.reset();
    setLocalMessages([]);
    setPrevTurnsLen(0);
    setCardCount(0);
    setGeneratingCards(false);
    setPagePhase('setup');
  }, [voice]);

  // ── Mic button action ──
  const handleMicPress = useCallback(() => {
    const { phase } = voice;
    if (phase === 'idle' || phase === 'error') {
      void voice.startListening();
    } else if (phase === 'listening') {
      void voice.stopListening();
    } else if (phase === 'speaking') {
      voice.interrupt();
    }
  }, [voice]);

  // ── Render: setup ──
  if (pagePhase === 'setup') {
    return (
      <>
        <SetupScreen
          subject={subject}
          topic={topic}
          studyLevel={studyLevel}
          voiceSpeed={voiceSpeed}
          onSubjectChange={setSubject}
          onTopicChange={setTopic}
          onLevelChange={setStudyLevel}
          onSpeedChange={setVoiceSpeed}
          onStart={handleStart}
          isAvailable={voice.isAvailable}
          isAvailabilityChecked={voice.isAvailabilityChecked}
        />

        {/* Microphone permission rationale — shown before OS dialog on native */}
        <AnimatePresence>
          {showMicRationale && (
            <motion.div className="fixed inset-0 z-50 flex items-end"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="absolute inset-0 bg-black/60" onClick={() => setShowMicRationale(false)} />
              <motion.div className="relative w-full rounded-t-3xl p-6 pb-10"
                style={{ background: 'rgba(8,6,20,0.92)', backdropFilter: 'blur(48px) saturate(180%)', WebkitBackdropFilter: 'blur(48px) saturate(180%)', border: '1px solid rgba(255,255,255,0.08)' }}
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 280 }}>
                <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: 'rgba(255,255,255,0.2)' }} />
                <div className="flex items-start gap-3 mb-5">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(139,92,246,0.15)' }}>
                    <Mic size={22} style={{ color: '#8B5CF6' }} />
                  </div>
                  <div>
                    <p className="font-bold text-white text-base">Microphone access needed</p>
                    <p className="text-sm text-white/60 mt-1 leading-relaxed">
                      Novo Live listens to your spoken answers during the lesson. Your mic is only active while you hold the mic button.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setShowMicRationale(false)}>Not Now</Button>
                  <Button className="flex-1" onClick={proceedWithSession}>Continue</Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  // ── Render: complete ──
  if (pagePhase === 'complete') {
    return (
      <CompleteScreen
        subject={subject}
        topic={topic}
        turnCount={localMessages.length + voice.turns.length}
        cardCount={cardCount}
        generating={generatingCards}
        messages={localMessages}
        onNewSession={handleNewSession}
      />
    );
  }

  // ── Render: session ──
  const { phase, transcript, error } = voice;

  const micBg =
    phase === 'listening'
      ? '#EF4444'
      : phase === 'processing' || phase === 'speaking'
      ? 'rgba(255,255,255,0.12)'
      : 'linear-gradient(135deg, #5B6AF5, #8B5CF6)';

  const micDisabled = phase === 'processing';

  const instructionText =
    phase === 'listening'  ? 'Tap to stop' :
    phase === 'processing' ? 'Processing…' :
    phase === 'speaking'   ? 'Tap to interrupt' :
    phase === 'error'      ? 'Tap to retry' :
    'Tap to respond';

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'linear-gradient(160deg, #0f0f1a 0%, #13102a 100%)' }}
    >
      {/* ── Top bar ── */}
      <div
        className="flex items-center gap-3 px-4 pt-10 pb-3 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* End call button */}
        <button
          onClick={handleEndSession}
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90"
          style={{ background: '#EF4444' }}
        >
          <PhoneOff size={16} className="text-white" />
        </button>

        {/* Title */}
        <div className="flex-1 min-w-0 text-center">
          <p className="text-xs font-bold truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {subject}
          </p>
          <p className="text-sm font-bold text-white truncate">{topic}</p>
        </div>

        {/* Phase chip */}
        <AnimatePresence mode="wait">
          <PhaseChip key={phase} phase={phase} />
        </AnimatePresence>
      </div>

      {/* ── Error banner ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden shrink-0"
          >
            <div className="mx-4 mt-2 px-4 py-3 rounded-xl" style={{ background: '#7f1d1d22', border: '1px solid #EF4444aa' }}>
              <p className="text-xs text-red-400">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Conversation area ── */}
      <div className="flex-1 overflow-y-auto pb-nav px-4 py-4" style={{ WebkitOverflowScrolling: 'touch' }}>
        <AnimatePresence>
          {localMessages.map((msg, i) => (
            <MessageBubble key={msg.id} msg={msg} index={i} />
          ))}
        </AnimatePresence>

        {/* Processing indicator */}
        {phase === 'processing' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-2 mb-3"
          >
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-bold px-1" style={{ color: '#8B5CF6' }}>Novo</span>
              <div
                className="px-4 py-1 rounded-2xl"
                style={{
                  background: 'rgba(91,106,245,0.12)',
                  border: '1px solid rgba(139,92,246,0.2)',
                  borderTopLeftRadius: 4,
                }}
              >
                <ProcessingDots />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Speaking indicator ── */}
      <AnimatePresence>
        {phase === 'speaking' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="shrink-0 px-4 pb-2 flex flex-col items-center gap-3"
          >
            <SpeakingPulse />
            <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Novo is speaking…
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Listening indicator ── */}
      <AnimatePresence>
        {phase === 'listening' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="shrink-0 px-4 pb-2 flex flex-col items-center gap-2"
          >
            <Waveform />
            {transcript ? (
              <p
                className="text-sm text-center max-w-xs px-4 leading-relaxed"
                style={{ color: 'rgba(255,255,255,0.7)' }}
              >
                {transcript}
              </p>
            ) : (
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Listening…
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bottom control strip ── */}
      <div
        className="shrink-0 flex flex-col items-center gap-3 px-4 pb-10 pt-4"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Mic button */}
        <motion.button
          onClick={handleMicPress}
          disabled={micDisabled}
          whileTap={{ scale: 0.93 }}
          className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all disabled:opacity-40"
          style={{ background: micBg }}
        >
          {phase === 'processing' ? (
            <Loader2 size={26} className="text-white animate-spin" />
          ) : phase === 'listening' ? (
            <MicOff size={26} className="text-white" />
          ) : phase === 'speaking' ? (
            <Volume2 size={26} className="text-white" />
          ) : (
            <Mic size={26} className="text-white" />
          )}
        </motion.button>

        <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {instructionText}
        </p>
      </div>
    </div>
  );
}
