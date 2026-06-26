// ═══════════════════════════════════════════════════════════════
// Edora — StudyRoomPage  (Real-Time Group Sprint)
//
// Architecture:
//   • Supabase Realtime channel per room: `study-room:{code}`
//   • Presence  → live online dots (who's in the room)
//   • Broadcast → all game state transitions (zero polling)
//   • DB        → persistent room + member records, scores
//
// State machine: lobby → waiting → studying → generating → quiz → results
//
// Quiz sync: startedAt ms timestamp. Every client independently
// computes currentQuestion = floor((now-startedAt)/(questionDuration+5)*1000).
// 20 s answer + 5 s reveal per question — no host arbitration needed.
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Users, Copy, CheckCircle, XCircle, Crown,
  Zap, Clock, ChevronRight, LogOut, Loader2, Wifi, WifiOff,
  RefreshCw, Trophy,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { geminiJSON } from '@/lib/gemini';
import { track } from '@/lib/analytics';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Toast } from '@capacitor/toast';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { QuizQuestion } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────────
const ROOM_CODE_CHARS    = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0,O,1,I ambiguity
const MAX_MEMBERS        = 5;
const STUDY_DURATION_S   = 300;  // 5 minutes study phase
const QUESTION_DURATION  = 20;   // seconds to answer
const REVEAL_DURATION    = 5;    // seconds to show correct answer
const TOTAL_PER_Q        = QUESTION_DURATION + REVEAL_DURATION; // 25s per question cycle
const QUIZ_QUESTION_COUNT = 5;
const RESULTS_DELAY_MS   = 3000; // wait for all clients to save scores

const SUBJECTS = ['Mathematics','Physics','Chemistry','Biology','History','English','Economics','Computer Science'];

// ── Types ─────────────────────────────────────────────────────────────────────
type Phase = 'lobby' | 'waiting' | 'studying' | 'generating' | 'quiz' | 'results';

interface RoomMember {
  userId:    string;
  name:      string;
  avatarUrl: string | null;
  score:     number;
  online:    boolean;
}

interface PresenceState {
  userId:    string;
  name:      string;
  avatarUrl: string | null;
}

interface BroadcastStartStudy {
  studyDuration: number;
  startedAt:     number; // Date.now()
}

interface BroadcastStartQuiz {
  questions:        QuizQuestion[];
  startedAt:        number;
  questionDuration: number;
}

