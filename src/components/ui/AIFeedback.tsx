// ─────────────────────────────────────────────────────────────────────────────
// AIFeedback — thumbs up/down feedback bar for AI responses
//
// Usage (ChatPage, QuizPage, AIQuizBankPage):
//   <AIFeedback interactionId={id} subject="Physics" topic="Thermodynamics" />
//
// Records a thumbs rating via rate_ai_interaction() RPC.
// Also tracks dwell time (time from mount to rating click) as a quality signal.
// ─────────────────────────────────────────────────────────────────────────────

import {useState, useRef} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThumbsUp, ThumbsDown, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';

interface Props {
  interactionId: string;
  subject?:      string;
  topic?:        string;
  compact?:      boolean;
}

export function AIFeedback({ interactionId, subject, topic, compact = false }: Props) {
  const [rating,  setRating]  = useState<1 | -1 | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [done,    setDone]    = useState(false);
  const mountTime = useRef(Date.now());

  async function rate(thumbs: 1 | -1) {
    if (saving || done) return;
    setSaving(true);
    const dwellMs = Date.now() - mountTime.current;
    try {
      await supabase.rpc('rate_ai_interaction', {
        p_interaction_id: interactionId,
        p_thumbs:         thumbs });
      // Also update dwell time
      await supabase
        .from('ai_interactions')
        .update({ thumbs, dwell_ms: dwellMs })
        .eq('id', interactionId);

      setRating(thumbs);
      setDone(true);
      track('ai_feedback_rated', { thumbs, subject, topic, dwell_ms: dwellMs });
    } catch { /* non-critical — swallow */ }
    finally { setSaving(false); }
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <AnimatePresence mode="wait">
          {done ? (
            <motion.span key="done" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1 text-xs text-green-400">
              <Check size={10} /> Thanks!
            </motion.span>
          ) : (
            <motion.div key="btns" className="flex items-center gap-1">
              <button onClick={() => rate(1)} disabled={saving}
                className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors"
                style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
                <ThumbsUp size={11} style={{ color: rating === 1 ? '#34D399' : 'var(--ink-400)' }} />
              </button>
              <button onClick={() => rate(-1)} disabled={saving}
                className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors"
                style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
                <ThumbsDown size={11} style={{ color: rating === -1 ? '#F87171' : 'var(--ink-400)' }} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-xs text-white/30 font-semibold uppercase tracking-wide">
        Was this helpful?
      </span>
      <AnimatePresence mode="wait">
        {done ? (
          <motion.span key="done" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
            className="text-xs text-green-400 flex items-center gap-1">
            <Check size={10} /> Thanks for the feedback!
          </motion.span>
        ) : (
          <motion.div key="btns" className="flex items-center gap-1.5">
            <motion.button whileTap={{ scale: 0.85 }}
              onClick={() => rate(1)}
              disabled={saving}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: rating === 1 ? 'rgba(52,211,153,0.12)' : 'var(--ink-050)',
                border: `1px solid ${rating === 1 ? 'rgba(52,211,153,0.3)' : 'var(--ink-080)'}`,
                color: rating === 1 ? '#34D399' : 'var(--ink-400)' }}>
              <ThumbsUp size={11} /> Yes
            </motion.button>
            <motion.button whileTap={{ scale: 0.85 }}
              onClick={() => rate(-1)}
              disabled={saving}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: rating === -1 ? 'rgba(239,68,68,0.1)' : 'var(--ink-050)',
                border: `1px solid ${rating === -1 ? 'rgba(239,68,68,0.25)' : 'var(--ink-080)'}`,
                color: rating === -1 ? '#F87171' : 'var(--ink-400)' }}>
              <ThumbsDown size={11} /> No
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Helper to log an AI interaction on creation ───────────────────────────────
// Call this when Novo sends a response; store the returned ID for <AIFeedback>
export async function logAIInteraction(params: {
  userId:       string;
  sessionType:  'chat' | 'quiz_explain' | 'hint' | 'ncert' | 'doubt' | 'voice';
  userQuery:    string;
  aiResponse:   string;
  subject?:     string;
  topic?:       string;
  classNum?:    number;
  modelUsed?:   string;
  responseMs?:  number;
  language?:    string;
  memorySnapshot?: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('ai_interactions')
      .insert({
        user_id:         params.userId,
        session_type:    params.sessionType,
        user_query:      params.userQuery,
        ai_response:     params.aiResponse,
        subject:         params.subject ?? null,
        topic:           params.topic ?? null,
        class_num:       params.classNum ?? null,
        model_used:      params.modelUsed ?? null,
        response_ms:     params.responseMs ?? null,
        language:        params.language ?? 'en',
        memory_snapshot: params.memorySnapshot ?? null })
      .select('id')
      .single();
    if (error) return null;
    return (data as { id: string }).id;
  } catch { return null; }
}
