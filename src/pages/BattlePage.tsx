// ═══════════════════════════════════════════════════════════════════════════
// BattlePage — 1v1 real-time quiz battle
// Route: /battle
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Sword, Zap, Trophy, Clock, Users,
  CheckCircle2, XCircle, Search, Shield, Crown,
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { geminiJSON } from '@/lib/gemini';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BattleQuestion {
  id: string;
  text: string;
  options: string[];
  correct: number;
  explanation: string;
}

interface BattleScore {
  user_id: string;
  score: number;
  time_ms: number;
}

interface BattleState {
  id: string;
  player1_id: string;
  player2_id: string;
  questions: BattleQuestion[];
  status: 'waiting' | 'active' | 'completed';
  winner_id: string | null;
}

interface Opponent {
  id: string;
  full_name: string;
  avatar_url: string | null;
  xp: number;
}

type Phase = 'lobby' | 'searching' | 'countdown' | 'question' | 'answer' | 'result';

const SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'History', 'Geography'];
const QUESTION_TIME = 15; // seconds
const TOTAL_QUESTIONS = 10;

// ── ELO ───────────────────────────────────────────────────────────────────────

interface EloTier { name: string; min: number; color: string; icon: string; }
const ELO_TIERS: EloTier[] = [
  { name: 'Bronze',      min: 0,    color: '#CD7F32', icon: '🥉' },
  { name: 'Silver',      min: 1200, color: '#C0C0C0', icon: '🥈' },
  { name: 'Gold',        min: 1400, color: '#FFD700', icon: '🥇' },
  { name: 'Platinum',    min: 1600, color: '#5B6AF5', icon: '💎' },
  { name: 'Diamond',     min: 1800, color: '#06B6D4', icon: '🔷' },
  { name: 'Grandmaster', min: 2000, color: '#EF4444', icon: '👑' },
];

function getEloTier(elo: number): EloTier {
  return [...ELO_TIERS].reverse().find(t => elo >= t.min) ?? ELO_TIERS[0];
}

function calcEloDelta(myElo: number, oppElo: number, won: boolean, K = 32): number {
  const expected = 1 / (1 + Math.pow(10, (oppElo - myElo) / 400));
  return Math.round(K * ((won ? 1 : 0) - expected));
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ url, name, size = 48 }: { url: string | null; name: string; size?: number }) {
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />;
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg,#7C3AED,#A78BFA)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, color: '#fff',
    }}>{initials}</div>
  );
}