interface BroadcastMemberAnswered {
  userId:      string;
  questionIdx: number;
  answerIdx:   number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateRoomCode(): string {
  return Array.from({ length: 6 }, () =>
    ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
  ).join('');
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

async function showToast(text: string) {
  if (Capacitor.isNativePlatform()) await Toast.show({ text, duration: 'short', position: 'bottom' });
}

// ── Avatar placeholder ────────────────────────────────────────────────────────
function Avatar({ name, size = 36, online }: { name: string; size?: number; online?: boolean }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const hue      = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="w-full h-full rounded-full flex items-center justify-center text-white font-semibold"
        style={{ background: `hsl(${hue},55%,52%)`, fontSize: size * 0.38 }}>
        {initials}
      </div>
      {online !== undefined && (
        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white"
          style={{ background: online ? '#10B981' : '#94a3b8' }} />
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function StudyRoomPage() {
  const { user, profile } = useAuth();
  const navigate          = useNavigate();

  // ── Core state ─────────────────────────────────────────────────────────────
  const [phase,      setPhase]      = useState<Phase>('lobby');
  const [lobbyTab,   setLobbyTab]   = useState<'create' | 'join'>('create');
  const [subject,    setSubject]    = useState('');
  const [topic,      setTopic]      = useState('');
  const [codeInput,  setCodeInput]  = useState('');
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(false);

  // ── Room state ─────────────────────────────────────────────────────────────
  const [roomId,      setRoomId]      = useState('');
  const [roomCode,    setRoomCode]    = useState('');
  const [roomTopic,   setRoomTopic]   = useState('');
  const [roomSubject, setRoomSubject] = useState('');
  const [isHost,      setIsHost]      = useState(false);
  const [members,     setMembers]     = useState<RoomMember[]>([]);
  const [connected,   setConnected]   = useState(false);
  const [codeCopied,  setCodeCopied]  = useState(false);

  // ── Study phase ─────────────────────────────────────────────────────────────
  const [studyTimeLeft,  setStudyTimeLeft]  = useState(STUDY_DURATION_S);
  const [studyStartedAt, setStudyStartedAt] = useState<number | null>(null);

  // ── Quiz state ─────────────────────────────────────────────────────────────
  const [questions,      setQuestions]      = useState<QuizQuestion[]>([]);
  const [quizStartedAt,  setQuizStartedAt]  = useState<number | null>(null);
  const [currentQ,       setCurrentQ]       = useState(0);
  const [isRevealPhase,  setIsRevealPhase]  = useState(false);
  const [questionTimeLeft, setQTimeLeft]    = useState(QUESTION_DURATION);
  const [myAnswers,      setMyAnswers]       = useState<(number | null)[]>([]);
  // answerCounts[qIdx][answerIdx] = number of people who chose that option
  const answerCounts  = useRef<Record<number, number[]>>({});
  const [answerTick,  setAnswerTick]  = useState(0); // increment to trigger re-render

  // ── Results ─────────────────────────────────────────────────────────────────
  const [results, setResults] = useState<Array<{ name: string; score: number; userId: string }>>([]);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const channelRef       = useRef<RealtimeChannel | null>(null);
  const phaseRef         = useRef<Phase>('lobby');
  const questionsRef     = useRef<QuizQuestion[]>([]);
  const myAnswersRef     = useRef<(number | null)[]>([]);
  const quizStartedAtRef = useRef<number | null>(null);
  const savedScoreRef    = useRef(false); // prevent double-save
  // Always-current copies used in unmount / beforeunload callbacks
  const roomIdRef        = useRef('');
  const isHostRef        = useRef(false);
  // Current JWT token — kept fresh via auth state listener so it's accessible
  // synchronously inside the beforeunload handler (which cannot await).
  const tokenRef         = useRef<string | null>(null);

  // Keep refs in sync
  useEffect(() => { phaseRef.current         = phase;        }, [phase]);
  useEffect(() => { questionsRef.current     = questions;    }, [questions]);
  useEffect(() => { myAnswersRef.current     = myAnswers;    }, [myAnswers]);
  useEffect(() => { quizStartedAtRef.current = quizStartedAt; }, [quizStartedAt]);
  useEffect(() => { roomIdRef.current        = roomId;       }, [roomId]);
  useEffect(() => { isHostRef.current        = isHost;       }, [isHost]);

  // Keep tokenRef populated so beforeunload can use it synchronously
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      tokenRef.current = data.session?.access_token ?? null;
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      tokenRef.current = session?.access_token ?? null;
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Bug A: back-navigation cleanup ─────────────────────────────────────────
  // Fires when user presses Android hardware back or navigates away in browser.
  // Only active while in a room (phase !== 'lobby').
  useEffect(() => {
    if (phase === 'lobby' || phase === 'results') return;

    // Web: clean up DB state when tab closes / page navigates away.
    // keepalive:true tells the browser to carry the request to completion
    // even after the page is unloaded — far more reliable than a plain fetch.
    // We use raw fetch (not the Supabase client) because:
    //   a) keepalive is not exposed by the Supabase JS client
    //   b) beforeunload must be synchronous — no await allowed
    const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string;
    const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

    const handleBeforeUnload = () => {
      const rId   = roomIdRef.current;
      const uid   = user?.id;
      const host  = isHostRef.current;
      const token = tokenRef.current;
      if (!rId || !uid || !token) return;

      const headers = {
        'Authorization': `Bearer ${token}`,
        'apikey': SUPA_KEY,
        'Content-Type': 'application/json',
      };

      // Remove this user from the member list
      fetch(
        `${SUPA_URL}/rest/v1/study_room_members?room_id=eq.${rId}&user_id=eq.${uid}`,
        { method: 'DELETE', headers, keepalive: true },
      );

      // If host, mark room complete so other members don't see a dead room
      if (host) {
        fetch(
          `${SUPA_URL}/rest/v1/study_rooms?id=eq.${rId}`,
          { method: 'PATCH', headers, body: JSON.stringify({ status: 'complete' }), keepalive: true },
        );
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Native Android: hardware back button
    let backListener: { remove: () => void } | null = null;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('backButton', () => {
        leaveRoom();
      }).then(l => { backListener = l; });
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      backListener?.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Channel setup ──────────────────────────────────────────────────────────
  const setupChannel = useCallback((code: string) => {
    if (!user || !profile) return;

    // Tear down any existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const ch = supabase.channel(`study-room:${code}`, {
      config: {
        broadcast: { self: false }, // host applies own transitions locally
        presence:  { key: user.id },
      },
    });

    // ── Presence sync ────────────────────────────────────────────
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<PresenceState>();
      const online = new Set(
        Object.values(state).flatMap(arr => arr.map(p => p.userId))
      );
      setMembers(prev => prev.map(m => ({ ...m, online: online.has(m.userId) })));
    });

    ch.on('presence', { event: 'join' }, ({ newPresences }) => {
      const joined = newPresences as Array<PresenceState & { presence_ref: string }>;
      setMembers(prev => {
        const existing = new Set(prev.map(m => m.userId));
        const added = joined
          .filter(p => !existing.has(p.userId))
          .map(p => ({ userId: p.userId, name: p.name, avatarUrl: p.avatarUrl, score: 0, online: true }));
        return added.length ? [...prev, ...added] : prev.map(m =>
          joined.some(j => j.userId === m.userId) ? { ...m, online: true } : m
        );
      });
    });

    ch.on('presence', { event: 'leave' }, ({ leftPresences }) => {
      const left = leftPresences as Array<PresenceState & { presence_ref: string }>;
      const leftIds = new Set(left.map(p => p.userId));
      setMembers(prev => prev.map(m => leftIds.has(m.userId) ? { ...m, online: false } : m));
    });

    // ── Broadcast: study phase starts ─────────────────────────────
    ch.on('broadcast', { event: 'room:start-study' }, ({ payload }) => {
      const { studyDuration, startedAt } = payload as BroadcastStartStudy;
      setStudyStartedAt(startedAt);
      setStudyTimeLeft(studyDuration);
      setPhase('studying');
    });

    // ── Broadcast: quiz starts ────────────────────────────────────
    ch.on('broadcast', { event: 'room:start-quiz' }, ({ payload }) => {
      const { questions: qs, startedAt, questionDuration } = payload as BroadcastStartQuiz;
      answerCounts.current = {};
      savedScoreRef.current = false;
      setQuestions(qs);
      setMyAnswers(new Array(qs.length).fill(null));
      setQuizStartedAt(startedAt);
      setCurrentQ(0);
      setIsRevealPhase(false);
      setQTimeLeft(questionDuration);
      setPhase('quiz');
    });

    // ── Broadcast: member answered (for live stats) ───────────────
    ch.on('broadcast', { event: 'room:member-answered' }, ({ payload }) => {
      const { questionIdx, answerIdx } = payload as BroadcastMemberAnswered;
      if (!answerCounts.current[questionIdx]) {
        const q = questionsRef.current[questionIdx];
        answerCounts.current[questionIdx] = new Array(q?.options?.length ?? 4).fill(0);
      }
      answerCounts.current[questionIdx][answerIdx] = (answerCounts.current[questionIdx][answerIdx] ?? 0) + 1;
      setAnswerTick(t => t + 1);
    });

    // ── Subscribe + track presence ────────────────────────────────
    // Bug B fix: on CHANNEL_ERROR / TIMED_OUT, attempt a full re-subscribe
    // after 3 s so the quiz timer (which is time-based, not message-based)
    // keeps running client-side and the user can resume answering.
    ch.subscribe(async (status) => {
      setConnected(status === 'SUBSCRIBED');
      if (status === 'SUBSCRIBED') {
        await ch.track({
          userId:    user.id,
          name:      profile.full_name ?? 'Student',
          avatarUrl: profile.avatar_url ?? null,
        } satisfies PresenceState);
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // Only retry if this channel is still the active one
        setTimeout(() => {
          if (channelRef.current === ch && phaseRef.current !== 'lobby' && phaseRef.current !== 'results') {
            setupChannel(code);
          }
        }, 3000);
      }
    });

    channelRef.current = ch;
  }, [user, profile]);

  // ── Quiz timer — time-based sync ───────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'quiz' || quizStartedAt === null || questions.length === 0) return;

    const tick = () => {
      const elapsed  = Date.now() - quizStartedAt;
      const qIdx     = Math.floor(elapsed / (TOTAL_PER_Q * 1000));
      const withinQ  = (elapsed % (TOTAL_PER_Q * 1000)) / 1000;
      const reveal   = withinQ >= QUESTION_DURATION;
      const timeLeft = reveal ? 0 : Math.max(0, Math.ceil(QUESTION_DURATION - withinQ));

      if (qIdx !== currentQ) {
        setCurrentQ(Math.min(qIdx, questions.length - 1));
        setIsRevealPhase(false);
      }
      setIsRevealPhase(reveal);
      setQTimeLeft(timeLeft);

      // All questions done → save scores then show results
      if (qIdx >= questions.length) {
        saveScoreAndShowResults();
      }
    };

    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, quizStartedAt, questions.length]);

  // ── Study countdown ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'studying' || studyStartedAt === null) return;
    const interval = setInterval(() => {
      const elapsed  = Math.floor((Date.now() - studyStartedAt) / 1000);
      const remaining = Math.max(0, STUDY_DURATION_S - elapsed);
      setStudyTimeLeft(remaining);
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, studyStartedAt]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  // Bug A fix: also clean up DB room state so ghost rooms don't accumulate.
  // Uses refs (not state) to read current values at teardown time.
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      const rId = roomIdRef.current;
      const uid = user?.id;
      const host = isHostRef.current;
      if (rId && uid && phaseRef.current !== 'lobby' && phaseRef.current !== 'results') {
        // Fire-and-forget: remove member row; if host, mark room complete
        supabase.from('study_room_members')
          .delete().eq('room_id', rId).eq('user_id', uid)
          .then(() => {
            if (host) {
              supabase.from('study_rooms')
                .update({ status: 'complete' }).eq('id', rId);
            }
          });
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────
  async function createRoom() {
    if (!user || !profile || !subject) return;
    setLoading(true); setError('');
    try {
      // Generate a unique code (retry up to 5×)
      let code = '';
      for (let i = 0; i < 5; i++) {
        const candidate = generateRoomCode();
        const { count } = await supabase
          .from('study_rooms').select('id', { count: 'exact', head: true })
          .eq('code', candidate);
        if ((count ?? 0) === 0) { code = candidate; break; }
      }
      if (!code) throw new Error('Could not generate a unique room code. Please try again.');

      // Create room
      const { data: room, error: roomErr } = await supabase
        .from('study_rooms')
        .insert({
          code, host_id: user.id, subject, topic,
          status: 'waiting', max_members: MAX_MEMBERS,
        })
        .select('id')
        .single();
      if (roomErr) throw roomErr;

      // Join as first member
      await supabase.from('study_room_members').insert({
        room_id: room.id, user_id: user.id,
        name: profile.full_name ?? 'Host',
        avatar_url: profile.avatar_url ?? null,
      });

      setRoomId(room.id);
      setRoomCode(code);
      setRoomTopic(topic);
      setRoomSubject(subject);
      setIsHost(true);
      setMembers([{
        userId: user.id, name: profile.full_name ?? 'Host',
        avatarUrl: profile.avatar_url ?? null, score: 0, online: true,
      }]);

      setupChannel(code);
      setPhase('waiting');
      track('study_room_created', { room_id: room.id, subject });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room. Please try again.');
    } finally { setLoading(false); }
  }

  async function joinRoom() {
    if (!user || !profile || codeInput.trim().length !== 6) return;
    setLoading(true); setError('');
    const code = codeInput.trim().toUpperCase();

    try {
      // Look up room
      const { data: room, error: roomErr } = await supabase
        .from('study_rooms')
        .select('id, host_id, subject, topic, status, members:study_room_members(count)')
        .eq('code', code)
        .single();

      if (roomErr || !room) throw new Error('Room not found. Check the code and try again.');
      if (room.status === 'complete') throw new Error('This room has already finished.');
      if (room.status === 'quiz') throw new Error('The quiz has already started. You can\'t join mid-quiz.');

      // Check member count
      const { count: memberCount } = await supabase
        .from('study_room_members').select('id', { count: 'exact', head: true })
        .eq('room_id', room.id);
      if ((memberCount ?? 0) >= MAX_MEMBERS) throw new Error(`Room is full (max ${MAX_MEMBERS} members).`);

      // Check not already joined
      const { count: alreadyIn } = await supabase
        .from('study_room_members').select('id', { count: 'exact', head: true })
        .eq('room_id', room.id).eq('user_id', user.id);
      if ((alreadyIn ?? 0) === 0) {
        await supabase.from('study_room_members').insert({
          room_id: room.id, user_id: user.id,
          name: profile.full_name ?? 'Student',
          avatar_url: profile.avatar_url ?? null,
        });
      }

      // Load existing members
      const { data: existingMembers } = await supabase
        .from('study_room_members')
        .select('user_id, name, avatar_url, score')
        .eq('room_id', room.id);

      setRoomId(room.id);
      setRoomCode(code);
      setRoomTopic(room.topic);
      setRoomSubject(room.subject);
      setIsHost(room.host_id === user.id);
      setMembers((existingMembers ?? []).map(m => ({
        userId: m.user_id, name: m.name,
        avatarUrl: m.avatar_url, score: m.score, online: false,
      })));

      setupChannel(code);

      // Restore phase if room already in study mode
      if (room.status === 'studying') setPhase('studying');
      else setPhase('waiting');

      track('study_room_joined', { room_id: room.id, subject: room.subject });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room. Please try again.');
    } finally { setLoading(false); }
  }

  async function startStudying() {
    if (!isHost || !channelRef.current) return;
    const startedAt = Date.now();
    await supabase.from('study_rooms').update({ status: 'studying' }).eq('id', roomId);
    // Apply locally (host doesn't receive own broadcast)
    setStudyStartedAt(startedAt);
    setStudyTimeLeft(STUDY_DURATION_S);
    setPhase('studying');
    // Broadcast to all members
    await channelRef.current.send({
      type: 'broadcast', event: 'room:start-study',
      payload: { studyDuration: STUDY_DURATION_S, startedAt } satisfies BroadcastStartStudy,
    });
    track('study_room_study_started', { room_id: roomId });
  }

  async function startQuiz() {
    if (!isHost || !channelRef.current || !user) return;
    setPhase('generating');
    try {
      // Generate questions via Gemini
      const qs = await geminiJSON<QuizQuestion[]>(
        `Create ${QUIZ_QUESTION_COUNT} clear multiple-choice questions about "${roomTopic || roomSubject}" (${roomSubject}). These are for a real-time group quiz — make questions clear and educational. Return ONLY a valid JSON array with NO markdown: [{"question":"...","options":["A","B","C","D"],"correct_answer":0,"explanation":"..."}]. correct_answer is 0-indexed.`
      );
      if (!Array.isArray(qs) || qs.length === 0) throw new Error('No questions generated');
      const questions = qs.slice(0, QUIZ_QUESTION_COUNT).map((q, i) => ({ ...q, id: `q${i}` }));

      // Save questions to DB for reconnecting clients
      await supabase.from('study_rooms').update({
        status: 'quiz', questions,
        quiz_started_at: Date.now() + 2000, // 2s buffer so broadcast arrives first
      }).eq('id', roomId);

      const startedAt = Date.now() + 2000; // 2s start delay for smooth UX

      // Apply locally
      answerCounts.current = {};
      savedScoreRef.current = false;
      setQuestions(questions);
      setMyAnswers(new Array(questions.length).fill(null));
      setQuizStartedAt(startedAt);
      setCurrentQ(0);
      setIsRevealPhase(false);
      setPhase('quiz');

      // Broadcast with 2s delay payload so members start at the same time as host
      await channelRef.current.send({
        type: 'broadcast', event: 'room:start-quiz',
        payload: { questions, startedAt, questionDuration: QUESTION_DURATION } satisfies BroadcastStartQuiz,
      });
      track('study_room_quiz_started', { room_id: roomId, question_count: questions.length });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate quiz. Please try again.');
      setPhase('studying');
    }
  }

  function submitAnswer(answerIdx: number) {
    if (myAnswers[currentQ] !== null || isRevealPhase || !channelRef.current || !user) return;
    const updated = [...myAnswers];
    updated[currentQ] = answerIdx;
    setMyAnswers(updated);
    // Initialize count array for this question
    const q = questions[currentQ];
    if (!answerCounts.current[currentQ]) {
      answerCounts.current[currentQ] = new Array(q.options.length).fill(0);
    }
    answerCounts.current[currentQ][answerIdx] = (answerCounts.current[currentQ][answerIdx] ?? 0) + 1;
    setAnswerTick(t => t + 1);
    // Broadcast to room
    channelRef.current.send({
      type: 'broadcast', event: 'room:member-answered',
      payload: { userId: user.id, questionIdx: currentQ, answerIdx } satisfies BroadcastMemberAnswered,
    });
  }

  async function saveScoreAndShowResults() {
    if (savedScoreRef.current || !user || !roomId) return;
    savedScoreRef.current = true;

    const qs      = questionsRef.current;
    const answers = myAnswersRef.current;
    const score   = answers.reduce<number>((acc, ans, i) => acc + (ans === qs[i]?.correct_answer ? 1 : 0), 0);
    const answerLog = answers.map((ans, i) => ({
      question_idx: i, answer_idx: ans, is_correct: ans === qs[i]?.correct_answer,
    }));

    // Persist my score
    await supabase.from('study_room_members')
      .update({ score, answers: answerLog })
      .eq('room_id', roomId).eq('user_id', user.id);

    // Host marks room complete
    if (isHost) {
      await supabase.from('study_rooms').update({ status: 'complete' }).eq('id', roomId);
    }

    // Wait for all members' scores to land in DB
    await new Promise(r => setTimeout(r, RESULTS_DELAY_MS));

    // Fetch final leaderboard
    const { data } = await supabase
      .from('study_room_members')
      .select('user_id, name, score')
      .eq('room_id', roomId)
      .order('score', { ascending: false });

    setResults((data ?? []).map(r => ({ userId: r.user_id, name: r.name, score: r.score })));
    setPhase('results');
    track('study_room_quiz_complete', { room_id: roomId, score, total: qs.length });
  }

  async function leaveRoom() {
    if (user && roomId) {
      await supabase.from('study_room_members')
        .delete().eq('room_id', roomId).eq('user_id', user.id);
      if (isHost) {
        await supabase.from('study_rooms')
          .update({ status: 'complete' }).eq('id', roomId);
      }
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setPhase('lobby');
    setRoomId(''); setRoomCode(''); setMembers([]);
    setQuestions([]); setMyAnswers([]); setResults([]);
    setIsHost(false); setError(''); setLoading(false);
  }

  async function copyCode() {
    await navigator.clipboard.writeText(roomCode).catch(() => {});
    setCodeCopied(true);
    await showToast(`Room code ${roomCode} copied!`);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  const onlineCount  = members.filter(m => m.online).length;
  const myScore      = myAnswers.reduce<number>((acc, ans, i) => acc + (ans !== null && ans === questions[i]?.correct_answer ? 1 : 0), 0);

  // ═══════════════════════════════════════════════════════════════
  // Render: Lobby
  // ═══════════════════════════════════════════════════════════════
  if (phase === 'lobby') return (
    <div className="flex flex-col h-full bg-gradient-page">
      <div className="px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ background: 'rgba(8,6,20,0.82)', borderBottom: '1px solid rgba(255,255,255,0.10)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
        <Link to="/sprint" className="touch-target">
          <ArrowLeft size={20} className="text-white" strokeWidth={1.75} />
        </Link>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #10B981, #06B6D4)' }}>
          <Users size={20} className="text-white" />
        </div>
        <div>
          <h2 className="font-heading font-bold text-white text-sm">Study Rooms</h2>
          <p className="text-xs text-muted-foreground">Real-time group study</p>
        </div>
      </div>

      <div className="flex-1 native-scroll pb-nav px-4 py-5 flex flex-col gap-5">
        {/* Tabs */}
        <div className="rounded-2xl p-1 flex gap-1"
          style={{ background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {(['create', 'join'] as const).map(tab => (
            <button key={tab} onClick={() => { setLobbyTab(tab); setError(''); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                lobbyTab === tab ? 'text-white shadow-sm' : 'text-muted-foreground'
              }`}
              style={lobbyTab === tab ? { background: 'linear-gradient(135deg, #10B981, #06B6D4)' } : {}}>
              {tab === 'create' ? 'Create Room' : 'Join Room'}
            </button>
          ))}
        </div>

        {error && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 rounded-2xl px-4 py-3"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <XCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-400 leading-snug">{error}</p>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {/* Create Room */}
          {lobbyTab === 'create' && (
            <motion.div key="create" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
              className="flex flex-col gap-4">
              <div className="rounded-3xl p-5 flex flex-col gap-4"
                style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Subject</p>
                  <div className="grid grid-cols-2 gap-2">
                    {SUBJECTS.map(s => (
                      <button key={s} onClick={() => setSubject(s)}
                        className={`py-2.5 px-3 rounded-xl text-xs font-semibold transition-all border text-left ${
                          subject === s ? 'text-white border-transparent' : 'text-muted-foreground'
                        }`}
                        style={subject === s
                          ? { background: 'linear-gradient(135deg, #10B981, #06B6D4)' }
                          : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl flex items-center px-4 h-11"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <input type="text" placeholder="Topic (e.g. Calculus, World War 2)"
                    value={topic} onChange={e => setTopic(e.target.value)}
                    className="flex-1 bg-transparent text-white placeholder:text-muted-foreground text-sm outline-none"
                    style={{ WebkitUserSelect: 'text', userSelect: 'text' }} />
                </div>
              </div>

              <div className="rounded-2xl p-4 text-xs text-muted-foreground leading-relaxed"
                style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="font-semibold text-white mb-1">How it works</p>
                A 6-character code is generated. Share it with up to {MAX_MEMBERS - 1} friends.
                Study together for 5 minutes, then take a live quiz — same questions, live leaderboard.
              </div>

              <button onClick={createRoom} disabled={!subject || loading}
                className="w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #10B981, #06B6D4)' }}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Users size={18} />}
                {loading ? 'Creating Room…' : 'Create Room'}
              </button>
            </motion.div>
          )}

          {/* Join Room */}
          {lobbyTab === 'join' && (
            <motion.div key="join" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
              className="flex flex-col gap-4">
              <div className="rounded-3xl p-6 flex flex-col items-center gap-5"
                style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="w-16 h-16 rounded-3xl flex items-center justify-center"
                  style={{ background: 'rgba(16,185,129,0.12)' }}>
                  <Users size={30} style={{ color: '#10B981' }} />
                </div>
                <div className="text-center">
                  <p className="font-heading font-bold text-white text-base">Enter Room Code</p>
                  <p className="text-xs text-muted-foreground mt-1">6-character code from your study partner</p>
                </div>
                <input
                  type="text"
                  placeholder="e.g. ABC123"
                  maxLength={6}
                  value={codeInput}
                  onChange={e => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  onKeyDown={e => e.key === 'Enter' && codeInput.length === 6 && joinRoom()}
                  className="w-full text-center text-2xl font-bold tracking-[0.3em] rounded-2xl px-4 py-4 text-white outline-none placeholder:text-muted-foreground placeholder:tracking-normal placeholder:text-base placeholder:font-normal"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', WebkitUserSelect: 'text', userSelect: 'text' }}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
              <button onClick={joinRoom} disabled={codeInput.length !== 6 || loading}
                className="w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #10B981, #06B6D4)' }}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : <ChevronRight size={18} />}
                {loading ? 'Joining…' : 'Join Room'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="h-4" />
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // Render: Waiting Room
  // ═══════════════════════════════════════════════════════════════
  if (phase === 'waiting') return (
    <div className="flex flex-col h-full bg-gradient-page">
      <RoomHeader code={roomCode} subject={roomSubject} topic={roomTopic}
        connected={connected} onLeave={leaveRoom} />

      <div className="flex-1 native-scroll pb-nav px-4 py-5 flex flex-col gap-5">
        {/* Room code — large and copyable */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-5 flex flex-col items-center gap-3"
          style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Room Code</p>
          <div className="flex items-center gap-3">
            <span className="font-heading text-4xl font-black text-white tracking-[0.2em]">{roomCode}</span>
            <button onClick={copyCode}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-90"
              style={{ background: codeCopied ? 'rgba(16,185,129,0.15)' : 'rgba(91,106,245,0.1)' }}>
              {codeCopied ? <CheckCircle size={18} className="text-green-500" /> : <Copy size={18} style={{ color: '#5B6AF5' }} />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground text-center">Share this code with your study partners</p>
        </motion.div>

        {/* Members */}
        <div className="rounded-3xl p-5"
          style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-white">Members</p>
            <span className="text-xs text-muted-foreground">{onlineCount}/{MAX_MEMBERS}</span>
          </div>
          <div className="flex flex-col gap-3">
            {members.map(m => (
              <motion.div key={m.userId} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3">
                <Avatar name={m.name} size={36} online={m.online} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.online ? 'Online' : 'Offline'}</p>
                </div>
                {m.userId === (user?.id ?? '') && isHost && (
                  <span className="flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5"
                    style={{ color: '#FBBF24', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
                    <Crown size={10} /> Host
                  </span>
                )}
              </motion.div>
            ))}
            {members.length < MAX_MEMBERS && (
              <div className="flex items-center gap-3 opacity-40">
                <div className="w-9 h-9 rounded-full border-2 border-dashed border-border flex items-center justify-center">
                  <span className="text-muted-foreground text-lg">+</span>
                </div>
                <p className="text-xs text-muted-foreground">Waiting for more players…</p>
              </div>
            )}
          </div>
        </div>

        {/* Host controls / member waiting */}
        {isHost ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3">
            <button onClick={startStudying} disabled={onlineCount < 1}
              className="w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #10B981, #06B6D4)' }}>
              <Zap size={18} /> Start Studying
            </button>
            <p className="text-xs text-center text-muted-foreground">
              You can start with just yourself, or wait for friends to join.
            </p>
          </motion.div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-3">
            <Loader2 size={16} className="text-muted-foreground animate-spin" />
            <p className="text-sm text-muted-foreground">Waiting for the host to start…</p>
          </div>
        )}
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // Render: Study Phase
  // ═══════════════════════════════════════════════════════════════
  if (phase === 'studying') return (
    <div className="flex flex-col h-full bg-gradient-page">
      <RoomHeader code={roomCode} subject={roomSubject} topic={roomTopic}
        connected={connected} onLeave={leaveRoom} />

      <div className="flex-1 flex flex-col items-center justify-between px-4 py-8">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#10B981' }}>
            Study Phase
          </p>
          <h2 className="font-heading text-xl font-bold text-white">{roomTopic || roomSubject}</h2>
          <p className="text-sm text-muted-foreground mt-1">{roomSubject}</p>
        </div>

        {/* Circular countdown */}
        <div className="relative w-52 h-52">
          {(() => {
            const pct = studyTimeLeft / STUDY_DURATION_S;
            const r   = 88;
            const c   = 2 * Math.PI * r;
            return (
              <svg className="w-52 h-52 -rotate-90">
                <circle cx="104" cy="104" r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="10" fill="none" />
                <motion.circle cx="104" cy="104" r={r}
                  stroke="url(#studyGrad)" strokeWidth="10" fill="none" strokeLinecap="round"
                  strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
                <defs><linearGradient id="studyGrad" x1="0%" y1="0%" x2="100%">
                  <stop offset="0%" stopColor="#10B981" /><stop offset="100%" stopColor="#06B6D4" />
                </linearGradient></defs>
              </svg>
            );
          })()}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Clock size={20} style={{ color: '#10B981' }} className="mb-1" />
            <span className="font-heading text-3xl font-bold text-white">{formatSeconds(studyTimeLeft)}</span>
            <span className="text-xs text-muted-foreground">remaining</span>
          </div>
        </div>

        {/* Study tip */}
        <div className="rounded-3xl p-4 w-full"
          style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-sm text-white leading-relaxed text-center">
            Review your notes, watch a video, or read your textbook.<br />
            A quiz follows this study session!
          </p>
        </div>

        {/* Online members */}
        <div className="flex items-center gap-2">
          {members.filter(m => m.online).map(m => (
            <Avatar key={m.userId} name={m.name} size={30} online />
          ))}
          <span className="text-xs text-muted-foreground ml-1">{onlineCount} studying</span>
        </div>

        {/* Host can start quiz early */}
        {isHost && (
          <button onClick={startQuiz}
            className="w-full py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
            <Zap size={16} /> Everyone Ready? Start Quiz
          </button>
        )}
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // Render: Generating quiz
  // ═══════════════════════════════════════════════════════════════
  if (phase === 'generating') return (
    <div className="flex flex-col h-full bg-gradient-page">
      <RoomHeader code={roomCode} subject={roomSubject} topic={roomTopic}
        connected={connected} onLeave={leaveRoom} />
      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <XCircle size={40} className="text-red-400" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <button onClick={() => { setError(''); setPhase('studying'); }}
            className="px-6 py-3 rounded-2xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
            Go Back
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(91,106,245,0.15), rgba(139,92,246,0.15))' }}>
            <Zap size={36} style={{ color: '#5B6AF5' }} />
          </div>
          <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <div className="text-center">
            <p className="font-heading text-lg font-bold text-white">Building your quiz…</p>
            <p className="text-sm text-muted-foreground mt-1">Novo is generating {QUIZ_QUESTION_COUNT} questions</p>
          </div>
        </div>
      )}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // Render: Quiz
  // ═══════════════════════════════════════════════════════════════
  if (phase === 'quiz' && questions.length > 0) {
    const q         = questions[Math.min(currentQ, questions.length - 1)];
    const myAnswer  = myAnswers[currentQ] ?? null;
    const counts    = answerCounts.current[currentQ] ?? new Array(q?.options.length ?? 4).fill(0);
    const totalAnswered = counts.reduce((a, b) => a + b, 0);

    return (
      <div className="flex flex-col h-full bg-gradient-page">
        <RoomHeader code={roomCode} subject={roomSubject} topic={roomTopic}
          connected={connected} onLeave={leaveRoom} />

        <div className="flex-1 native-scroll pb-nav px-4 py-4 flex flex-col gap-4">
          {/* Progress + timer */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <motion.div className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, #5B6AF5, #8B5CF6)' }}
                animate={{ width: `${((currentQ) / questions.length) * 100}%` }} />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Clock size={13} className={questionTimeLeft <= 5 && !isRevealPhase ? 'text-red-500' : 'text-muted-foreground'} />
              <span className={`text-sm font-bold tabular-nums ${questionTimeLeft <= 5 && !isRevealPhase ? 'text-red-500' : 'text-white'}`}>
                {isRevealPhase ? '·' : questionTimeLeft}
              </span>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {currentQ + 1}/{questions.length}
            </span>
          </div>

          {/* Score so far */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Your score: <span className="font-bold text-white">{myScore}/{currentQ + (isRevealPhase ? 1 : 0)}</span></span>
            {totalAnswered > 0 && isRevealPhase && (
              <span className="text-xs text-muted-foreground">{totalAnswered} answered</span>
            )}
          </div>

          {/* Question */}
          <AnimatePresence mode="wait">
            <motion.div key={`q-${currentQ}`}
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="flex flex-col gap-3">
              <div className="rounded-2xl p-5"
                style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="font-semibold text-white text-sm leading-relaxed">{q?.question}</p>
              </div>

              {q?.options.map((opt, i) => {
                const isCorrect  = i === q.correct_answer;
                const isSelected = i === myAnswer;
                const count      = counts[i] ?? 0;
                const pct        = totalAnswered > 0 ? Math.round((count / totalAnswered) * 100) : 0;

                let optStyle: React.CSSProperties = { background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' };
                let textColor = 'text-white';
                if (isRevealPhase) {
                  if (isCorrect)       { optStyle = { background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)' }; textColor = 'text-[#34D399]'; }
                  else if (isSelected) { optStyle = { background: 'rgba(239,68,68,0.1)',   border: '1px solid rgba(239,68,68,0.3)'  }; textColor = 'text-red-400'; }
                } else if (isSelected) {
                  optStyle = { background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.3)' }; textColor = 'text-[#818CF8]';
                }

                return (
                  <button key={i} onClick={() => submitAnswer(i)}
                    disabled={myAnswer !== null || isRevealPhase}
                    className={`w-full text-left rounded-2xl text-sm font-medium transition-all overflow-hidden relative ${!myAnswer && !isRevealPhase ? 'active:scale-[0.98]' : ''}`}
                    style={optStyle}>
                    <div className="flex items-center gap-3 px-4 py-3 relative z-10">
                      <span className={`w-6 h-6 rounded-lg border flex items-center justify-center text-xs shrink-0 font-bold border-current ${textColor}`}
                        style={{ opacity: 0.7 }}>
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className={`flex-1 ${textColor}`}>{opt}</span>
                      {isRevealPhase && isCorrect  && <CheckCircle size={16} className="text-[#34D399] shrink-0" />}
                      {isRevealPhase && isSelected && !isCorrect && <XCircle size={16} className="text-red-400 shrink-0" />}
                      {isRevealPhase && count > 0 && (
                        <span className="text-[10px] font-bold text-muted-foreground shrink-0">{pct}%</span>
                      )}
                    </div>
                    {/* Answer count bar shown during reveal */}
                    {isRevealPhase && totalAnswered > 0 && (
                      <motion.div className="absolute bottom-0 left-0 h-0.5 rounded-full"
                        style={{ background: isCorrect ? '#10B981' : 'rgba(255,255,255,0.15)' }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }} />
                    )}
                  </button>
                );
              })}

              {/* Reveal explanation */}
              {isRevealPhase && q && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl px-4 py-3 text-xs text-muted-foreground leading-relaxed"
                  style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span className="font-semibold text-white">Explanation: </span>{q.explanation}
                </motion.div>
              )}

              {/* Waiting / answered state */}
              {myAnswer !== null && !isRevealPhase && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex items-center justify-center gap-2 py-1">
                  <Loader2 size={14} className="text-muted-foreground animate-spin" />
                  <p className="text-xs text-muted-foreground">Answer locked in — waiting for reveal</p>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // Render: Results / Leaderboard
  // ═══════════════════════════════════════════════════════════════
  if (phase === 'results') {
    const myUserId = user?.id ?? '';
    return (
      <div className="flex flex-col h-full bg-gradient-page">
        <div className="px-4 py-3 flex items-center gap-3 shrink-0"
          style={{ background: 'rgba(8,6,20,0.82)', borderBottom: '1px solid rgba(255,255,255,0.10)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}>
            <Trophy size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="font-heading font-bold text-white text-sm">Final Results</h2>
            <p className="text-xs text-muted-foreground">{roomTopic || roomSubject}</p>
          </div>
        </div>

        <div className="flex-1 native-scroll pb-nav px-4 py-5 flex flex-col gap-4">
          {/* Winner banner */}
          {results.length > 0 && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="rounded-3xl p-5 text-center"
              style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(239,68,68,0.1))' , border: '1.5px solid rgba(245,158,11,0.3)' }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
                style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}>
                <Trophy size={28} className="text-white" />
              </div>
              <p className="font-heading font-bold text-white text-xl mt-2">{results[0].name}</p>
              <p className="text-muted-foreground text-sm mt-0.5">
                {results[0].score}/{questions.length} correct · Winner!
              </p>
            </motion.div>
          )}

          {/* Leaderboard */}
          <div className="rounded-3xl p-4 flex flex-col gap-2"
            style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {results.map((r, i) => {
              const isMe = r.userId === myUserId;
              const rankLabels = ['1st', '2nd', '3rd'];
              return (
                <motion.div key={r.userId}
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className={`flex items-center gap-3 px-3 py-3 rounded-2xl`}
                  style={isMe ? { background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.3)' } : {}}>
                  <span className="text-xs font-bold w-7 text-center text-muted-foreground">{rankLabels[i] ?? `${i + 1}`}</span>
                  <Avatar name={r.name} size={36} />
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${isMe ? 'text-[#818CF8]' : 'text-white'}`}>
                      {r.name}{isMe ? ' (You)' : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">{r.score}/{questions.length} correct</p>
                  </div>
                  <div className="text-right">
                    <p className="font-heading font-bold text-white text-sm">{r.score * 20}</p>
                    <p className="text-[10px] text-muted-foreground">pts</p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <button onClick={leaveRoom}
            className="w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #10B981, #06B6D4)' }}>
            <RefreshCw size={16} /> Play Again
          </button>
          <button onClick={() => navigate('/sprint')}
            className="w-full py-3 rounded-2xl text-sm font-semibold text-muted-foreground"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            Back to Sprint
          </button>
          <div className="h-4" />
        </div>
      </div>
    );
  }

  return null;
}

// ── Shared Room Header ─────────────────────────────────────────────────────────
function RoomHeader({
  code, subject, topic, connected, onLeave,
}: {
  code: string; subject: string; topic: string;
  connected: boolean; onLeave: () => void;
}) {
  return (
    <div className="px-4 py-3 flex items-center gap-3 shrink-0"
      style={{ background: 'rgba(8,6,20,0.82)', borderBottom: '1px solid rgba(255,255,255,0.10)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
      <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
        style={{ background: 'linear-gradient(135deg, #10B981, #06B6D4)' }}>
        <Users size={20} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <h2 className="font-heading font-bold text-white text-sm">{topic || subject}</h2>
          {connected
            ? <Wifi size={11} className="text-green-500 shrink-0" />
            : <WifiOff size={11} className="text-red-400 shrink-0 animate-pulse" />}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          Room <span className="font-mono font-bold text-white">{code}</span> · {subject}
        </p>
      </div>
      <button onClick={onLeave}
        className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90"
        style={{ background: 'rgba(239,68,68,0.08)' }}>
        <LogOut size={16} className="text-red-400" />
      </button>
    </div>
  );
}
