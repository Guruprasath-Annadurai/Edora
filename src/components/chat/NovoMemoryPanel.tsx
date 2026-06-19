import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Brain, Trash2, ChevronRight, Zap, BookOpen, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { NovoMemoryContext, ExplanationStyle } from '@/types';

const STYLE_CONFIG: Record<ExplanationStyle, { emoji: string; label: string; desc: string }> = {
  simple:   { emoji: '🧸', label: 'Simple',   desc: 'Analogies & tiny steps' },
  balanced: { emoji: '⚖️', label: 'Balanced', desc: 'Clear + some depth' },
  deep:     { emoji: '🔬', label: 'Deep',      desc: 'Rigour, proofs, WHY' },
  socratic: { emoji: '❓', label: 'Socratic',  desc: 'Questions-first' },
};

const SOURCE_ICON: Record<string, React.ReactNode> = {
  quiz:     <Zap      size={11} />,
  tutoring: <Brain    size={11} />,
  chat:     <Brain    size={11} />,
  sprint:   <BookOpen size={11} />,
};

interface Props {
  context:   NovoMemoryContext;
  onClose:   () => void;
  onRefresh: () => void;
}

export function NovoMemoryPanel({ context, onClose, onRefresh }: Props) {
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [updatingStyle, setUpdating]  = useState(false);
  const [activeStyle, setActiveStyle] = useState<ExplanationStyle>(context.explanation_style);
  const [tab, setTab] = useState<'weaknesses' | 'sessions' | 'style'>('weaknesses');

  async function deleteMemory(id: string) {
    setDeletingId(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.functions.invoke('novo-memory', {
        body: { action: 'delete', memory_id: id },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      onRefresh();
    } finally {
      setDeletingId(null);
    }
  }

  async function updateStyle(style: ExplanationStyle) {
    setActiveStyle(style);
    setUpdating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.functions.invoke('novo-memory', {
        body: { action: 'update_explanation_style', style },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      onRefresh();
    } finally {
      setUpdating(false);
    }
  }

  const hasWeaknesses = context.top_weaknesses.length > 0;
  const hasSessions   = context.session_summaries.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="w-full rounded-t-3xl flex flex-col"
        style={{
          background: 'linear-gradient(180deg,#0D1229 0%,#090C1C 100%)',
          border: '1px solid rgba(255,255,255,0.07)',
          maxHeight: '80vh',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1" style={{ background: 'rgba(255,255,255,0.15)' }} />

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 shrink-0">
          <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}>
            <Brain size={17} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-white text-base leading-tight">Novo's Memory</p>
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {context.top_weaknesses.length} weak spots · {context.session_summaries.length} sessions
            </p>
          </div>
          <button aria-label="Close" onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.07)' }}>
            <X size={15} className="text-white/60" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pb-3 shrink-0">
          {(['weaknesses', 'sessions', 'style'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={tab === t
                ? { background: 'rgba(91,106,245,0.2)', color: '#A0AEFF', border: '1px solid rgba(91,106,245,0.4)' }
                : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', border: '1px solid transparent' }
              }>
              {t === 'weaknesses' ? '⚠️ Weak Spots' : t === 'sessions' ? '📋 Sessions' : '🎯 Style'}
            </button>
          ))}
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 pb-8 native-scroll">

          {/* ── Weaknesses tab ── */}
          {tab === 'weaknesses' && (
            <div className="flex flex-col gap-2">
              {!hasWeaknesses ? (
                <div className="text-center py-8">
                  <p className="text-4xl mb-3">🎉</p>
                  <p className="text-white/60 text-sm">No weak spots recorded yet.</p>
                  <p className="text-white/30 text-xs mt-1">Novo learns as you study.</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-white/30 mb-1">Novo will proactively revisit these topics with you.</p>
                  {context.top_weaknesses.map(w => (
                    <div key={w.id}
                      className="flex items-start gap-3 rounded-2xl p-3"
                      style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white/85 leading-snug">{w.content}</p>
                        {(w.topic || w.subject) && (
                          <p className="text-[11px] mt-1" style={{ color: 'rgba(248,113,113,0.7)' }}>
                            {[w.subject, w.topic].filter(Boolean).join(' › ')}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="w-1 h-3 rounded-full"
                              style={{ background: i < Math.round(w.importance / 2) ? '#EF4444' : 'rgba(255,255,255,0.1)' }} />
                          ))}
                        </div>
                        <button
                          onClick={() => w.id && deleteMemory(w.id)}
                          disabled={deletingId === w.id}
                          className="w-7 h-7 rounded-xl flex items-center justify-center transition-all active:scale-90"
                          style={{ background: 'rgba(255,255,255,0.06)' }}>
                          <Trash2 size={12} className={deletingId === w.id ? 'text-white/20' : 'text-white/40'} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {context.recent_strengths.length > 0 && (
                    <>
                      <p className="text-xs text-white/30 mt-3 mb-1">Recent strengths</p>
                      {context.recent_strengths.map(s => (
                        <div key={s.id}
                          className="flex items-center gap-3 rounded-2xl p-3"
                          style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                          <p className="text-sm text-white/85 flex-1 leading-snug">{s.content}</p>
                          <ChevronRight size={13} className="text-emerald-400/50 shrink-0" />
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Sessions tab ── */}
          {tab === 'sessions' && (
            <div className="flex flex-col gap-2">
              {!hasSessions ? (
                <div className="text-center py-8">
                  <p className="text-4xl mb-3">📚</p>
                  <p className="text-white/60 text-sm">No sessions recorded yet.</p>
                  <p className="text-white/30 text-xs mt-1">Complete a quiz, tutoring session, or chat to build history.</p>
                </div>
              ) : context.session_summaries.map((s, i) => (
                <div key={i}
                  className="rounded-2xl p-3"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-primary/70">{SOURCE_ICON[s.source] ?? <Calendar size={11} />}</span>
                    <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wide">{s.source}</span>
                    {s.topic && <span className="text-[10px] text-white/30">· {s.topic}</span>}
                    <span className="ml-auto text-[10px] text-white/25">
                      {new Date(s.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  <p className="text-sm text-white/75 leading-relaxed">{s.summary}</p>
                  {s.struggles && s.struggles.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {s.struggles.slice(0, 3).map((st, j) => (
                        <span key={j} className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(239,68,68,0.12)', color: '#FCA5A5' }}>
                          ⚠ {st.length > 40 ? st.slice(0, 40) + '…' : st}
                        </span>
                      ))}
                    </div>
                  )}
                  {s.wins && s.wins.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {s.wins.slice(0, 2).map((w, j) => (
                        <span key={j} className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(34,197,94,0.12)', color: '#86EFAC' }}>
                          ✓ {w}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Style tab ── */}
          {tab === 'style' && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-white/40 mb-1">How Novo explains things to you. Novo also auto-detects this from your messages.</p>
              {(Object.entries(STYLE_CONFIG) as [ExplanationStyle, typeof STYLE_CONFIG[ExplanationStyle]][]).map(([key, cfg]) => (
                <button key={key} onClick={() => updateStyle(key)} disabled={updatingStyle}
                  className="flex items-center gap-3 rounded-2xl p-4 text-left transition-all active:scale-98"
                  style={activeStyle === key
                    ? { background: 'rgba(91,106,245,0.15)', border: '1.5px solid rgba(91,106,245,0.45)' }
                    : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }
                  }>
                  <span className="text-2xl">{cfg.emoji}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-white">{cfg.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{cfg.desc}</p>
                  </div>
                  {activeStyle === key && (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}>
                      <div className="w-2 h-2 rounded-full bg-white" />
                    </div>
                  )}
                </button>
              ))}
              <p className="text-[11px] text-center mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>
                {updatingStyle ? 'Saving…' : 'Novo will adapt immediately in your next message.'}
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