// ── Generate questions via Gemini ─────────────────────────────────────────────
async function generateBattleQuestions(subject: string): Promise<BattleQuestion[]> {
  const prompt = `Generate ${TOTAL_QUESTIONS} rapid-fire MCQs on ${subject} for competitive quiz battle between JEE/NEET students.
Return JSON array: [{ "id": "q1", "text": "...", "options": ["A","B","C","D"], "correct": 0, "explanation": "one line" }]
Rules: medium difficulty, unambiguous answers, no markdown in text, options are 1-2 words or formulas.`;
  try {
    const qs = await geminiJSON<BattleQuestion[]>(prompt);
    return qs.slice(0, TOTAL_QUESTIONS).map((q, i) => ({ ...q, id: `q${i}` }));
  } catch {
    // Fallback sample questions
    return Array.from({ length: TOTAL_QUESTIONS }, (_, i) => ({
      id: `q${i}`,
      text: `${subject} sample question ${i + 1}?`,
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correct: 0,
      explanation: 'Option A is correct.',
    }));
  }
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function BattlePage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [phase, setPhase]               = useState<Phase>('lobby');
  const [subject, setSubject]           = useState('Physics');
  const [battle, setBattle]             = useState<BattleState | null>(null);
  const [opponent, setOpponent]         = useState<Opponent | null>(null);
  const [questions, setQuestions]       = useState<BattleQuestion[]>([]);
  const [qIndex, setQIndex]             = useState(0);
  const [selected, setSelected]         = useState<number | null>(null);
  const [timeLeft, setTimeLeft]         = useState(QUESTION_TIME);
  const [myScore, setMyScore]           = useState(0);
  const [oppScore, setOppScore]         = useState(0);
  const [myAnswers, setMyAnswers]       = useState<(number | null)[]>([]);
  const [countdown, setCountdown]       = useState(3);
  const [inviteId, setInviteId]         = useState<string | null>(null);
  const [battlePassWins, setBattlePassWins] = useState(0);
  const [error, setError]               = useState<string | null>(null);
  const [myElo, setMyElo]               = useState(1200);
  const [oppElo, setOppElo]             = useState(1200);
  const [eloDelta, setEloDelta]         = useState<number | null>(null);

  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef      = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const questionStartRef = useRef<number>(0);
  const botTimeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isBotBattleRef  = useRef(false);

  const currentQ = questions[qIndex];

  // ── Load battle pass wins + ELO ──────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const week = new Date();
    week.setDate(week.getDate() - week.getDay());
    const weekStr = week.toISOString().split('T')[0];
    supabase.from('battle_pass')
      .select('wins')
      .eq('user_id', user.id)
      .eq('week_start', weekStr)
      .maybeSingle()
      .then(({ data }) => setBattlePassWins(data?.wins ?? 0));
    supabase.from('profiles')
      .select('battle_elo')
      .eq('id', user.id)
      .single()
      .then(({ data }) => { if (data?.battle_elo) setMyElo(data.battle_elo); });
  }, [user]);

  // ── Deep-link: accept invite ───────────────────────────────────────────────
  useEffect(() => {
    const id = searchParams.get('invite');
    if (id) acceptInvite(id);
  }, [searchParams]);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);
  }, []);

  // ── Find random match ──────────────────────────────────────────────────────
  async function findMatch() {
    if (!user) return;
    setPhase('searching');
    setError(null);
    track('battle_search_started', { subject });

    // Insert a pending invite (challenged_id = null means random match)
    const { data: invite, error: invErr } = await supabase
      .from('battle_invites')
      .insert({ challenger_id: user.id, subject, status: 'pending' })
      .select()
      .single();

    if (invErr || !invite) { setError('Could not start matchmaking.'); setPhase('lobby'); return; }
    setInviteId(invite.id);

    // Check for another pending invite to join
    const { data: existing } = await supabase
      .from('battle_invites')
      .select('*')
      .eq('subject', subject)
      .eq('status', 'pending')
      .is('challenged_id', null)
      .neq('challenger_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1);

    if (existing && existing.length > 0) {
      await joinInvite(existing[0].id, invite.id);
    } else {
      // Wait for someone to join my invite
      subscribeToInvite(invite.id);
    }
  }

  async function joinInvite(existingInviteId: string, myInviteId: string) {
    if (!user) return;
    // Cancel my own invite
    await supabase.from('battle_invites').update({ status: 'expired' }).eq('id', myInviteId);

    // Claim the existing invite
    const { data: claimed } = await supabase
      .from('battle_invites')
      .update({ challenged_id: user.id, status: 'accepted' })
      .eq('id', existingInviteId)
      .eq('status', 'pending')
      .select()
      .single();

    if (!claimed) { setPhase('lobby'); setError('Match already taken — try again.'); return; }

    // Load opponent
    const opp = await loadProfile(claimed.challenger_id);
    if (opp) {
      setOpponent(opp);
      supabase.from('profiles').select('battle_elo').eq('id', claimed.challenger_id).single()
        .then(({ data }) => { if (data?.battle_elo) setOppElo(data.battle_elo); });
    }
    await startBattle(existingInviteId, claimed.challenger_id, user.id);
  }

  async function acceptInvite(id: string) {
    if (!user) return;
    const { data: inv } = await supabase.from('battle_invites').select('*').eq('id', id).maybeSingle();
    if (!inv || inv.status !== 'pending') { navigate('/battle'); return; }
    setSubject(inv.subject);
    setPhase('searching');
    const opp = await loadProfile(inv.challenger_id);
    if (opp) setOpponent(opp);
    await supabase.from('battle_invites').update({ challenged_id: user.id, status: 'accepted' }).eq('id', id);
    await startBattle(id, inv.challenger_id, user.id);
  }

  // ── Bot battle fallback ────────────────────────────────────────────────────
  async function startBotBattle() {
    if (!user) return;
    isBotBattleRef.current = true;
    const botOpponent: Opponent = { id: 'bot-novo', full_name: 'Novo AI', avatar_url: null, xp: 1800 };
    setOpponent(botOpponent);
    const qs = await generateBattleQuestions(subject);
    setQuestions(qs);
    const fakeId = `bot-${Date.now()}`;
    setBattle({ id: fakeId, player1_id: user.id, player2_id: 'bot-novo', questions: qs, status: 'active', winner_id: null });
    setPhase('countdown');
    startCountdown(qs);
    track('battle_bot_started', { subject });
  }

  function subscribeToInvite(invId: string) {
    const ch = supabase.channel(`invite:${invId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'battle_invites', filter: `id=eq.${invId}`,
      }, async (payload) => {
        const updated = payload.new as Record<string, unknown>;
        if (updated.status === 'accepted' && updated.challenged_id) {
          // Real opponent found — cancel bot fallback
          if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);
          const opp = await loadProfile(updated.challenged_id as string);
          if (opp) setOpponent(opp);
          await startBattle(invId, user!.id, updated.challenged_id as string);
          supabase.removeChannel(ch);
        }
      })
      .subscribe();
    channelRef.current = ch;

    // After 12s with no real opponent, fall back to Novo AI bot
    botTimeoutRef.current = setTimeout(async () => {
      supabase.removeChannel(ch);
      await supabase.from('battle_invites').update({ status: 'expired' }).eq('id', invId).eq('status', 'pending');
      startBotBattle();
    }, 12000);
  }

  async function loadProfile(uid: string): Promise<Opponent | null> {
    const { data } = await supabase.from('profiles').select('id,full_name,avatar_url,xp').eq('id', uid).maybeSingle();
    return data as Opponent | null;
  }

  async function startBattle(inviteId: string, p1: string, p2: string) {
    // Create battle record
    const { data: b } = await supabase
      .from('battles')
      .insert({ player1_id: p1, player2_id: p2, subject, status: 'active' })
      .select()
      .single();
    if (!b) { setPhase('lobby'); setError('Failed to create battle.'); return; }

    // Update invite with battle id
    await supabase.from('battle_invites').update({ battle_id: b.id, status: 'matched' }).eq('id', inviteId);

    // Generate questions
    const qs = await generateBattleQuestions(subject);
    setQuestions(qs);
    setBattle({ id: b.id, player1_id: p1, player2_id: p2, questions: qs, status: 'active', winner_id: null });

    // Subscribe to battle channel for live scores
    subscribeToBattle(b.id);

    // Start countdown
    setPhase('countdown');
    startCountdown(qs);
  }

  function startCountdown(qs: BattleQuestion[]) {
    let c = 3;
    setCountdown(c);
    const iv = setInterval(() => {
      c--;
      if (c <= 0) {
        clearInterval(iv);
        setPhase('question');
        setQIndex(0);
        setMyAnswers(new Array(qs.length).fill(null));
        startQuestionTimer(0, qs);
      } else {
        setCountdown(c);
      }
    }, 1000);
  }

  function startQuestionTimer(idx: number, qs: BattleQuestion[]) {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(QUESTION_TIME);
    setSelected(null);
    questionStartRef.current = Date.now();
    let t = QUESTION_TIME;
    timerRef.current = setInterval(() => {
      t--;
      setTimeLeft(t);
      if (t <= 0) {
        clearInterval(timerRef.current!);
        handleAnswer(null, idx, qs);
      }
    }, 1000);
  }

  function subscribeToBattle(battleId: string) {
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    const ch = supabase.channel(`battle:${battleId}`)
      .on('broadcast', { event: 'score_update' }, (payload) => {
        const { user_id, score } = payload.payload as BattleScore;
        if (user_id !== user?.id) setOppScore(score);
      })
      .subscribe();
    channelRef.current = ch;
  }

  const handleAnswer = useCallback((answerIdx: number | null, idx: number, qs: BattleQuestion[]) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const timeTaken = Date.now() - questionStartRef.current;
    setSelected(answerIdx);
    setPhase('answer');

    const correct = answerIdx === qs[idx].correct;
    const newScore = correct ? myScore + 1 : myScore;
    if (correct) {
      setMyScore(newScore);
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    } else {
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    }

    // Broadcast score (real opponent) or simulate bot answer
    if (isBotBattleRef.current) {
      const botCorrect = Math.random() < 0.65;
      if (botCorrect) {
        const delay = Math.random() * 9000 + 2000;
        setTimeout(() => setOppScore(s => s + 1), delay);
      }
    } else if (channelRef.current && battle) {
      channelRef.current.send({ type: 'broadcast', event: 'score_update', payload: { user_id: user?.id, score: newScore, time_ms: timeTaken } });
    }

    // Update answers
    setMyAnswers(prev => { const a = [...prev]; a[idx] = answerIdx; return a; });

    // Next question after 1.5s
    setTimeout(() => {
      if (idx + 1 < qs.length) {
        setQIndex(idx + 1);
        setPhase('question');
        startQuestionTimer(idx + 1, qs);
      } else {
        finishBattle(newScore, qs);
      }
    }, 1500);
  }, [myScore, battle, user]);

  async function finishBattle(finalScore: number, qs: BattleQuestion[]) {
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase('result');
    if (!battle || !user) return;

    const iWon = finalScore > oppScore || (finalScore === oppScore);
    track('battle_completed', { subject, score: finalScore, total: qs.length, is_bot: isBotBattleRef.current });

    if (iWon) {
      Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    }

    // ── ELO update ────────────────────────────────────────────────────────────
    if (!isBotBattleRef.current) {
      const delta = calcEloDelta(myElo, oppElo, iWon);
      const newElo = Math.max(100, myElo + delta);
      setEloDelta(delta);
      setMyElo(newElo);
      supabase.from('profiles')
        .update({ battle_elo: newElo, battle_elo_updated_at: new Date().toISOString() })
        .eq('id', user.id)
        .then();
    } else {
      // Vs bot: small fixed delta
      const botDelta = iWon ? 8 : -4;
      setEloDelta(botDelta);
      setMyElo(e => Math.max(100, e + botDelta));
      supabase.from('profiles')
        .update({ battle_elo: Math.max(100, myElo + botDelta) })
        .eq('id', user.id)
        .then();
    }

    if (isBotBattleRef.current) {
      if (iWon) {
        await supabase.rpc('increment_xp', { user_id: user.id, amount: 75 });
      }
    } else {
      const winnerId = iWon ? user.id : (opponent?.id ?? user.id);
      const loserId  = iWon ? (opponent?.id ?? user.id) : user.id;
      await supabase.rpc('record_battle_result', {
        p_battle_id: battle.id,
        p_winner_id: winnerId,
        p_loser_id:  loserId,
      });
    }

    setBattle(prev => prev ? { ...prev, winner_id: iWon ? user.id : (opponent?.id ?? ''), status: 'completed' } : prev);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (phase === 'lobby') return <LobbyScreen
    subject={subject} setSubject={setSubject}
    onFind={findMatch} battlePassWins={battlePassWins}
    profile={profile} myElo={myElo} error={error}
  />;

  if (phase === 'searching') return <SearchingScreen subject={subject} isBotFallback={isBotBattleRef.current} />;

  if (phase === 'countdown') return <CountdownScreen count={countdown} opponent={opponent} profile={profile} />;

  if (phase === 'question' || phase === 'answer') return (
    <QuestionScreen
      question={currentQ} qIndex={qIndex} total={TOTAL_QUESTIONS}
      timeLeft={timeLeft} selected={selected} phase={phase}
      myScore={myScore} oppScore={oppScore}
      myName={profile?.full_name ?? 'You'} oppName={opponent?.full_name ?? 'Opponent'}
      myAvatar={profile?.avatar_url ?? null} oppAvatar={opponent?.avatar_url ?? null}
      onAnswer={(i) => handleAnswer(i, qIndex, questions)}
    />
  );

  if (phase === 'result') return (
    <ResultScreen
      myScore={myScore} oppScore={oppScore}
      questions={questions} myAnswers={myAnswers}
      won={battle?.winner_id === user?.id}
      opponent={opponent} profile={profile}
      battlePassWins={battlePassWins}
      isBotBattle={isBotBattleRef.current}
      myElo={myElo} eloDelta={eloDelta}
      onRematch={findMatch} onHome={() => navigate('/home')}
    />
  );

  return null;
}

// ── Lobby Screen ──────────────────────────────────────────────────────────────
function EloTierBadge({ elo }: { elo: number }) {
  const tier = getEloTier(elo);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12, background: `${tier.color}14`, border: `1px solid ${tier.color}33` }}>
      <span style={{ fontSize: 20 }}>{tier.icon}</span>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, color: tier.color }}>{tier.name}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{elo} ELO</div>
      </div>
    </div>
  );
}

function LobbyScreen({ subject, setSubject, onFind, battlePassWins, profile, myElo, error }: {
  subject: string;
  setSubject: (s: string) => void;
  onFind: () => void;
  battlePassWins: number;
  profile: { full_name?: string | null; avatar_url?: string | null } | null;
  myElo: number;
  error: string | null;
}) {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', padding: '0 0 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
        <button aria-label="Go back" onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text)' }}>
          <ChevronLeft size={24} />
        </button>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>1v1 Battle</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Challenge a rival in real-time</div>
        </div>
      </div>

      <div style={{ padding: '24px 20px', maxWidth: 480, margin: '0 auto' }}>
        {/* ELO tier */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Your Rank</div>
          <EloTierBadge elo={myElo} />
          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            {ELO_TIERS.map(t => (
              <div key={t.name} title={t.name} style={{
                flex: 1, height: 4, borderRadius: 2,
                background: myElo >= t.min ? t.color : 'var(--color-border)',
                transition: 'background 0.3s',
              }} />
            ))}
          </div>
        </div>

        {/* Battle pass progress */}
        <div style={{ background: 'var(--color-surface)', borderRadius: 16, padding: '16px 20px', marginBottom: 24, border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Battle Pass — This Week</div>
            <div style={{ fontSize: 12, color: battlePassWins >= 5 ? '#F59E0B' : 'var(--color-text-secondary)' }}>
              {battlePassWins >= 5 ? '🏆 Trophy Earned!' : `${battlePassWins}/5 wins`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} style={{
                flex: 1, height: 8, borderRadius: 4,
                background: i < battlePassWins ? '#F59E0B' : 'var(--color-border)',
                transition: 'background 0.3s',
              }} />
            ))}
          </div>
          {battlePassWins >= 5 && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#F59E0B', textAlign: 'center' }}>
              ⚔️ You've earned this week's trophy badge!
            </div>
          )}
        </div>

        {/* Subject picker */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: 'var(--color-text-secondary)' }}>Choose Subject</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {SUBJECTS.map(s => (
              <button key={s} onClick={() => setSubject(s)} style={{
                padding: '12px 8px', borderRadius: 12, fontSize: 13, fontWeight: 600,
                border: `2px solid ${subject === s ? '#EF4444' : 'var(--color-border)'}`,
                background: subject === s ? 'rgba(239,68,68,0.1)' : 'var(--color-surface)',
                color: subject === s ? '#EF4444' : 'var(--color-text)',
                cursor: 'pointer', transition: 'all 0.2s',
              }}>{s}</button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#EF4444' }}>
            {error}
          </div>
        )}

        {/* Find match button */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onFind}
          style={{
            width: '100%', padding: '16px', borderRadius: 16, border: 'none',
            background: 'linear-gradient(135deg,#EF4444,#DC2626)', color: '#fff',
            fontWeight: 700, fontSize: 16, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}
        >
          <Sword size={20} />
          Find Opponent
        </motion.button>

        {/* How it works */}
        <div style={{ marginTop: 32, background: 'var(--color-surface)', borderRadius: 16, padding: '16px 20px', border: '1px solid var(--color-border)' }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, color: 'var(--color-text-secondary)' }}>HOW IT WORKS</div>
          {[
            { icon: <Search size={16} />, text: '10 questions, 15 seconds each — same for both players' },
            { icon: <Zap size={16} />, text: 'Winner gets +150 XP and a bragging notification' },
            { icon: <Trophy size={16} />, text: '5 wins this week earns a special trophy badge' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: '#EF4444' }}>{item.icon}</span>
              <span style={{ color: 'var(--color-text-secondary)' }}>{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Searching Screen ──────────────────────────────────────────────────────────
function SearchingScreen({ subject, isBotFallback }: { subject: string; isBotFallback: boolean }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
      <motion.div
        animate={{ scale: [1, 1.1, 1], rotate: [0, 10, -10, 0] }}
        transition={{ repeat: Infinity, duration: 1.5 }}
      >
        <Sword size={64} color="#EF4444" />
      </motion.div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Finding Opponent…</div>
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Searching for a {subject} challenger</div>
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginTop: 8, opacity: 0.7 }}>
          No one found in 12s? You'll face Novo AI instead
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {[0, 1, 2].map(i => (
          <motion.div key={i}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ repeat: Infinity, duration: 1, delay: i * 0.3 }}
            style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444' }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Countdown Screen ──────────────────────────────────────────────────────────
function CountdownScreen({ count, opponent, profile }: {
  count: number;
  opponent: Opponent | null;
  profile: { full_name?: string | null; avatar_url?: string | null } | null;
}) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32, padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
        <div style={{ textAlign: 'center' }}>
          <Avatar url={profile?.avatar_url ?? null} name={profile?.full_name ?? 'You'} size={64} />
          <div style={{ marginTop: 8, fontWeight: 600, fontSize: 14 }}>{profile?.full_name ?? 'You'}</div>
        </div>
        <div style={{ fontWeight: 900, fontSize: 24, color: '#EF4444' }}>VS</div>
        <div style={{ textAlign: 'center' }}>
          <Avatar url={opponent?.avatar_url ?? null} name={opponent?.full_name ?? 'Opponent'} size={64} />
          <div style={{ marginTop: 8, fontWeight: 600, fontSize: 14 }}>{opponent?.full_name ?? 'Opponent'}</div>
        </div>
      </div>
      <motion.div
        key={count}
        initial={{ scale: 2, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.5, opacity: 0 }}
        style={{ fontWeight: 900, fontSize: 80, color: '#EF4444' }}
      >
        {count}
      </motion.div>
      <div style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Get ready…</div>
    </div>
  );
}

// ── Question Screen ───────────────────────────────────────────────────────────
function QuestionScreen({
  question, qIndex, total, timeLeft, selected, phase,
  myScore, oppScore, myName, oppName, myAvatar, oppAvatar, onAnswer,
}: {
  question: BattleQuestion;
  qIndex: number; total: number; timeLeft: number;
  selected: number | null; phase: Phase;
  myScore: number; oppScore: number;
  myName: string; oppName: string;
  myAvatar: string | null; oppAvatar: string | null;
  onAnswer: (i: number) => void;
}) {
  const timerPct = (timeLeft / QUESTION_TIME) * 100;
  const timerColor = timeLeft <= 5 ? '#EF4444' : timeLeft <= 10 ? '#F59E0B' : '#10B981';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Score bar */}
      <div style={{ padding: '12px 20px', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar url={myAvatar} name={myName} size={32} />
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{myName}</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#10B981' }}>{myScore}</div>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{qIndex + 1} / {total}</div>
          <div style={{ fontWeight: 700, fontSize: 22, color: timerColor }}>{timeLeft}s</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{oppName}</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#EF4444' }}>{oppScore}</div>
          </div>
          <Avatar url={oppAvatar} name={oppName} size={32} />
        </div>
      </div>

      {/* Timer bar */}
      <div style={{ height: 4, background: 'var(--color-border)' }}>
        <motion.div
          style={{ height: '100%', background: timerColor }}
          animate={{ width: `${timerPct}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      {/* Question */}
      <div style={{ flex: 1, padding: '24px 20px', maxWidth: 480, margin: '0 auto', width: '100%' }}>
        <motion.div
          key={qIndex}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ background: 'var(--color-surface)', borderRadius: 16, padding: '20px', marginBottom: 24, border: '1px solid var(--color-border)', minHeight: 100, display: 'flex', alignItems: 'center' }}
        >
          <p style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.5, margin: 0 }}>{question?.text}</p>
        </motion.div>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {question?.options.map((opt, i) => {
            let bg = 'var(--color-surface)';
            let border = 'var(--color-border)';
            let color = 'var(--color-text)';
            if (phase === 'answer') {
              if (i === question.correct) { bg = 'rgba(16,185,129,0.15)'; border = '#10B981'; color = '#10B981'; }
              else if (i === selected) { bg = 'rgba(239,68,68,0.15)'; border = '#EF4444'; color = '#EF4444'; }
            } else if (selected === i) { bg = 'rgba(96,165,250,0.15)'; border = '#60A5FA'; }

            return (
              <motion.button
                key={i}
                whileTap={{ scale: 0.98 }}
                disabled={phase === 'answer'}
                onClick={() => onAnswer(i)}
                style={{
                  padding: '14px 16px', borderRadius: 12, textAlign: 'left',
                  border: `2px solid ${border}`, background: bg, color,
                  fontWeight: 600, fontSize: 14, cursor: phase === 'answer' ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.2s',
                }}
              >
                <span style={{ fontSize: 12, opacity: 0.6, minWidth: 20 }}>{String.fromCharCode(65 + i)}</span>
                {opt}
                {phase === 'answer' && i === question.correct && <CheckCircle2 size={16} style={{ marginLeft: 'auto' }} />}
                {phase === 'answer' && i === selected && i !== question.correct && <XCircle size={16} style={{ marginLeft: 'auto' }} />}
              </motion.button>
            );
          })}
        </div>

        {phase === 'answer' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ marginTop: 16, padding: '12px 16px', background: 'var(--color-surface)', borderRadius: 12, border: '1px solid var(--color-border)', fontSize: 13, color: 'var(--color-text-secondary)' }}
          >
            💡 {question.explanation}
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ── Result Screen ─────────────────────────────────────────────────────────────
function ResultScreen({ myScore, oppScore, questions, myAnswers, won, opponent, profile, battlePassWins, isBotBattle, myElo, eloDelta, onRematch, onHome }: {
  myScore: number; oppScore: number;
  questions: BattleQuestion[]; myAnswers: (number | null)[];
  won: boolean;
  opponent: Opponent | null;
  profile: { full_name?: string | null; avatar_url?: string | null } | null;
  battlePassWins: number;
  isBotBattle: boolean;
  myElo: number;
  eloDelta: number | null;
  onRematch: () => void; onHome: () => void;
}) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', padding: '0 0 80px' }}>
      {/* Banner */}
      <div style={{
        padding: '40px 20px',
        background: won
          ? 'linear-gradient(135deg,rgba(16,185,129,0.2),rgba(5,150,105,0.1))'
          : 'linear-gradient(135deg,rgba(239,68,68,0.2),rgba(185,28,28,0.1))',
        textAlign: 'center',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ fontSize: 64, marginBottom: 8 }}>{won ? '🏆' : '💪'}</div>
        <div style={{ fontWeight: 900, fontSize: 28, color: won ? '#10B981' : '#EF4444', marginBottom: 4 }}>
          {won ? 'Victory!' : 'Defeated'}
        </div>
        <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
          {won ? (isBotBattle ? '+75 XP earned!' : '+150 XP earned!') : 'Better luck next time'}
        </div>
      </div>

      <div style={{ padding: '20px', maxWidth: 480, margin: '0 auto' }}>
        {/* Score comparison */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, background: 'var(--color-surface)', borderRadius: 16, padding: '16px 20px', border: '1px solid var(--color-border)' }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <Avatar url={profile?.avatar_url ?? null} name={profile?.full_name ?? 'You'} size={48} />
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>{profile?.full_name ?? 'You'}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: won ? '#10B981' : 'var(--color-text)' }}>{myScore}</div>
          </div>
          <div style={{ fontWeight: 700, color: 'var(--color-text-secondary)' }}>VS</div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <Avatar url={opponent?.avatar_url ?? null} name={opponent?.full_name ?? 'Opponent'} size={48} />
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>{opponent?.full_name ?? 'Opponent'}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: !won ? '#EF4444' : 'var(--color-text)' }}>{oppScore}</div>
          </div>
        </div>

        {/* ELO change */}
        {eloDelta !== null && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-surface)', borderRadius: 12, padding: '12px 16px', marginBottom: 16, border: '1px solid var(--color-border)' }}>
            <EloTierBadge elo={myElo} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 2 }}>ELO Change</div>
              <div style={{ fontWeight: 800, fontSize: 22, color: eloDelta >= 0 ? '#10B981' : '#EF4444' }}>
                {eloDelta >= 0 ? '+' : ''}{eloDelta}
              </div>
            </div>
          </div>
        )}

        {/* Battle pass */}
        {won && (
          <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Trophy size={20} color="#F59E0B" />
            <div style={{ fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: '#F59E0B' }}>Battle Pass: {battlePassWins}/5 wins this week</span>
              {battlePassWins >= 5 && ' — Trophy earned! 🏆'}
            </div>
          </div>
        )}

        {/* Answer review */}
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Question Review</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {questions.map((q, i) => {
            const ans = myAnswers[i];
            const correct = ans === q.correct;
            const skipped = ans === null;
            return (
              <div key={i} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-surface)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ marginTop: 2 }}>
                  {skipped ? <Shield size={16} color="#6B7280" /> : correct ? <CheckCircle2 size={16} color="#10B981" /> : <XCircle size={16} color="#EF4444" />}
                </div>
                <div style={{ flex: 1, fontSize: 13 }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>Q{i + 1}: {q.text}</div>
                  {!correct && !skipped && <div style={{ color: '#10B981', fontSize: 12 }}>Correct: {q.options[q.correct]}</div>}
                  {skipped && <div style={{ color: '#6B7280', fontSize: 12 }}>Time expired</div>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12 }}>
          <Button variant="outline" style={{ flex: 1 }} onClick={onHome}>Home</Button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onRematch}
            style={{
              flex: 1, padding: '12px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg,#EF4444,#DC2626)', color: '#fff',
              fontWeight: 700, fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Sword size={16} />
            Rematch
          </motion.button>
        </div>
      </div>
    </div>
  );
}
