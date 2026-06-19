// ═══════════════════════════════════════════════════════════════
// Edora — VoiceStudyOverlay
// Full-screen voice conversation UI with Novo AI.
// Covers the chat page when active; dismisses cleanly.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mic, MicOff, Square, RefreshCw, AlertCircle, Brain, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useVoiceStudy, VoicePhase, VOICE_SYSTEM_PROMPTS } from '@/hooks/useVoiceStudy';
import type { LanguageOption } from '@/hooks/useLanguage';

interface VoiceStudyOverlayProps {
  visible: boolean;
  mode: 'teacher' | 'friend';
  userId: string | null;
  onClose: () => void;
  langOption?: LanguageOption;
}

const VOICE_QUIZ_PROMPTS = [
  'Explain Newton\'s 3 laws in 30 seconds',
  'What is the formula for kinetic energy?',
  'Tell me about the cell cycle',
  'Explain integration by parts',
  'What is Ohm\'s Law?',
];

// ── Animated waveform bars (Novo is speaking) ─────────────────────────────────
function WaveformBars() {
  return (
    <div className="flex items-end justify-center gap-1.5 h-10">
      {[0.3, 0.6, 1, 0.8, 0.5, 0.9, 0.4, 0.7, 1, 0.6, 0.3].map((scale, i) => (
        <motion.div
          key={i}
          className="w-1.5 rounded-full"
          style={{ background: 'linear-gradient(180deg, #8B5CF6, #5B6AF5)', height: `${scale * 100}%` }}
          animate={{ scaleY: [scale, scale * 0.3, scale] }}
          transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.07, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

// ── Pulsing mic ring (listening) ──────────────────────────────────────────────
function ListeningRing() {
  return (
    <div className="relative flex items-center justify-center">
      {[1, 2, 3].map(i => (
        <motion.div
          key={i}
          className="absolute rounded-full border-2 border-primary/30"
          style={{ width: 80 + i * 28, height: 80 + i * 28 }}
          animate={{ scale: [1, 1.12, 1], opacity: [0.4, 0.1, 0.4] }}
          transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.3, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

// ── Phase label ───────────────────────────────────────────────────────────────
const PHASE_LABELS: Record<VoicePhase, string> = {
  idle:       'Tap to speak',
  requesting: 'Requesting permission…',
  listening:  'Listening…',
  processing: 'Novo is thinking…',
  speaking:   'Novo is speaking',
  error:      'Something went wrong',
};

const PHASE_COLORS: Record<VoicePhase, string> = {
  idle:       '#94a3b8',
  requesting: '#F59E0B',
  listening:  '#10B981',
  processing: '#5B6AF5',
  speaking:   '#8B5CF6',
  error:      '#EF4444',
};

// ── Voice quiz system prompt ──────────────────────────────────────────────────
function buildQuizSystemPrompt(topic: string): string {
  return `You are Novo in Voice Quiz mode. The student will attempt to explain "${topic}" by speaking. Listen carefully to their response (given as their transcript), then:
1. Rate their understanding (0-100%)
2. Point out what they got right
3. Correct any mistakes concisely
4. Ask a follow-up question to deepen their understanding
Keep your total response under 5 sentences. Speak naturally — no bullet points or markdown.`;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function VoiceStudyOverlay({ visible, mode, userId, onClose, langOption }: VoiceStudyOverlayProps) {
  const [voiceMode, setVoiceMode] = useState<'study' | 'quiz'>('study');
  const [quizTopic, setQuizTopic] = useState('');
  const [quizStarted, setQuizStarted] = useState(false);

  const systemInstruction = voiceMode === 'quiz' && quizStarted
    ? buildQuizSystemPrompt(quizTopic)
    : VOICE_SYSTEM_PROMPTS[mode];

  const {
    phase,
    transcript,
    currentResponse,
    turns,
    error,
    isAvailable,
    startListening,
    stopListening,
    interrupt,
    reset,
  } = useVoiceStudy(systemInstruction, userId, langOption);

  // Reset conversation when overlay opens
  useEffect(() => {
    if (visible) { reset(); setVoiceMode('study'); setQuizStarted(false); setQuizTopic(''); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Mic button action depends on current phase
  function handleMicPress() {
    if (phase === 'idle' || phase === 'error')   startListening();
    else if (phase === 'listening')               stopListening();
    else if (phase === 'speaking')                interrupt();
    // 'requesting' / 'processing' → do nothing (in progress)
  }

  function handleClose() {
    interrupt();
    onClose();
  }

  const micActive  = phase === 'listening';
  const canPress   = phase !== 'requesting' && phase !== 'processing';
  const showOrb    = phase === 'idle' || phase === 'requesting' || phase === 'processing';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="voice-overlay"
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: 'linear-gradient(160deg, #0F0F1A 0%, #1A0F2E 40%, #0F1A2E 100%)' }}
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-5 pt-12 pb-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
                style={{ background: voiceMode === 'quiz'
                  ? 'linear-gradient(135deg, #F59E0B, #EF4444)'
                  : 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
                {voiceMode === 'quiz' ? <Brain size={16} className="text-white" /> : <Mic size={16} className="text-white" />}
              </div>
              <div>
                <p className="text-white font-heading font-bold text-sm">
                  {voiceMode === 'quiz' ? 'Voice Quiz' : 'Voice Study'}
                </p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {voiceMode === 'quiz' ? 'Explain it aloud — Novo evaluates' : mode === 'teacher' ? 'Teacher Mode' : 'Friend Mode'}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="w-9 h-9 rounded-2xl flex items-center justify-center transition-all active:scale-90"
              style={{ background: 'rgba(255,255,255,0.1)' }}>
              <X size={18} className="text-white" />
            </button>
          </div>

          {/* ── Mode toggle ── */}
          <div className="px-5 pb-3 flex gap-2 shrink-0">
            {(['study', 'quiz'] as const).map(m => (
              <button key={m}
                onClick={() => { setVoiceMode(m); setQuizStarted(false); setQuizTopic(''); reset(); }}
                className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                style={voiceMode === m ? {
                  background: m === 'quiz' ? 'rgba(245,158,11,0.2)' : 'rgba(91,106,245,0.2)',
                  color: m === 'quiz' ? '#FBBF24' : '#A0AEFF',
                  border: `1.5px solid ${m === 'quiz' ? 'rgba(245,158,11,0.4)' : 'rgba(91,106,245,0.4)'}`,
                } : {
                  background: 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.35)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}>
                {m === 'study' ? '📖 Study' : '🎯 Quiz Me'}
              </button>
            ))}
          </div>

          {/* ── Quiz topic input (shown when quiz mode + not started) ── */}
          {voiceMode === 'quiz' && !quizStarted && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="px-5 pb-4 shrink-0 flex flex-col gap-3">
              <input
                type="text"
                placeholder="e.g. Newton's Laws, Photosynthesis…"
                value={quizTopic}
                onChange={e => setQuizTopic(e.target.value)}
                className="w-full h-11 px-4 rounded-2xl text-white text-sm outline-none"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1.5px solid rgba(255,255,255,0.15)',
                  WebkitUserSelect: 'text', userSelect: 'text',
                }}
              />
              <div className="flex gap-2 flex-wrap">
                {VOICE_QUIZ_PROMPTS.slice(0, 3).map(p => (
                  <button key={p} onClick={() => setQuizTopic(p)}
                    className="text-[11px] px-3 py-1.5 rounded-full font-medium"
                    style={{ background: 'rgba(245,158,11,0.1)', color: '#FBBF24', border: '1px solid rgba(245,158,11,0.2)' }}>
                    {p.slice(0, 28)}…
                  </button>
                ))}
              </div>
              <button
                disabled={!quizTopic.trim()}
                onClick={() => { setQuizStarted(true); reset(); }}
                className="w-full py-3 rounded-2xl font-bold text-sm text-white disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#F59E0B,#EF4444)' }}>
                <span className="flex items-center justify-center gap-2">
                  <Zap size={15} />
                  Start Voice Quiz
                </span>
              </button>
            </motion.div>
          )}

          {/* ── Conversation history ── */}
          <div className="flex-1 native-scroll px-5 flex flex-col gap-3 py-2 overflow-y-auto">
            {turns.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center flex-1 gap-4 text-center py-8">
                <div className="w-16 h-16 rounded-3xl flex items-center justify-center"
                  style={{ background: 'rgba(91,106,245,0.15)', border: '1px solid rgba(91,106,245,0.25)' }}>
                  <Mic size={28} style={{ color: '#8B5CF6' }} />
                </div>
                <div>
                  <p className="text-white font-heading font-semibold text-base">
                    {isAvailable
                      ? voiceMode === 'quiz' && quizStarted
                        ? `Explain "${quizTopic}"`
                        : 'Start talking to Novo'
                      : 'Voice not supported on this device'}
                  </p>
                  <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    {isAvailable
                      ? voiceMode === 'quiz' && quizStarted
                        ? 'Speak for 30 seconds — Novo will evaluate your answer'
                        : 'Ask any question — Novo will explain it aloud'
                      : 'Your device or browser does not support speech recognition'}
                  </p>
                </div>
              </motion.div>
            )}

            {turns.map((turn, i) => (
              <motion.div
                key={turn.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="max-w-[82%] px-4 py-3 rounded-2xl text-sm leading-relaxed"
                  style={
                    turn.role === 'user'
                      ? { background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)', color: '#fff', borderRadius: '18px 18px 4px 18px' }
                      : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.90)', borderRadius: '18px 18px 18px 4px', border: '1px solid rgba(255,255,255,0.1)' }
                  }>
                  {turn.content}
                </div>
              </motion.div>
            ))}

            {/* Spacer so last message isn't behind the bottom panel */}
            <div className="h-4 shrink-0" />
          </div>

          {/* ── Bottom panel ── */}
          <div className="shrink-0 px-5 pb-10 pt-4 flex flex-col items-center gap-5"
            style={{ background: 'rgba(0,0,0,0.3)', borderTop: '1px solid rgba(255,255,255,0.07)' }}>

            {/* Live transcript / response preview */}
            <AnimatePresence mode="wait">
              {phase === 'listening' && transcript && (
                <motion.p
                  key="transcript"
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="text-sm text-center px-4 font-medium"
                  style={{ color: 'rgba(255,255,255,0.75)' }}>
                  "{transcript}"
                </motion.p>
              )}

              {phase === 'processing' && (
                <motion.div
                  key="thinking"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex items-center gap-2">
                  {[0, 0.18, 0.36].map((d, i) => (
                    <motion.div key={i} className="w-2 h-2 rounded-full bg-primary"
                      animate={{ y: [0, -5, 0] }} transition={{ duration: 0.7, repeat: Infinity, delay: d }} />
                  ))}
                </motion.div>
              )}

              {phase === 'speaking' && (
                <motion.div
                  key="speaking"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <WaveformBars />
                </motion.div>
              )}

              {phase === 'error' && error && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex items-start gap-2 bg-red-500/10 border border-red-500/25 rounded-2xl px-4 py-3 max-w-xs">
                  <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300 leading-snug">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Phase label */}
            <motion.p
              key={phase}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: PHASE_COLORS[phase] }}>
              {PHASE_LABELS[phase]}
            </motion.p>

            {/* Orb + mic button cluster */}
            <div className="relative flex items-center justify-center">
              {/* Listening pulse rings */}
              {micActive && <ListeningRing />}

              {/* Speaking ring */}
              {phase === 'speaking' && (
                <motion.div
                  className="absolute rounded-full"
                  style={{ width: 100, height: 100, background: 'rgba(139,92,246,0.15)', border: '2px solid rgba(139,92,246,0.4)' }}
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                />
              )}

              {/* Central orb / glow */}
              {showOrb && (
                <motion.div
                  className="absolute rounded-full"
                  style={{ width: 90, height: 90, background: 'radial-gradient(circle, rgba(91,106,245,0.25) 0%, transparent 70%)' }}
                  animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}

              {/* Primary mic button */}
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={handleMicPress}
                disabled={!isAvailable || !canPress}
                className="relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all disabled:opacity-40"
                style={{
                  background: micActive
                    ? 'linear-gradient(135deg, #EF4444, #DC2626)'
                    : phase === 'speaking'
                      ? 'linear-gradient(135deg, #8B5CF6, #6D28D9)'
                      : 'linear-gradient(135deg, #5B6AF5, #8B5CF6)',
                  boxShadow: micActive
                    ? '0 0 0 0 rgba(239,68,68,0.4), 0 8px 32px rgba(239,68,68,0.4)'
                    : '0 8px 32px rgba(91,106,245,0.45)',
                }}>
                {micActive
                  ? <MicOff size={28} className="text-white" />
                  : phase === 'speaking'
                    ? <Square size={22} className="text-white fill-white" />
                    : phase === 'error'
                      ? <RefreshCw size={24} className="text-white" />
                      : <Mic size={28} className="text-white" />}
              </motion.button>
            </div>

            {/* Reset button — only show after turns exist */}
            {turns.length > 0 && phase === 'idle' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={reset}
                  className="text-white/50 hover:text-white/80 gap-2">
                  <RefreshCw size={13} />
                  New Conversation
                </Button>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
