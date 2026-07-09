// Route: /doubt-room
// AI-powered Q&A: student types a doubt, Novo answers instantly.
// Thread stored in Supabase `doubt_threads` table.

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {ArrowLeft, Send, Sparkles, BookOpen, Loader2} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { geminiCall } from '@/lib/gemini';
import { getLangInstruction } from '@/lib/language';
import { track } from '@/lib/analytics';

interface Doubt {
  id: string;
  question: string;
  answer: string | null;
  subject: string | null;
  created_at: string;
  answering?: boolean;
}

const SUBJECTS = ['Physics', 'Chemistry', 'Maths', 'Biology', 'History', 'English', 'General'];

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DoubtRoomPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [doubts, setDoubts]   = useState<Doubt[]>([]);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState('');
  const [subject, setSubject]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadDoubts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('doubt_threads')
      .select('id, question, answer, subject, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setDoubts((data ?? []) as Doubt[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadDoubts(); }, [loadDoubts]);

  async function submitDoubt() {
    const q = question.trim();
    if (!q || submitting || !user) return;
    setSubmitting(true);
    setQuestion('');
    track('doubt_asked', { subject });

    // Optimistic insert
    const tempId = crypto.randomUUID();
    const optimistic: Doubt = {
      id: tempId, question: q, answer: null,
      subject: subject || null,
      created_at: new Date().toISOString(),
      answering: true };
    setDoubts(prev => [optimistic, ...prev]);

    // Scroll to top to show new doubt
    setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 50);

    try {
      const langInstr = getLangInstruction(profile?.preferred_language);
      const subjectCtx = subject ? `Subject: ${subject}. ` : '';
      const prompt = `You are Novo, an expert AI tutor for Indian students (JEE/NEET/Board exams).
${subjectCtx}Student asks: ${q}

Give a clear, concise explanation (3-5 sentences max). Use simple language. If it's a formula or equation, write it plainly.${langInstr}`;

      const answer = await geminiCall(prompt);

      // Persist to DB
      const { data: row } = await supabase
        .from('doubt_threads')
        .insert({ user_id: user.id, question: q, answer, subject: subject || null })
        .select('id, question, answer, subject, created_at')
        .single();

      if (row) {
        setDoubts(prev => prev.map(d => d.id === tempId ? { ...row as Doubt } : d));
      }
    } catch {
      setDoubts(prev => prev.map(d =>
        d.id === tempId
          ? { ...d, answer: 'Sorry, something went wrong. Please try again.', answering: false }
          : d
      ));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg, #0B0E1F)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 shrink-0"
        style={{ borderBottom: '1px solid var(--ink-060)' }}>
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'var(--ink-060)' }}>
          <ArrowLeft size={18} className="text-white" />
        </button>
        <div className="flex-1">
          <h1 className="font-heading font-bold text-white text-base">Doubt Room</h1>
          <p className="text-xs" style={{ color: 'var(--ink-400)' }}>Ask Novo anything</p>
        </div>
        <div className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}>
          <Sparkles size={15} className="text-white" />
        </div>
      </div>

      {/* Thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="text-white/30 animate-spin" />
          </div>
        ) : doubts.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(91,106,245,0.12)' }}>
              <BookOpen size={28} style={{ color: '#A0AEFF' }} />
            </div>
            <p className="font-heading text-base font-bold text-white">No doubts yet</p>
            <p className="text-sm" style={{ color: 'var(--ink-400)' }}>
              Ask your first question — Novo will explain it clearly.
            </p>
          </motion.div>
        ) : (
          <AnimatePresence initial={false}>
            {doubts.map((d, i) => (
              <motion.div key={d.id}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i === 0 ? 0 : i * 0.03 }}
                className="rounded-2xl overflow-hidden"
                style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-070)' }}>
                {/* Question */}
                <div className="px-4 pt-3.5 pb-2.5">
                  <div className="flex items-center gap-2 mb-2">
                    {d.subject && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(91,106,245,0.15)', color: '#A0AEFF' }}>
                        {d.subject}
                      </span>
                    )}
                    <span className="text-xs" style={{ color: 'var(--ink-300)' }}>{timeAgo(d.created_at)}</span>
                  </div>
                  <p className="text-sm font-semibold text-white leading-relaxed">{d.question}</p>
                </div>
                {/* Answer */}
                <div className="px-4 pb-3.5 pt-2.5" style={{ borderTop: '1px solid var(--ink-050)' }}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Sparkles size={11} style={{ color: '#A0AEFF' }} />
                    <span className="text-xs font-bold" style={{ color: '#A0AEFF' }}>Novo</span>
                  </div>
                  {d.answering || !d.answer ? (
                    <div className="flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" style={{ color: '#A0AEFF' }} />
                      <span className="text-sm" style={{ color: 'var(--ink-400)' }}>Thinking…</span>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-800)' }}>{d.answer}</p>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        <div className="h-2" />
      </div>

      {/* Input */}
      <div className="shrink-0 px-4 pb-nav pt-3" style={{ borderTop: '1px solid var(--ink-060)' }}>
        {/* Subject chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2">
          {SUBJECTS.map(s => (
            <button key={s} onClick={() => setSubject(subject === s ? '' : s)}
              className="px-3 py-1 rounded-xl text-xs font-semibold flex-shrink-0 transition-all"
              style={{
                background: subject === s ? 'rgba(91,106,245,0.25)' : 'var(--ink-050)',
                color: subject === s ? '#A0AEFF' : 'var(--ink-400)',
                border: `1px solid ${subject === s ? 'rgba(91,106,245,0.4)' : 'var(--ink-070)'}` }}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitDoubt(); } }}
            placeholder="Type your doubt…"
            rows={2}
            className="flex-1 px-4 py-2.5 rounded-2xl text-sm resize-none outline-none"
            style={{
              background: 'var(--ink-060)',
              border: '1px solid var(--ink-080)',
              color: 'var(--ink-900)' }}
          />
          <button
            onClick={submitDoubt}
            disabled={!question.trim() || submitting}
            className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-opacity disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}>
            {submitting ? <Loader2 size={16} className="text-white animate-spin" /> : <Send size={16} className="text-white" />}
          </button>
        </div>
      </div>
    </div>
  );
}
