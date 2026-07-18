// ═══════════════════════════════════════════════════════════════════════════
// PeerExplanationPage — Feynman Technique Engine
// Route: /peer-explain
//
// Students teach a topic back to Novo. Novo evaluates depth, accuracy,
// and gaps in understanding. Score → XP → history.
//
// Phases: 'select' → pick subject + topic
//         'teach'  → write explanation
//         'result' → score card + gaps + encouragement
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Sparkles, Send, Trophy, Target,
  Loader2, ChevronRight, RotateCcw, History,
  CheckCircle2, XCircle, Lightbulb, Zap, BookOpen, Brain,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { geminiJSON } from '@/lib/gemini';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EvalResult {
  score: number;
  what_correct: string[];
  gaps: string[];
  improvements: string[];
  concept_check: string;
  encouragement: string;
}

interface PastExplanation {
  id: string;
  subject: string;
  topic: string;
  novo_score: number;
  created_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SUBJECT_TOPICS: Record<string, string[]> = {
  Physics: [
    'Newton\'s Laws of Motion', 'Work, Energy & Power', 'Gravitation',
    'Electrostatics', 'Current Electricity', 'Magnetic Effects of Current',
    'Waves & Oscillations', 'Thermodynamics', 'Optics',
  ],
  Chemistry: [
    'Chemical Bonding', 'Equilibrium', 'Electrochemistry',
    'Organic Reaction Mechanisms', 'Coordination Chemistry',
    'Thermochemistry', 'Atomic Structure', 'Periodic Properties',
  ],
  Mathematics: [
    'Limits & Continuity', 'Differentiation', 'Integration',
    'Differential Equations', 'Vectors & 3D', 'Complex Numbers',
    'Probability', 'Matrices & Determinants',
  ],
  Biology: [
    'Cell Division', 'DNA Replication & Transcription',
    'Photosynthesis', 'Human Physiology', 'Genetics',
    'Ecology & Environment', 'Evolution', 'Plant Growth & Development',
  ],
};

const SUBJECT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Physics:     { bg: 'bg-indigo-900/30', text: 'text-indigo-400',  border: 'border-indigo-500/30' },
  Chemistry:   { bg: 'bg-emerald-900/30', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  Mathematics: { bg: 'bg-amber-900/30',   text: 'text-amber-400',   border: 'border-amber-500/30'  },
  Biology:     { bg: 'bg-pink-900/30',    text: 'text-pink-400',    border: 'border-pink-500/30'   },
};

function scoreColor(score: number): string {
  if (score >= 80) return '#10B981';
  if (score >= 60) return '#F59E0B';
  if (score >= 40) return '#F97316';
  return '#EF4444';
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Expert';
  if (score >= 75) return 'Strong';
  if (score >= 60) return 'Solid';
  if (score >= 45) return 'Developing';
  return 'Needs Work';
}

// ── ScoreRing ─────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const fill = (score / 100) * c;
  const color = scoreColor(score);

