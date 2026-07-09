// ═══════════════════════════════════════════════════════════════════════════
// LiveEventPage — synchronized national quiz with live leaderboard
// Route: /live-event
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import {motion} from 'framer-motion';
import {ChevronLeft, Trophy, Zap, CheckCircle, XCircle, PartyPopper} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import type { QuizQuestion } from '@/types';

interface LiveEvent {
  id: string; title: string; description: string | null; subject: string;
  scheduled_at: string; duration_mins: number; question_ids: string[];
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';
  winner_id: string | null; reward_badge: string;
}

interface LeaderRow { user_id: string; score: number; time_secs: number | null; full_name?: string; avatar_url?: string | null; }

function Avatar({ url, name, size = 32 }: { url?: string | null; name: string; size?: number }) {
  const [imgError, setImgError] = useState(false);
  if (url && !imgError) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} onError={() => setImgError(true)} />;
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700, color: 'var(--ink-950)', flexShrink: 0 }}>{initials}</div>
  );
}

function countdownParts(ms: number) {
  const totalSecs = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(totalSecs / 86400), h: Math.floor((totalSecs % 86400) / 3600), m: Math.floor((totalSecs % 3600) / 60), s: totalSecs % 60 };
}

export default function LiveEventPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [event, setEvent]       = useState<LiveEvent | null>(null);
  const [countdown, setCountdown] = useState({ d: 0, h: 0, m: 0, s: 0 });
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [phase, setPhase]       = useState<'waiting' | 'quiz' | 'done'>('waiting');
  const [current, setCurrent]   = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore]       = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [answers, setAnswers]   = useState<Array<{ question_id: string; chosen_idx: number }>>([]);
  const [leaders, setLeaders]   = useState<LeaderRow[]>([]);
  const [loading, setLoading]   = useState(true);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadEvent(); return () => { if (tickRef.current) clearInterval(tickRef.current); }; }, []);

  async function loadEvent() {
    setLoading(true);
    const { data } = await supabase
      .from('live_events')
      .select('*')
      .in('status', ['scheduled', 'live'])
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!data) { setEvent(null); setLoading(false); return; }
    setEvent(data as LiveEvent);
    setLoading(false);

    tickRef.current = setInterval(() => {
      const diff = new Date(data.scheduled_at).getTime() - Date.now();
      setCountdown(countdownParts(diff));
      if (diff <= 0 && data.status === 'scheduled') {
        loadEvent(); // re-check status flips to live
      }
    }, 1000);

    loadLeaders(data.id);

    const channel = supabase.channel(`live_event_${data.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_event_participants', filter: `event_id=eq.${data.id}` },
        () => loadLeaders(data.id))
      .subscribe();

    return () => { channel.unsubscribe(); };
  }

  async function loadLeaders(eventId: string) {
    const { data } = await supabase
      .from('live_event_participants')
      .select('user_id, score, time_secs')
      .eq('event_id', eventId)
      .order('score', { ascending: false })
      .order('time_secs', { ascending: true })
      .limit(20);

    if (!data?.length) { setLeaders([]); return; }
    const ids = data.map(d => d.user_id);
    const { data: profiles } = await supabase.from('profiles').select('id, full_name, avatar_url').in('id', ids);
    const pMap: Record<string, { full_name: string; avatar_url: string | null }> = {};
    (profiles ?? []).forEach(p => { pMap[p.id] = { full_name: p.full_name ?? 'Student', avatar_url: p.avatar_url }; });
    setLeaders(data.map(d => ({ ...d, full_name: pMap[d.user_id]?.full_name, avatar_url: pMap[d.user_id]?.avatar_url })));
  }

  async function startEvent() {
    if (!event?.question_ids.length) return;
    const { data } = await supabase.from('pyq_content').select('*').in('id', event.question_ids);
    if (!data?.length) return;
    type PyqOption = { text: string; label: string; correct: boolean };
    setQuestions(data.map((q: { id: string; question_text: string; options: PyqOption[]; solution_text?: string }) => ({
      id: q.id,
      question: q.question_text,
      options: q.options.map(o => o.text),
      correct_answer: q.options.findIndex(o => o.correct),
      explanation: q.solution_text ?? '' })));
    setAnswers([]);
    setStartTime(Date.now());
    setPhase('quiz');
    track('live_event_started', { event_id: event.id });
  }

  function handleSelect(idx: number) {
    if (selected !== null) return;
    const q = questions[current];
    setSelected(idx);
    // Track answer for server-side grading submission
    setAnswers(prev => [...prev, { question_id: q.id, chosen_idx: idx }]);
    // Local score only for immediate UI feedback — not sent to server
    if (idx === q?.correct_answer) setScore(s => s + 1);

    setTimeout(() => {
      if (current < questions.length - 1) {
        setCurrent(c => c + 1);
        setSelected(null);
      } else {
        finishEvent();
      }
    }, 900);
  }

  async function finishEvent() {
    if (!event) return;
    const timeSecs = Math.round((Date.now() - startTime) / 1000);
    // Server grades answers against pyq_questions.correct_idx — client score
    // is only used for local UI feedback and replaced by the server's result.
    const { data: result, error: submitErr } = await supabase.rpc('submit_live_event_answers', {
      p_event_id:  event.id,
      p_answers:   answers,
      p_time_secs: timeSecs,
    });
    if (submitErr) console.error('[live_event] submit_live_event_answers failed, falling back to client score:', submitErr.message);
    const serverScore = (result as { score?: number } | null)?.score ?? score;
    setScore(serverScore);
    track('live_event_completed', { event_id: event.id, score: serverScore, time_secs: timeSecs });
    setPhase('done');
    loadLeaders(event.id);
  }

  const cfg = { gradient: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' };
  const isLive = event?.status === 'live';
  const myRank = leaders.findIndex(l => l.user_id === user?.id) + 1;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <button aria-label="Go back" onClick={() => navigate(-1)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'var(--ink-060)' }}>
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="font-heading text-lg font-bold text-white flex-1">Live Events</h1>
      </div>

      <div className="flex-1 px-5 pb-nav overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>
        ) : !event ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <div className="w-16 h-16 rounded-3xl flex items-center justify-center" style={{ background: 'rgba(91,106,245,0.12)' }}><PartyPopper size={26} style={{ color: '#A0AEFF' }} strokeWidth={1.6} /></div>
            <p className="text-white/60 text-sm">No live events scheduled right now.<br />Check back Sunday at 5 PM!</p>
          </div>
        ) : phase === 'waiting' ? (
          <div className="pt-6">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-3xl p-6 text-center mb-6" style={{ background: 'var(--ink-055)', border: '1px solid var(--ink-070)' }}>
              <PartyPopper size={36} className="mx-auto mb-3" style={{ color: '#A0AEFF' }} strokeWidth={1.5} />
              <h2 className="font-heading text-xl font-bold text-white mb-1">{event.title}</h2>
              {event.description && <p className="text-sm text-white/50 mb-4">{event.description}</p>}

              {isLive ? (
                <Button onClick={startEvent} className="w-full" style={{ background: cfg.gradient }}>
                  <Zap className="w-4 h-4 mr-1.5" /> Join Now — Live!
                </Button>
              ) : (
                <div className="flex justify-center gap-3 mt-2">
                  {[{ v: countdown.d, l: 'days' }, { v: countdown.h, l: 'hrs' }, { v: countdown.m, l: 'min' }, { v: countdown.s, l: 'sec' }].map(c => (
                    <div key={c.l} className="rounded-2xl px-3 py-2.5 text-center" style={{ background: 'var(--ink-050)', minWidth: 60 }}>
                      <p className="font-heading text-2xl font-bold text-white">{String(c.v).padStart(2, '0')}</p>
                      <p className="text-xs text-white/40">{c.l}</p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

            <div className="rounded-2xl p-4 mb-6 flex items-center gap-3" style={{ background: 'rgba(91,106,245,0.08)', border: '1px solid rgba(91,106,245,0.2)' }}>
              <Trophy className="w-6 h-6 flex-shrink-0" style={{ color: '#FBBF24' }} />
              <div>
                <p className="text-sm font-semibold text-white">{event.reward_badge}</p>
                <p className="text-xs text-white/50">Winner gets 30 days of Pro free</p>
              </div>
            </div>

            {leaders.length > 0 && (
              <>
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">Live Leaderboard</p>
                <div className="flex flex-col gap-2">
                  {leaders.slice(0, 10).map((l, i) => (
                    <div key={l.user_id} className="flex items-center gap-3 p-2.5 rounded-2xl" style={{ background: 'var(--ink-045)' }}>
                      <span className="w-6 text-center text-sm font-bold" style={{ color: i < 3 ? '#FBBF24' : 'var(--ink-400)' }}>{i + 1}</span>
                      <Avatar url={l.avatar_url} name={l.full_name ?? ''} />
                      <span className="flex-1 text-sm text-white truncate">{l.full_name}{l.user_id === user?.id ? ' (you)' : ''}</span>
                      <span className="text-sm font-bold" style={{ color: '#A0AEFF' }}>{l.score}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : phase === 'quiz' && questions[current] ? (
          <div className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-white/40">Question {current + 1}/{questions.length}</span>
              <span className="text-xs font-semibold" style={{ color: '#A0AEFF' }}>Score: {score}</span>
            </div>
            <p className="text-base font-semibold text-white mb-5 leading-relaxed">{questions[current].question}</p>
            <div className="flex flex-col gap-2.5">
              {questions[current].options.map((opt, i) => {
                const isCorrect = i === questions[current].correct_answer;
                const isSelected = i === selected;
                let bg = 'var(--ink-050)';
                let border = 'var(--ink-080)';
                if (selected !== null && isCorrect) { bg = 'rgba(16,185,129,0.15)'; border = 'rgba(16,185,129,0.4)'; }
                else if (isSelected) { bg = 'rgba(239,68,68,0.15)'; border = 'rgba(239,68,68,0.4)'; }
                return (
                  <button key={i} onClick={() => handleSelect(i)} disabled={selected !== null}
                    className="flex items-center justify-between px-4 py-3.5 rounded-2xl text-sm text-left text-white"
                    style={{ background: bg, border: `1px solid ${border}` }}>
                    {opt}
                    {selected !== null && isCorrect && <CheckCircle className="w-4 h-4" style={{ color: '#34D399' }} />}
                    {selected !== null && isSelected && !isCorrect && <XCircle className="w-4 h-4" style={{ color: '#F87171' }} />}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <Trophy size={44} className="mb-2" style={{ color: '#FBBF24' }} strokeWidth={1.4} />
            <h2 className="font-heading text-2xl font-bold text-white">{score}/{questions.length}</h2>
            <p className="text-sm text-white/50">Your score has been submitted!</p>
            {myRank > 0 && <p className="text-sm font-semibold" style={{ color: '#A0AEFF' }}>You're ranked #{myRank} right now</p>}
            <Button onClick={() => setPhase('waiting')} className="mt-4" style={{ background: cfg.gradient }}>View Leaderboard</Button>
          </div>
        )}
      </div>
    </div>
  );
}