  return (
    <div className="relative w-36 h-36 mx-auto">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--ink-060)" strokeWidth="10" />
        <motion.circle
          cx="60" cy="60" r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - fill }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="text-3xl font-black"
          style={{ color }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
        >
          {score}
        </motion.span>
        <span className="text-xs font-medium" style={{ color }}>{scoreLabel(score)}</span>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function PeerExplanationPage() {
  const { user } = useAuth();

  const [phase, setPhase] = useState<'select' | 'teach' | 'result'>('select');
  const [selectedSubject, setSelectedSubject] = useState('Physics');
  const [selectedTopic, setSelectedTopic]     = useState('');
  const [customTopic, setCustomTopic]         = useState('');
  const [explanation, setExplanation]         = useState('');
  const [evalResult, setEvalResult]           = useState<EvalResult | null>(null);
  const [evaluating, setEvaluating]           = useState(false);
  const [history, setHistory]                 = useState<PastExplanation[]>([]);
  const [showHistory, setShowHistory]         = useState(false);
  const [xpEarned, setXpEarned]               = useState(0);

  const MIN_CHARS = 80;
  const charCount = explanation.trim().length;
  const canSubmit = charCount >= MIN_CHARS && !evaluating;
  const activeTopic = customTopic.trim() || selectedTopic;

  // ── Load history ─────────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('peer_explanations')
      .select('id, subject, topic, novo_score, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    if (data) setHistory(data as PastExplanation[]);
  }, [user]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // ── Evaluate ──────────────────────────────────────────────────────────────────
  const evaluate = async () => {
    if (!canSubmit || !activeTopic || !user) return;
    setEvaluating(true);

    try {
      const result = await geminiJSON<EvalResult>(`
You are Novo, an expert JEE/NEET tutor using the Feynman Technique to evaluate a student's understanding.
Subject: ${selectedSubject}
Topic: ${activeTopic}
Student's explanation: "${explanation.trim()}"

Evaluate their depth of understanding. Be honest but encouraging.
Return ONLY valid JSON:
{
  "score": 72,
  "what_correct": ["Correctly identified...", "Good understanding of..."],
  "gaps": ["Missed the key relationship between...", "Didn't explain why..."],
  "improvements": ["Add an example showing...", "Clarify the distinction between..."],
  "concept_check": "The most critical insight for this topic is: ...",
  "encouragement": "Personalised 1-sentence encouragement based on what they attempted"
}
Rules:
- score is 0-100 (be fair but honest)
- what_correct: 2-4 items minimum
- gaps: only real conceptual gaps, not trivial omissions
- improvements: actionable, specific suggestions
- concept_check: the #1 thing they must understand about this topic
`);

      setEvalResult(result);
      const xp = Math.round((result.score / 100) * 50);
      setXpEarned(xp);
      setPhase('result');

      // Save to DB
      supabase.from('peer_explanations').insert({
        user_id:          user.id,
        subject:          selectedSubject,
        topic:            activeTopic,
        explanation_text: explanation.trim(),
        novo_score:       result.score,
        novo_feedback:    result,
      }).then(() => {});

      // Award XP
      if (xp > 0) {
        supabase.rpc('increment_xp', { p_user_id: user.id, p_amount: xp }).then(() => {});
      }

    } catch {
      setEvalResult({
        score: 0,
        what_correct: [],
        gaps: ['Could not evaluate — please try again.'],
        improvements: [],
        concept_check: '',
        encouragement: 'Keep trying! Your effort matters.',
      });
      setPhase('result');
    } finally {
      setEvaluating(false);
    }
  };

  // ── Reset ─────────────────────────────────────────────────────────────────────
  const reset = () => {
    setExplanation('');
    setEvalResult(null);
    setCustomTopic('');
    setSelectedTopic('');
    setXpEarned(0);
    setPhase('select');
    loadHistory();
  };

  // ── Select phase ──────────────────────────────────────────────────────────────
  if (phase === 'select') {
    const sc = SUBJECT_COLORS[selectedSubject];
    return (
      <div className="h-full text-white">
        <div className="sticky top-0 z-20/90 backdrop-blur border-b border-white/5 px-4 py-3 flex items-center gap-3">
          <Link aria-label="Go back" to="/home" className="p-2 rounded-xl hover:bg-white/5 transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div className="flex-1">
            <h1 className="font-bold text-white">Peer Explanation</h1>
            <p className="text-xs text-gray-400">Teach it to understand it</p>
          </div>
          <button
            onClick={() => { setShowHistory((h) => !h); loadHistory(); }}
            className="p-2 rounded-xl hover:bg-white/5 transition-colors"
          >
            <History className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          {/* Hero */}
          <div className="text-center space-y-2 py-4">
            <Brain size={44} className="mx-auto text-white/70" strokeWidth={1.5} />
            <h2 className="text-xl font-bold">The Feynman Method</h2>
            <p className="text-sm text-gray-400 max-w-xs mx-auto">
              Explain a topic as if teaching someone from scratch. Novo will find gaps in your understanding.
            </p>
          </div>

          {/* Subject selector */}
          <div className="grid grid-cols-2 gap-2">
            {Object.keys(SUBJECT_TOPICS).map((subj) => {
              const col = SUBJECT_COLORS[subj];
              const active = selectedSubject === subj;
              return (
                <button
                  key={subj}
                  onClick={() => { setSelectedSubject(subj); setSelectedTopic(''); }}
                  className={`py-3 rounded-2xl text-sm font-semibold border transition-all ${
                    active
                      ? `${col.bg} ${col.text} ${col.border}`
                      : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/8'
                  }`}
                >
                  {subj}
                </button>
              );
            })}
          </div>

          {/* Topic picker */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Pick a topic</p>
            <div className="flex flex-wrap gap-2">
              {SUBJECT_TOPICS[selectedSubject]?.map((topic) => (
                <button
                  key={topic}
                  onClick={() => { setSelectedTopic(topic); setCustomTopic(''); }}
                  className={`px-3 py-1.5 rounded-xl text-xs border transition-all ${
                    selectedTopic === topic
                      ? `${sc.bg} ${sc.text} ${sc.border}`
                      : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/8'
                  }`}
                >
                  {topic}
                </button>
              ))}
            </div>
            <input
              value={customTopic}
              onChange={(e) => { setCustomTopic(e.target.value); setSelectedTopic(''); }}
              placeholder="Or type a custom topic…"
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            onClick={() => activeTopic && setPhase('teach')}
            disabled={!activeTopic}
            className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 font-semibold transition-colors flex items-center justify-center gap-2"
          >
            Start Teaching <ChevronRight className="w-4 h-4" />
          </button>

          {/* History */}
          <AnimatePresence>
            {showHistory && history.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2"
              >
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Past Explanations</p>
                {history.map((h) => (
                  <div key={h.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/8">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold"
                      style={{ background: `${scoreColor(h.novo_score)}20`, color: scoreColor(h.novo_score) }}>
                      {h.novo_score}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{h.topic}</div>
                      <div className="text-xs text-gray-500">{h.subject} · {new Date(h.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // ── Teach phase ───────────────────────────────────────────────────────────────
  if (phase === 'teach') {
    return (
      <div className="h-full text-white flex flex-col">
        <div className="sticky top-0 z-20/90 backdrop-blur border-b border-white/5 px-4 py-3 flex items-center gap-3">
          <button aria-label="Go back" onClick={() => setPhase('select')} className="p-2 rounded-xl hover:bg-white/5">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </button>
          <div className="flex-1">
            <h1 className="font-bold text-white">{activeTopic}</h1>
            <p className="text-xs text-gray-400">{selectedSubject} · Teach Novo</p>
          </div>
        </div>

        <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-4">
          {/* Novo prompt */}
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex-shrink-0 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1 p-4 rounded-2xl rounded-tl-sm bg-white/5 border border-white/8 text-sm text-gray-200">
              Explain <strong className="text-white">{activeTopic}</strong> to me as if I'm a complete beginner.
              Use examples, analogies, and real-world applications. Don't worry about being perfect — I'll help you find the gaps.
            </div>
          </div>

          {/* Explanation textarea */}
          <div className="space-y-2">
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Type your explanation here…"
              rows={10}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
            />
            <div className="flex items-center justify-between px-1">
              <span className={`text-xs ${charCount >= MIN_CHARS ? 'text-emerald-400' : 'text-gray-500'}`}>
                {charCount} / {MIN_CHARS} chars minimum
              </span>
              {charCount >= MIN_CHARS && (
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Ready to evaluate
                </span>
              )}
            </div>
          </div>

          {/* Tips */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {['Use examples', 'Explain WHY', 'Keep it simple'].map((tip) => (
              <div key={tip} className="px-2 py-2 rounded-xl bg-white/4 border border-white/8 text-xs text-gray-500">
                {tip}
              </div>
            ))}
          </div>
        </div>

        <div className="sticky bottom-0/95 backdrop-blur border-t border-white/5 px-4 py-3">
          <button
            onClick={evaluate}
            disabled={!canSubmit}
            className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {evaluating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Evaluating your understanding…</>
            ) : (
              <><Send className="w-4 h-4" /> Submit Explanation</>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Result phase ──────────────────────────────────────────────────────────────
  if (!evalResult) return null;
  return (
    <div className="h-full text-white">
      <div className="sticky top-0 z-20/90 backdrop-blur border-b border-white/5 px-4 py-3 flex items-center gap-3">
        <button aria-label="Go back" onClick={reset} className="p-2 rounded-xl hover:bg-white/5">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-white">Your Score</h1>
          <p className="text-xs text-gray-400">{activeTopic}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Score ring */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <ScoreRing score={evalResult.score} />
          {xpEarned > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.8 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-900/30 border border-amber-500/30 text-amber-400 text-sm font-semibold"
            >
              <Zap className="w-4 h-4" /> +{xpEarned} XP earned
            </motion.div>
          )}
          <p className="text-sm text-gray-300 italic">"{evalResult.encouragement}"</p>
        </motion.div>

        {/* What you got right */}
        {evalResult.what_correct.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="p-4 rounded-2xl bg-emerald-900/20 border border-emerald-500/20 space-y-3"
          >
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
              <CheckCircle2 className="w-4 h-4" /> What you got right
            </div>
            <ul className="space-y-2">
              {evalResult.what_correct.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-300">
                  <span className="text-emerald-500 mt-0.5">✓</span> {item}
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        {/* Gaps */}
        {evalResult.gaps.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="p-4 rounded-2xl bg-red-900/20 border border-red-500/20 space-y-3"
          >
            <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
              <XCircle className="w-4 h-4" /> Gaps found
            </div>
            <ul className="space-y-2">
              {evalResult.gaps.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-300">
                  <span className="text-red-500 mt-0.5">✗</span> {item}
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        {/* Improvements */}
        {evalResult.improvements.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="p-4 rounded-2xl bg-amber-900/20 border border-amber-500/20 space-y-3"
          >
            <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
              <Lightbulb className="w-4 h-4" /> How to improve
            </div>
            <ul className="space-y-2">
              {evalResult.improvements.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-300">
                  <span className="text-amber-500 mt-0.5">→</span> {item}
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        {/* Concept check */}
        {evalResult.concept_check && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75 }}
            className="p-4 rounded-2xl bg-indigo-900/20 border border-indigo-500/20 space-y-2"
          >
            <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
              <Target className="w-4 h-4" /> Key insight
            </div>
            <p className="text-sm text-gray-300">{evalResult.concept_check}</p>
          </motion.div>
        )}

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="grid grid-cols-2 gap-3 pb-6"
        >
          <button
            onClick={() => { setPhase('teach'); setExplanation(''); setEvalResult(null); }}
            className="py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" /> Try Again
          </button>
          <button
            onClick={reset}
            className="py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <BookOpen className="w-4 h-4" /> New Topic
          </button>
        </motion.div>
      </div>
    </div>
  );
}

// suppress
void Trophy;
