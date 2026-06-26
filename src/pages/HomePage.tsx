import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flame, Star, Bell, Play, CalendarClock, X, ChevronRight,
  Sparkles, Zap, Bot, BookMarked, Target, Clock,
  Calculator, Atom, FlaskConical, Microscope, BookOpen,
  BarChart3, Code2, AlertTriangle, Snowflake, ArrowRight,
  Trophy, TrendingUp, CheckCircle2, Circle, Gift, Music, Timer,
  GraduationCap, TrendingDown, Siren, BookCheck,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { getLevelFromXP, getXPForLevel } from '@/lib/utils';
import { HomePageSkeleton } from '@/components/ui/skeleton';
import { NovoInsightsCard } from '@/components/insights/NovoInsightsCard';
import { TeachingIcon } from '@/components/ui/icons';
import { DailyPowerRing } from '@/components/home/DailyPowerRing';
import { ConceptOfDayCard } from '@/components/home/ConceptOfDayCard';
import { StreakFreezeShop } from '@/components/home/StreakFreezeShop';
import { useAchievementCard } from '@/hooks/useAchievementCard';
import AchievementCardModal from '@/components/AchievementCardModal';
import { updateHomeWidget } from '@/plugins/EdoraWidgetPlugin';
import { MoodCheckIn } from '@/components/home/MoodCheckIn';
import { WarRoomBanner } from '@/components/home/WarRoomBanner';
import { FocusModeOverlay } from '@/components/study/FocusModeOverlay';
import { SpotifyBreakPlayer } from '@/components/study/SpotifyBreakPlayer';
import { lessonIdToLabel } from '@/hooks/useStudyContext';
import { OnboardingTour } from '@/components/onboarding/OnboardingTour';
import type { NovoProactiveMessage, SprintSession } from '@/types';
import { useD30RetentionVariant } from '@/hooks/useExperiment';

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysUntil(dateStr: string) {
  const today = new Date(); today.setHours(0,0,0,0);
  const exam  = new Date(dateStr); exam.setHours(0,0,0,0);
  return Math.ceil((exam.getTime() - today.getTime()) / 86_400_000);
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'Night Owl Mode';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return       'Burning midnight oil';
}

const SUBJECT_ICON: Record<string, React.ComponentType<{ size?: number | string; className?: string; style?: React.CSSProperties }>> = {
  Mathematics: Calculator, Physics: Atom, Chemistry: FlaskConical, Biology: Microscope,
  English: BookOpen, History: BarChart3, Economics: BarChart3, 'Computer Science': Code2,
  Science: Atom,
};
const SUBJECT_COLOR: Record<string, string> = {
  Mathematics: '#93C5FD', Physics: '#C4B5FD', Chemistry: '#6EE7B7', Biology: '#86EFAC',
  English: '#FCA5A5', History: '#FDE68A', Economics: '#A5F3FC', 'Computer Science': '#DDD6FE',
  Science: '#C4B5FD',
};

function todayKey(uid: string) { return `challenges_${uid}_${new Date().toISOString().slice(0, 10)}`; }
function getAwardedSet(uid: string): Set<string> { try { return new Set<string>(JSON.parse(localStorage.getItem(todayKey(uid)) ?? '[]')); } catch { return new Set<string>(); } }
function markAwarded(uid: string, id: string) { const s = getAwardedSet(uid); s.add(id); localStorage.setItem(todayKey(uid), JSON.stringify([...s])); }

// ── XP ring ───────────────────────────────────────────────────────────────────
function XPRing({ progress, size = 56 }: { progress: number; size?: number }) {
  const stroke = 4; const r = (size - stroke) / 2; const circ = 2 * Math.PI * r;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <motion.circle cx={size/2} cy={size/2} r={r} fill="none" stroke="white" strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (progress / 100) * circ }}
          transition={{ duration: 1, ease: 'easeOut' }}
          style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.6))' }} />
      </svg>
      <Play size={10} className="fill-white text-white ml-0.5" />
    </div>
  );
}

// ── Rival status badge ────────────────────────────────────────────────────────
function RivalBadge({ userId }: { userId: string }) {
  const [rivalName, setRivalName] = useState<string | null>(null);
  const [delta, setDelta]         = useState<number | null>(null);
  const [myXP, setMyXP]           = useState(0);
  const [rivalXP, setRivalXP]     = useState(0);
  const [loaded, setLoaded]       = useState(false);

  useEffect(() => {
    (async () => {
      const { data: rival } = await supabase.from('rivals').select('rival_id').eq('user_id', userId).limit(1).single();
      if (!rival) { setLoaded(true); return; }
      const [{ data: rp }, { data: mp }] = await Promise.all([
        supabase.from('profiles').select('full_name,xp').eq('id', rival.rival_id).single(),
        supabase.from('profiles').select('xp').eq('id', userId).single(),
      ]);
      if (rp) { setRivalName(rp.full_name?.split(' ')[0] ?? 'Rival'); setRivalXP(rp.xp ?? 0); }
      if (mp) setMyXP(mp.xp ?? 0);
      if (rp && mp) setDelta((mp.xp ?? 0) - (rp.xp ?? 0));
      setLoaded(true);
    })();
  }, [userId]);

  if (!loaded || !rivalName) return null;
  const ahead = (delta ?? 0) >= 0;

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-2xl"
      style={{
        background: ahead ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
        border: `1px solid ${ahead ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
      }}
    >
      <Trophy size={12} style={{ color: ahead ? '#10B981' : '#EF4444' }} />
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: ahead ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.6)' }}>
          vs {rivalName}
        </p>
        <p className="text-xs font-bold text-white leading-none">
          {ahead ? '+' : ''}{delta} XP {ahead ? 'ahead' : 'behind'}
        </p>
      </div>
      <TrendingUp size={12} style={{ color: ahead ? '#10B981' : '#EF4444', transform: ahead ? 'none' : 'scaleY(-1)' }} />
    </div>
  );
}

// ── Continue hero card ────────────────────────────────────────────────────────
interface ContinueHero { type: 'sprint'|'quiz'|'flashcard'|'chat'; subject: string; topic: string; to: string; meta: string; }

function ContinueCard({ hero, loading }: { hero: ContinueHero | null; loading: boolean }) {
  const navigate = useNavigate();
  const typeLabel: Record<string, string> = { sprint: 'Continue Sprint', quiz: 'Continue Quiz', flashcard: 'Review Cards', chat: 'Chat with Novo' };
  const typeColor: Record<string, [string, string]> = {
    sprint:    ['#F59E0B','#EF4444'],
    quiz:      ['#EC4899','#8B5CF6'],
    flashcard: ['#10B981','#06B6D4'],
    chat:      ['#5B6AF5','#8B5CF6'],
  };
  const [c1, c2] = hero ? typeColor[hero.type] : ['#5B6AF5','#8B5CF6'];

  return (
    <div
      className="rounded-3xl overflow-hidden active:scale-98 transition-transform cursor-pointer"
      onClick={() => hero && navigate(hero.to)}
      style={{
        background: 'linear-gradient(135deg,#1A1350 0%,#0E0C2A 100%)',
        border: '1px solid rgba(91,106,245,0.25)',
        boxShadow: '0 8px 40px rgba(91,106,245,0.2), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      <div style={{ height: 2, background: `linear-gradient(90deg,${c1},${c2})` }} />
      <div className="p-5">
        {loading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-3 w-28 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} />
            <div className="h-6 w-52 rounded-lg" style={{ background: 'rgba(255,255,255,0.1)' }} />
            <div className="h-3 w-36 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
          </div>
        ) : hero ? (
          <>
            <div className="flex items-center gap-1.5 mb-2">
              {(() => { const Icon = SUBJECT_ICON[hero.subject] ?? Sparkles; return <Icon size={11} style={{ color: SUBJECT_COLOR[hero.subject] ?? '#A0AEFF' }} />; })()}
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: SUBJECT_COLOR[hero.subject] ?? '#A0AEFF' }}>{hero.subject}</p>
            </div>
            <h2 className="font-heading text-xl font-extrabold text-white leading-tight mb-1">{hero.topic}</h2>
            <p className="text-xs text-white/40 mb-4">{hero.meta}</p>
          </>
        ) : (
          <>
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-2">Ready to start</p>
            <h2 className="font-heading text-xl font-extrabold text-white leading-tight mb-1">Begin your first session</h2>
            <p className="text-xs text-white/40 mb-4">Pick a subject and start earning XP</p>
          </>
        )}

        <div
          className="flex items-center justify-between px-4 py-3 rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <span className="text-white text-sm font-bold">{hero ? typeLabel[hero.type] : 'Start Learning'}</span>
          <div className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: `linear-gradient(135deg,${c1},${c2})` }}>
            <Play size={12} className="text-white fill-white ml-0.5" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Exam Countdown Hero Card ──────────────────────────────────────────────────
function ExamCountdownHeroCard({ examName, days }: { examName: string; days: number }) {
  const tier = days <= 3 ? 'war' : days <= 14 ? 'danger' : days <= 45 ? 'caution' : 'safe';
  const TIER = {
    war:     { color: '#EF4444', glow: 'rgba(239,68,68,0.3)',    bg: 'rgba(239,68,68,0.09)',    border: 'rgba(239,68,68,0.28)',    label: 'War Mode',       tagline: 'Every hour matters. Zero distractions now.',  Icon: Siren },
    danger:  { color: '#F97316', glow: 'rgba(249,115,22,0.22)',  bg: 'rgba(249,115,22,0.08)',   border: 'rgba(249,115,22,0.22)',   label: 'Final Push',     tagline: 'Crunch time. Hammer your weak areas first.',  Icon: AlertTriangle },
    caution: { color: '#FBBF24', glow: 'rgba(251,191,36,0.18)',  bg: 'rgba(251,191,36,0.07)',   border: 'rgba(251,191,36,0.2)',    label: 'Build Momentum', tagline: 'Consistency now will pay off on exam day.',    Icon: Target },
    safe:    { color: '#A0AEFF', glow: 'rgba(160,174,255,0.14)', bg: 'rgba(91,106,245,0.07)',   border: 'rgba(91,106,245,0.16)',   label: 'On Track',       tagline: 'Steady preparation wins the race.',           Icon: CalendarClock },
  }[tier];
  const { Icon } = TIER;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
      <Link to="/roadmap">
        <div
          className="rounded-3xl overflow-hidden active:scale-98 transition-transform"
          style={{ background: TIER.bg, border: `1px solid ${TIER.border}`, boxShadow: `0 4px 24px ${TIER.glow}` }}
        >
          <div style={{ height: 3, background: `linear-gradient(90deg, ${TIER.color}, transparent 70%)` }} />
          <div className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Icon size={11} style={{ color: TIER.color }} />
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: TIER.color }}>
                    {TIER.label}
                  </p>
                </div>
                <p className="text-sm font-bold text-white truncate">{examName}</p>
                <p className="text-xs mt-1.5 leading-snug" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  {TIER.tagline}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p
                  className="font-heading font-extrabold leading-none"
                  style={{ fontSize: 52, color: TIER.color, filter: `drop-shadow(0 0 14px ${TIER.glow})` }}
                >
                  {days}
                </p>
                <p className="text-[11px] font-semibold -mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>days left</p>
              </div>
            </div>
            <div
              className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl mt-3"
              style={{ background: `${TIER.color}12`, border: `1px solid ${TIER.color}22` }}
            >
              <span className="text-xs font-bold text-white">View Study Roadmap</span>
              <ChevronRight size={14} style={{ color: TIER.color }} />
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ── Weak Topics Section ───────────────────────────────────────────────────────
function WeakTopicsSection({ topics, delay = 0.1 }: { topics: { topic: string; subject: string }[]; delay?: number }) {
  const navigate = useNavigate();
  if (topics.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <div className="flex items-center gap-2 mb-3">
        <TrendingDown size={13} style={{ color: '#F87171' }} />
        <h2 className="font-heading text-base font-bold text-white">Needs Attention</h2>
      </div>
      <div className="flex flex-col gap-2">
        {topics.map((t, i) => {
          const Icon = SUBJECT_ICON[t.subject] ?? Target;
          const color = SUBJECT_COLOR[t.subject] ?? '#F87171';
          return (
            <motion.div
              key={t.topic}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: delay + i * 0.05 }}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl"
              style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)' }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${color}15`, border: `1px solid ${color}20` }}
              >
                <Icon size={16} style={{ color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{t.topic}</p>
                <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{t.subject}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => navigate(`/quiz?subject=${encodeURIComponent(t.subject)}&topic=${encodeURIComponent(t.topic)}`)}
                  className="text-[11px] font-bold px-2.5 py-1.5 rounded-xl active:scale-90 transition-transform"
                  style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.22)', color: '#F87171' }}
                >
                  Quiz
                </button>
                <button
                  onClick={() => navigate(`/chat?q=${encodeURIComponent(`Help me understand ${t.topic} in ${t.subject}`)}`)}
                  className="text-[11px] font-bold px-2.5 py-1.5 rounded-xl active:scale-90 transition-transform"
                  style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.22)', color: '#C4B5FD' }}
                >
                  Chat
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── Course Resume Card ────────────────────────────────────────────────────────
interface ResumeLesson { lessonId: string; label: string; subject: string; to: string; }

function CourseResumeCard({ resume, delay = 0.11 }: { resume: ResumeLesson | null; delay?: number }) {
  if (!resume) return null;
  const Icon  = SUBJECT_ICON[resume.subject] ?? BookOpen;
  const color = SUBJECT_COLOR[resume.subject] ?? '#A0AEFF';
  const [mainLabel, detail] = resume.label.split(' — ');

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Link to={resume.to}>
        <div
          className="rounded-3xl p-4 flex items-center gap-4 active:scale-98 transition-transform"
          style={{
            background: 'linear-gradient(135deg,rgba(15,20,45,0.9),rgba(20,15,50,0.9))',
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: `${color}15`, border: `1px solid ${color}20` }}
          >
            <Icon size={22} style={{ color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: 'rgba(255,255,255,0.32)' }}>
              Continue Course
            </p>
            <p className="text-sm font-bold text-white leading-snug truncate">{mainLabel}</p>
            {detail && <p className="text-[11px] mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{detail}</p>}
          </div>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: `${color}18`, border: `1px solid ${color}28` }}
          >
            <BookCheck size={15} style={{ color }} />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ── 3 Recommended actions ─────────────────────────────────────────────────────
interface Action { id: string; label: string; sub: string; to: string; icon: React.ReactNode; color: string; }

function RecommendedActions({ actions }: { actions: Action[] }) {
  return (
    <div>
      <h2 className="font-heading text-base font-bold text-white mb-3">Recommended for you</h2>
      <div className="flex flex-col gap-2.5">
        {actions.map((a, i) => (
          <motion.div key={a.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.06, type: 'spring', stiffness: 300, damping: 26 }}
          >
            <Link to={a.to}>
              <div className="flex items-center gap-3.5 px-4 py-3.5 rounded-2xl active:scale-97 transition-transform"
                style={{ background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: `${a.color}18`, border: `1px solid ${a.color}28` }}>
                  {a.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white leading-tight">{a.label}</p>
                  <p className="text-[11px] text-white/40 mt-0.5">{a.sub}</p>
                </div>
                <ChevronRight size={14} className="text-white/25 shrink-0" />
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ── Today's Mission Card ──────────────────────────────────────────────────────
const MISSION_TASKS = [
  { id: 'quiz',     label: '5-Question Quiz',   sub: 'Any subject · 5 mins',    to: '/quiz',      icon: Target,    color: '#F97316' },
  { id: 'cards',    label: '10 Flashcard Review', sub: 'Spaced repetition',     to: '/flashcard', icon: BookMarked, color: '#10B981' },
  { id: 'chat',     label: 'Ask Novo 1 Question', sub: 'AI tutor · 2 mins',     to: '/chat',      icon: Bot,       color: '#8B5CF6' },
] as const;
type MissionTaskId = typeof MISSION_TASKS[number]['id'];

function missionKey(uid: string) { return `edora_mission_${uid}_${new Date().toISOString().slice(0,10)}`; }
function getMissionState(uid: string): Record<MissionTaskId, boolean> {
  try { return JSON.parse(localStorage.getItem(missionKey(uid)) ?? '{}'); } catch { return {} as Record<MissionTaskId, boolean>; }
}
function setMissionTask(uid: string, id: MissionTaskId, done: boolean) {
  const s = getMissionState(uid);
  localStorage.setItem(missionKey(uid), JSON.stringify({ ...s, [id]: done }));
}

function TodaysMissionCard({ userId, onAllDone }: { userId: string; onAllDone: () => void }) {
  const navigate = useNavigate();
  const [done, setDone] = useState<Record<string, boolean>>(() => getMissionState(userId));
  const [bonusFlash, setBonusFlash] = useState(false);
  const completedCount = MISSION_TASKS.filter(t => done[t.id]).length;
  const allDone = completedCount === MISSION_TASKS.length;

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    supabase.from('daily_mission_completions')
      .select('quiz_done,cards_done,chat_done,bonus_xp_awarded')
      .eq('user_id', userId).eq('mission_date', today)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const s: Record<string, boolean> = {
          quiz: data.quiz_done,
          cards: data.cards_done,
          chat: data.chat_done,
        };
        setDone(s);
        localStorage.setItem(missionKey(userId), JSON.stringify(s));
      });
  }, [userId]);

  function handleTaskTap(task: typeof MISSION_TASKS[number]) {
    navigate(task.to);
  }

  function markDoneOptimistic(id: MissionTaskId) {
    const next = { ...done, [id]: true };
    setDone(next);
    setMissionTask(userId, id, true);
    const allNow = MISSION_TASKS.every(t => next[t.id]);
    if (allNow && !bonusFlash) {
      setBonusFlash(true);
      onAllDone();
      supabase.from('daily_mission_completions')
        .upsert({ user_id: userId, mission_date: new Date().toISOString().slice(0,10), quiz_done: true, cards_done: true, chat_done: true, bonus_xp_awarded: true, completed_at: new Date().toISOString() }, { onConflict: 'user_id,mission_date' })
        .then();
      supabase.rpc('increment_xp', { user_id: userId, amount: 50 }).then(undefined, () => {});
    } else {
      const col = id === 'quiz' ? 'quiz_done' : id === 'cards' ? 'cards_done' : 'chat_done';
      supabase.from('daily_mission_completions')
        .upsert({ user_id: userId, mission_date: new Date().toISOString().slice(0,10), [col]: true }, { onConflict: 'user_id,mission_date' })
        .then();
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 }}
      className="rounded-3xl overflow-hidden"
      style={{
        background: allDone
          ? 'linear-gradient(135deg,rgba(16,185,129,0.12),rgba(5,150,105,0.08))'
          : 'rgba(255,255,255,0.06)',
        border: allDone ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(91,106,245,0.18)',
      }}
    >
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Daily</p>
          <h2 className="font-heading text-base font-extrabold text-white">Today's Mission</h2>
        </div>
        <div className="flex items-center gap-1.5">
          {allDone ? (
            <AnimatePresence>
              <motion.div
                key="bonus"
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}
              >
                <Star size={11} style={{ color: '#10B981', fill: '#10B981' }} />
                <span className="text-[10px] font-extrabold" style={{ color: '#10B981' }}>+50 XP Bonus!</span>
              </motion.div>
            </AnimatePresence>
          ) : (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
              {completedCount}/3
            </span>
          )}
        </div>
      </div>

      <div className="mx-4 mb-3 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: allDone ? '#10B981' : 'linear-gradient(90deg,#5B6AF5,#8B5CF6)' }}
          animate={{ width: `${(completedCount / 3) * 100}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      <div className="flex flex-col px-3 pb-4 gap-2">
        {MISSION_TASKS.map((task) => {
          const isDone = !!done[task.id];
          const Icon = task.icon;
          return (
            <motion.div
              key={task.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => isDone ? undefined : handleTaskTap(task)}
              className="flex items-center gap-3 px-3 py-3 rounded-2xl cursor-pointer active:scale-97 transition-transform"
              style={{
                background: isDone ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.04)',
                border: isDone ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(255,255,255,0.06)',
                opacity: isDone ? 0.75 : 1,
              }}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${task.color}18`, border: `1px solid ${task.color}28` }}>
                <Icon size={16} style={{ color: task.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white leading-tight">{task.label}</p>
                <p className="text-[10px] text-white/35 mt-0.5">{task.sub}</p>
              </div>
              {isDone
                ? <CheckCircle2 size={18} style={{ color: '#10B981' }} className="shrink-0" />
                : <Circle size={18} className="text-white/20 shrink-0" />
              }
            </motion.div>
          );
        })}
      </div>

      {!allDone && (
        <div className="px-4 pb-4 flex gap-2">
          {MISSION_TASKS.filter(t => !done[t.id]).map(task => (
            <button
              key={task.id}
              onClick={(e) => { e.stopPropagation(); markDoneOptimistic(task.id); }}
              className="text-[10px] font-semibold px-2.5 py-1 rounded-full active:scale-95 transition-transform"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.35)' }}
            >
              Mark {task.id} done ✓
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ── Proactive banner ──────────────────────────────────────────────────────────
function NovoProactiveBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [msg, setMsg]             = useState<NovoProactiveMessage | null>(null);
  const [visible, setVisible]     = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user || dismissed) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await supabase.functions.invoke('novo-proactive', {
          body: { action: 'get_pending', limit: 1 },
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        const m: NovoProactiveMessage | null = res.data?.messages?.[0] ?? null;
        if (!cancelled && m) { setMsg(m); setVisible(true); }
      } catch { /* non-critical */ }
    })();
    return () => { cancelled = true; };
  }, [user, dismissed]);

  async function dismiss() {
    setVisible(false); setDismissed(true);
    if (msg && user) {
      const { data: { session } } = await supabase.auth.getSession();
      supabase.functions.invoke('novo-proactive', {
        body: { action: 'mark_read', message_id: msg.id },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      }).catch(() => {});
    }
  }

  if (!msg) return null;
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.96 }}
          className="rounded-2xl overflow-hidden"
          style={{ background: 'linear-gradient(135deg,rgba(91,106,245,0.12),rgba(139,92,246,0.12))', border: '1px solid rgba(91,106,245,0.25)', boxShadow: '0 4px 24px rgba(91,106,245,0.12)' }}
        >
          <div className="px-4 py-3.5 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gradient-novo">
              <TeachingIcon size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-0.5">Novo reached out</p>
              <p className="text-sm text-foreground leading-snug">{msg.message}</p>
              {msg.cta_label && msg.cta_route && (
                <button onClick={() => { dismiss(); navigate(msg.cta_route!); }} className="mt-2 flex items-center gap-1 text-xs font-bold text-primary">
                  {msg.cta_label} <ChevronRight size={11} />
                </button>
              )}
            </div>
            <button onClick={dismiss} aria-label="Dismiss notification" className="text-white/40 shrink-0 mt-0.5 active:scale-90">
              <X size={15} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Social Feed Card (social_first d30 variant) ───────────────────────────────
interface SocialRival { id: string; name: string; xp: number; initials: string; }

function SocialFeedCard({ userId, userXP }: { userId: string; userXP: number }) {
  const navigate = useNavigate();
  const [rank, setRank]           = useState<number | null>(null);
  const [above, setAbove]         = useState<SocialRival | null>(null);
  const [below, setBelow]         = useState<SocialRival | null>(null);
  const [onlineCount, setOnline]  = useState<number | null>(null);
  const [loaded, setLoaded]       = useState(false);

  useEffect(() => {
    (async () => {
      // Rank = count of users with higher XP + 1
      const { count: higherCount } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gt('xp', userXP);

      const userRank = (higherCount ?? 0) + 1;
      setRank(userRank);

      // Fetch 1 student just above and 1 just below by XP
      const [aboveRes, belowRes] = await Promise.all([
        supabase.from('profiles')
          .select('id,full_name,xp')
          .gt('xp', userXP)
          .neq('id', userId)
          .order('xp', { ascending: true })
          .limit(1),
        supabase.from('profiles')
          .select('id,full_name,xp')
          .lt('xp', userXP)
          .neq('id', userId)
          .order('xp', { ascending: false })
          .limit(1),
      ]);

      function toRival(row: { id: string; full_name: string | null; xp: number | null }): SocialRival {
        const name = row.full_name?.split(' ')[0] ?? 'Student';
        const initials = (row.full_name ?? 'S').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
        return { id: row.id, name, xp: row.xp ?? 0, initials };
      }

      if (aboveRes.data?.[0]) setAbove(toRival(aboveRes.data[0] as { id: string; full_name: string | null; xp: number | null }));
      if (belowRes.data?.[0]) setBelow(toRival(belowRes.data[0] as { id: string; full_name: string | null; xp: number | null }));

      // Estimate "online now" from profiles active in last 15 min via last_seen or row count heuristic
      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { count: liveCount } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('updated_at', since);
      // Floor at 12 so it never looks empty on low-traffic days
      setOnline(Math.max(liveCount ?? 0, 12));

      setLoaded(true);
    })();
  }, [userId, userXP]);

  const RANK_LABELS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
  const rankLabel = rank !== null ? (RANK_LABELS[rank] ?? `#${rank}`) : '—';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-3xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg,rgba(91,106,245,0.1),rgba(139,92,246,0.08))',
        border: '1px solid rgba(91,106,245,0.2)',
        boxShadow: '0 4px 24px rgba(91,106,245,0.12)',
      }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Leaderboard</p>
          <h2 className="font-heading text-base font-extrabold text-white">Your Rank</h2>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[10px] font-bold" style={{ color: '#10B981' }}>
            {loaded ? `${onlineCount} online` : '…'}
          </span>
        </div>
      </div>

      {/* Rank + rival rows */}
      <div className="px-4 pb-4 flex flex-col gap-2">
        {/* Student above */}
        {above && (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl"
            style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-[11px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#EF4444,#F97316)' }}>
              {above.initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white">{above.name}</p>
              <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.38)' }}>{above.xp.toLocaleString()} XP</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] font-bold" style={{ color: '#F87171' }}>+{(above.xp - userXP).toLocaleString()} XP ahead</p>
            </div>
          </div>
        )}

        {/* Your rank row */}
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl"
          style={{ background: 'rgba(91,106,245,0.12)', border: '1px solid rgba(91,106,245,0.28)' }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold text-white"
            style={{ background: 'linear-gradient(145deg,#6373F6,#7C3AED)', boxShadow: '0 4px 12px rgba(91,106,245,0.4)' }}>
            {rankLabel}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white">You</p>
            <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{userXP.toLocaleString()} XP</p>
          </div>
          <p className="text-[10px] font-extrabold text-primary shrink-0">
            {loaded ? `Rank ${rankLabel}` : '…'}
          </p>
        </div>

        {/* Student below */}
        {below && (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl"
            style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)' }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-[11px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#10B981,#059669)' }}>
              {below.initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white">{below.name}</p>
              <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.38)' }}>{below.xp.toLocaleString()} XP</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] font-bold" style={{ color: '#34D399' }}>{(userXP - below.xp).toLocaleString()} XP ahead</p>
            </div>
          </div>
        )}

        {/* CTA */}
        <button
          onClick={() => navigate('/leaderboard')}
          className="mt-1 flex items-center justify-between px-4 py-3 rounded-2xl w-full active:scale-97 transition-transform"
          style={{ background: 'rgba(91,106,245,0.12)', border: '1px solid rgba(91,106,245,0.22)' }}
        >
          <span className="text-sm font-bold text-white">View Full Leaderboard</span>
          <div className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(91,106,245,0.2)' }}>
            <Trophy size={13} className="text-primary" />
          </div>
        </button>
      </div>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  const [hero, setHero]             = useState<ContinueHero | null>(null);
  const [heroLoading, setHeroLoading] = useState(true);
  const [weakTopics, setWeakTopics] = useState<{ topic: string; subject: string }[]>([]);
  const [resumeLesson, setResumeLesson] = useState<ResumeLesson | null>(null);
  const [dueCards, setDueCards]     = useState(0);
  const [sessionProgress, setSessionProgress] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);
  const [freezeCount, setFreezeCount]     = useState(0);
  const [freezeShopOpen, setFreezeShopOpen] = useState(false);
  const [moodOpen, setMoodOpen]           = useState(false);
  const [todayMood, setTodayMood]         = useState<string | null>(null);
  const [focusModeOpen, setFocusModeOpen]   = useState(false);
  const [musicOpen, setMusicOpen]           = useState(false);
  const [showTour, setShowTour]             = useState(false);

  const d30Variant = useD30RetentionVariant();
  const isEvening = new Date().getHours() >= 21;

  const { card: achievementCard, checkStreak, checkLevel, dismiss: dismissAchievementCard } = useAchievementCard();

  const awardedRef = useRef<Set<string>>(new Set());

  // Show onboarding tour once, after first arrival on home screen
  useEffect(() => {
    if (!user) return;
    const key = `edora_tour_done_${user.id}`;
    if (!localStorage.getItem(key)) {
      const t = setTimeout(() => setShowTour(true), 1000);
      return () => clearTimeout(t);
    }
  }, [user?.id]);

  // Show mood check-in once per day
  useEffect(() => {
    if (!user) return;
    const key = `edora_mood_${user.id}_${new Date().toISOString().slice(0, 10)}`;
    if (!localStorage.getItem(key)) {
      setTimeout(() => setMoodOpen(true), 800);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    awardedRef.current = getAwardedSet(user.id);

    const todayISO = new Date(new Date().setHours(0,0,0,0)).toISOString();

    Promise.all([
      // Last sprint
      supabase.from('sprint_sessions').select('subject,topic,duration,created_at').eq('user_id', user.id).eq('completed', true).order('created_at', { ascending: false }).limit(1),
      // Weak topics (top 3)
      supabase.from('topic_stats').select('topic,subject').eq('user_id', user.id).order('struggle_count', { ascending: false }).limit(3),
      // Due flashcards count
      supabase.from('flashcards').select('id', { count: 'exact', head: true }).eq('user_id', user.id).lte('next_review_at', new Date().toISOString()),
      // Daily session progress
      supabase.from('daily_power_sessions').select('flashcards_done,pyq_done,concept_done,completed_at').eq('user_id', user.id).eq('session_date', new Date().toISOString().slice(0, 10)).single(),
      // Freeze count
      supabase.from('profiles').select('streak_freeze_count').eq('id', user.id).single(),
      // XP awards for challenges — sprint count
      supabase.from('sprint_sessions').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('completed', true).gte('created_at', todayISO),
      // XP awards for challenges — flash count
      supabase.from('flashcards').select('*', { count: 'exact', head: true }).eq('user_id', user.id).gt('repetitions', 0).gte('updated_at', todayISO),
      // Last completed lesson for course resume
      supabase.from('lesson_progress').select('lesson_id,completed_at').eq('user_id', user.id).eq('completed', true).order('completed_at', { ascending: false }).limit(1),
    ]).then(([sprintRes, weakRes, cardsRes, sessionRes, freezeRes, sprintCountRes, flashCountRes, lessonRes]) => {
      // Hero card
      if (sprintRes.data?.[0]) {
        const s = sprintRes.data[0] as SprintSession & { topic: string };
        setHero({ type: 'sprint', subject: s.subject, topic: s.topic || `${s.subject} Sprint`, to: '/sprint', meta: `Last session · ${s.subject}` });
      }
      setHeroLoading(false);

      // Weak topics
      if (weakRes.data && weakRes.data.length > 0) {
        setWeakTopics(weakRes.data as { topic: string; subject: string }[]);
      }

      // Due cards
      setDueCards(cardsRes.count ?? 0);

      // Session
      const sd = sessionRes.data;
      if (sd) {
        const prog = (sd as { flashcards_done: number; pyq_done: number; concept_done: boolean }).flashcards_done
          + (sd as { flashcards_done: number; pyq_done: number; concept_done: boolean }).pyq_done
          + ((sd as { flashcards_done: number; pyq_done: number; concept_done: boolean; completed_at: string | null }).concept_done ? 1 : 0);
        setSessionProgress(prog);
        setSessionDone(!!(sd as { completed_at: string | null }).completed_at);
      }

      // Freeze count
      if (freezeRes.data) setFreezeCount((freezeRes.data as { streak_freeze_count: number }).streak_freeze_count ?? 0);

      // XP challenges
      const counts = { sprint: sprintCountRes.count ?? 0, flashcard: flashCountRes.count ?? 0 };
      const thresholds = { sprint: 1, flashcard: 10 };
      const rewards = { sprint: 50, flashcard: 30 };
      for (const id of ['sprint', 'flashcard'] as const) {
        if (counts[id] >= thresholds[id] && !awardedRef.current.has(id)) {
          markAwarded(user.id, id);
          awardedRef.current.add(id);
          supabase.rpc('increment_xp', { user_id: user.id, amount: rewards[id] }).then(undefined, () => {});
        }
      }

      // Course resume card
      const lastLesson = lessonRes.data?.[0] as { lesson_id: string } | undefined;
      if (lastLesson) {
        const label   = lessonIdToLabel(lastLesson.lesson_id);
        const parts   = lastLesson.lesson_id.split('-');
        const subjCode = parts[0] ?? '';
        const classNum = subjCode.replace(/\D/g, '');
        const chapPart = parts[1] ?? '';
        const chapterId = `${subjCode}-${chapPart}`;
        const subjectMap: Record<string, string> = {
          sc: 'Science', ma: 'Mathematics', ph: 'Physics',
          ch: 'Chemistry', bi: 'Biology', en: 'English',
        };
        const code        = subjCode.replace(/\d+/g, '');
        const subjectName = subjectMap[code] ?? 'Science';
        setResumeLesson({
          lessonId: lastLesson.lesson_id,
          label,
          subject: subjectName,
          to: `/course?class=${classNum}&subject=${subjCode}&chapter=${chapterId}`,
        });
      }
    }).catch(() => setHeroLoading(false));
  }, [user]);

  useEffect(() => {
    if (!user || !profile) return;
    const seenKey = `edora_milestones_seen_${user.id}`;
    let seen: number[] = [];
    try { seen = JSON.parse(localStorage.getItem(seenKey) ?? '[]'); } catch { /* ignore */ }

    const currentStreak = profile.streak_count ?? 0;
    const currentLevel  = getLevelFromXP(profile.xp ?? 0);

    if ([7, 14, 30, 50, 100, 365].includes(currentStreak) && !seen.includes(1000 + currentStreak)) {
      checkStreak(currentStreak);
      localStorage.setItem(seenKey, JSON.stringify([...seen, 1000 + currentStreak]));
    } else if (currentLevel > 0 && currentLevel % 5 === 0 && !seen.includes(2000 + currentLevel)) {
      checkLevel(currentLevel);
      localStorage.setItem(seenKey, JSON.stringify([...seen, 2000 + currentLevel]));
    }
  }, [user, profile?.streak_count, profile?.xp]);

  useEffect(() => {
    if (!profile) return;
    const xpNow          = profile.xp ?? 0;
    const lvl            = getLevelFromXP(xpNow);
    const xpThisLevel    = xpNow - getXPForLevel(lvl);
    const xpGoalThisLvl  = getXPForLevel(lvl + 1) - getXPForLevel(lvl);
    const examDaysLeft   = profile.exam_date ? daysUntil(profile.exam_date) : undefined;

    updateHomeWidget({
      streakCount: profile.streak_count ?? 0,
      todayQuestion: weakTopics[0]
        ? `Practice ${weakTopics[0].topic} (${weakTopics[0].subject})`
        : "Start today's 10-min power session",
      todayAnswered: sessionDone,
      xpToday: xpThisLevel,
      xpGoal: xpGoalThisLvl,
      nextCardMin: dueCards > 0 ? 0 : undefined,
      examName: profile.exam_name ?? undefined,
      examDays: examDaysLeft !== undefined && examDaysLeft > 0 ? examDaysLeft : undefined,
    });
  }, [profile?.streak_count, profile?.xp, profile?.exam_date, profile?.exam_name, weakTopics, sessionDone, dueCards]);

  if (loading) return <HomePageSkeleton />;

  const xp             = profile?.xp ?? 0;
  const level          = getLevelFromXP(xp);
  const nextLevelXP    = getXPForLevel(level + 1);
  const currentLevelXP = getXPForLevel(level);
  const levelProgress  = Math.round(((xp - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100);
  const streak         = profile?.streak_count ?? 0;
  const firstName      = profile?.full_name?.split(' ')[0] ?? 'Explorer';
  const initials       = (profile?.full_name ?? 'E').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  // Exam urgency
  const examDays   = profile?.exam_date ? daysUntil(profile.exam_date) : null;
  const isUrgent   = examDays !== null && examDays >= 0 && examDays <= 14;
  const hoursLeft  = profile?.exam_date ? Math.max(0, (new Date(profile.exam_date).getTime() - Date.now()) / 3_600_000) : null;
  const isWarMode  = hoursLeft !== null && hoursLeft <= 48;

  // Build 3 recommended actions
  const actions: Action[] = [];
  if (!sessionDone) {
    actions.push({
      id: 'session', label: '10-min Power Session',
      sub: sessionProgress > 0 ? `${sessionProgress}/6 done — keep going` : 'Start today\'s curated session',
      to: '/daily-session', color: '#5B6AF5',
      icon: <Zap size={18} style={{ color: '#A0AEFF' }} />,
    });
  }
  if (weakTopics[0]) {
    actions.push({
      id: 'weak', label: `Practice ${weakTopics[0].topic}`,
      sub: `Your weakest area in ${weakTopics[0].subject}`,
      to: `/quiz?subject=${encodeURIComponent(weakTopics[0].subject)}&topic=${encodeURIComponent(weakTopics[0].topic)}`,
      color: '#EF4444',
      icon: <Target size={18} style={{ color: '#FCA5A5' }} />,
    });
  }
  if (dueCards > 0) {
    actions.push({
      id: 'cards', label: `Review ${Math.min(dueCards, 10)} Flashcards`,
      sub: `${dueCards} card${dueCards > 1 ? 's' : ''} due for spaced repetition`,
      to: '/flashcard', color: '#10B981',
      icon: <BookMarked size={18} style={{ color: '#6EE7B7' }} />,
    });
  }
  if (actions.length < 3) {
    actions.push({
      id: 'chat', label: 'Ask Novo a question',
      sub: 'AI tutor available 24/7',
      to: '/chat', color: '#8B5CF6',
      icon: <Bot size={18} style={{ color: '#C4B5FD' }} />,
    });
  }
  const top3 = actions.slice(0, 3);

  return (
    <div className="h-full native-scroll pb-nav" style={{ background: 'transparent' }}>
      <div className="px-4 pt-5 flex flex-col gap-3">

        {/* ── HEADER — Liquid Glass floating bar ──────────────────── */}
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          className="liquid-glass specular rounded-3xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Avatar with prismatic glow */}
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-sm font-bold text-white relative"
              style={{
                background: 'linear-gradient(145deg, #6373F6, #7C3AED)',
                boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.22), 0 0 20px rgba(91,106,245,0.55), 0 4px 12px rgba(0,0,0,0.35)',
              }}
              aria-label={`${firstName}'s avatar`}
            >
              <span style={{ position:'relative', zIndex:1 }}>{initials}</span>
              <div style={{ position:'absolute', inset:0, borderRadius:14, background:'radial-gradient(ellipse 65% 40% at 35% 28%, rgba(255,255,255,0.24), transparent 65%)', pointerEvents:'none' }} />
            </div>
            <div>
              <p className="text-[11px] font-semibold" style={{ color:'rgba(255,255,255,0.42)' }}>{getGreeting()}</p>
              <h1 className="font-heading text-xl font-extrabold text-white leading-tight">{firstName}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setFreezeShopOpen(true)}
              aria-label={`${freezeCount} streak freeze${freezeCount !== 1 ? 's' : ''}`}
              className="flex items-center gap-1.5 px-2.5 rounded-full active:scale-90 transition-transform min-h-[44px]"
              style={{ background:'rgba(56,189,248,0.10)', border:'1px solid rgba(56,189,248,0.22)', boxShadow:'inset 0 1px 0 rgba(255,255,255,0.1)' }}>
              <Snowflake size={12} style={{ color:'#38BDF8' }} />
              <span className="text-xs font-bold" style={{ color:'#38BDF8' }}>{freezeCount}</span>
            </button>
            <button onClick={() => window.dispatchEvent(new CustomEvent('edora:open-session-ritual'))}
              className="flex items-center gap-1.5 px-3 rounded-full active:scale-90 transition-transform min-h-[44px]"
              style={{ background:'rgba(251,113,33,0.12)', border:'1px solid rgba(251,113,33,0.28)', boxShadow:'inset 0 1px 0 rgba(255,255,255,0.08)' }}
              aria-label={`${streak} day streak — tap to see session summary`}>
              <Flame size={13}
                className={isEvening && streak > 0 ? 'streak-heartbeat' : ''}
                style={{ color:'#FB923C', filter:'drop-shadow(0 0 5px rgba(251,113,33,0.7))' }} />
              <span className="text-xs font-extrabold" style={{ color:'#FB923C' }}>{streak}</span>
            </button>
            <Link to="/reminders" aria-label="Reminders">
              <button className="w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.09)', boxShadow:'inset 0 1px 0 rgba(255,255,255,0.08)' }}>
                <Bell size={15} className="text-white/50" strokeWidth={1.75} />
              </button>
            </Link>
          </div>
        </motion.div>

        {/* ── URGENT: exam ≤14 days — show at top ─────────────────── */}
        {isUrgent && profile?.exam_date && examDays !== null && examDays >= 0 && (
          <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} className="flex flex-col gap-3">
            <ExamCountdownHeroCard examName={profile.exam_name ?? 'Your Exam'} days={examDays} />
            {weakTopics.length > 0 && <WeakTopicsSection topics={weakTopics} delay={0.08} />}
          </motion.div>
        )}

        {/* ── WAR ROOM — exam <48h ─────────────────────────────────── */}
        {isWarMode && profile?.exam_date && hoursLeft !== null && (
          <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.05 }}>
            <WarRoomBanner examName={profile.exam_name ?? 'Exam'} hoursLeft={Math.round(hoursLeft)} />
          </motion.div>
        )}

        {/* ── NOVO PROACTIVE BANNER ────────────────────────────────── */}
        <NovoProactiveBanner />

        {/* ── BENTO GRID ROW 1: Continue Hero (full) ───────────────── */}
        <motion.div initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.04 }}>
          <ContinueCard hero={hero} loading={heroLoading} />
        </motion.div>

        {/* ── BENTO GRID ROW 2: XP Cell | Stats Cell ───────────────── */}
        <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.07 }}
          className="bento-grid">
          {/* XP bento cell */}
          <div className="bento-cell-elevated flex items-center gap-3 p-4">
            <XPRing progress={levelProgress} size={48} />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color:'rgba(255,255,255,0.38)' }}>Level {level}</p>
              <p className="text-sm font-extrabold text-white truncate">{xp.toLocaleString()} XP</p>
              <p className="text-[10px]" style={{ color:'rgba(255,255,255,0.32)' }}>{levelProgress}% to Lv.{level+1}</p>
            </div>
          </div>
          {/* Rival OR streak bento cell */}
          <div className="bento-cell-elevated flex items-center justify-center p-3">
            {user
              ? <RivalBadge userId={user.id} />
              : <div className="flex flex-col items-center gap-1">
                  <Flame size={24} style={{ color:'#FB923C', filter:'drop-shadow(0 0 6px rgba(251,113,33,0.7))' }} />
                  <p className="text-xs font-extrabold text-white">{streak}</p>
                  <p className="text-[10px]" style={{ color:'rgba(255,255,255,0.35)' }}>Day streak</p>
                </div>
            }
          </div>
        </motion.div>

        {/* ── NON-URGENT exam countdown ────────────────────────────── */}
        {!isUrgent && profile?.exam_date && examDays !== null && examDays >= 0 && (
          <ExamCountdownHeroCard examName={profile.exam_name ?? 'Your Exam'} days={examDays} />
        )}

        {/* ── Course resume ────────────────────────────────────────── */}
        {resumeLesson && <CourseResumeCard resume={resumeLesson} delay={0.09} />}

        {/* ── Weak topics (non-urgent) ─────────────────────────────── */}
        {!isUrgent && weakTopics.length > 0 && <WeakTopicsSection topics={weakTopics} delay={0.1} />}

        {/* ── social_first: Social Feed Card shown here (replaces ring) ── */}
        {d30Variant === 'social_first' && user && (
          <SocialFeedCard userId={user.id} userXP={xp} />
        )}

        {/* ── Daily Power Ring — shown first in streak_first variant ── */}
        {d30Variant === 'streak_first' && (
          <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 }}>
            <DailyPowerRing />
          </motion.div>
        )}

        {/* ── Novo AI Insights — shown first in content_first variant ── */}
        {d30Variant === 'content_first' && (
          <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 }}>
            <NovoInsightsCard />
          </motion.div>
        )}

        {/* ── BENTO GRID ROW 3: Focus Mode | Study Break ───────────── */}
        <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.11 }}
          className="bento-grid">
          <button onClick={() => setFocusModeOpen(true)}
            className="bento-cell-elevated p-4 flex items-center gap-3 active:scale-97 transition-transform text-left">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background:'linear-gradient(145deg,#7C3AED,#A855F7)', boxShadow:'inset 0 1px 0 rgba(255,255,255,0.2), 0 4px 12px rgba(124,58,237,0.45)' }}>
              <Timer size={16} className="text-white" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">Focus Mode</p>
              <p className="text-[10px]" style={{ color:'rgba(255,255,255,0.38)' }}>25-min timer</p>
            </div>
          </button>
          <button onClick={() => setMusicOpen(true)}
            className="bento-cell-elevated p-4 flex items-center gap-3 active:scale-97 transition-transform text-left">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background:'linear-gradient(145deg,#059669,#10B981)', boxShadow:'inset 0 1px 0 rgba(255,255,255,0.2), 0 4px 12px rgba(16,185,129,0.4)' }}>
              <Music size={16} className="text-white" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">Study Break</p>
              <p className="text-[10px]" style={{ color:'rgba(255,255,255,0.38)' }}>10-min music</p>
            </div>
          </button>
        </motion.div>

        {/* ── Today's Mission ──────────────────────────────────────── */}
        {user && (
          <TodaysMissionCard
            userId={user.id}
            onAllDone={() => checkLevel(getLevelFromXP((profile?.xp ?? 0) + 50))}
          />
        )}

        {/* ── Daily Power Ring — shown here in content_first and social_first variants ── */}
        {(d30Variant === 'content_first' || d30Variant === 'social_first') && (
          <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.125 }}>
            <DailyPowerRing />
          </motion.div>
        )}

        {/* ── Novo AI Insights — shown here in streak_first/social_first variants ── */}
        {d30Variant !== 'content_first' && <NovoInsightsCard />}

        {/* ── Recommended Actions ──────────────────────────────────── */}
        <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.12 }}>
          <RecommendedActions actions={top3} />
        </motion.div>

        {/* ── BENTO GRID ROW 4: Concept of Day | Novo CTA ─────────── */}
        <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.14 }}
          className="bento-grid">
          {/* Concept of Day — full width */}
          <div className="bento-full">
            <ConceptOfDayCard />
          </div>
        </motion.div>

        {/* ── Novo AI CTA — Liquid Glass ───────────────────────────── */}
        <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.16 }}>
          <Link to="/chat">
            <div className="liquid-glass-panel specular rounded-3xl p-4 flex items-center gap-4 active:scale-98 transition-transform">
              {/* Novo orb */}
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 relative"
                style={{ background:'linear-gradient(145deg,#6373F6,#7C3AED)', boxShadow:'inset 0 1.5px 0 rgba(255,255,255,0.22), 0 6px 22px rgba(91,106,245,0.55)' }}>
                <div style={{ position:'absolute', inset:0, borderRadius:14, background:'radial-gradient(ellipse 65% 40% at 35% 28%, rgba(255,255,255,0.24), transparent 65%)', pointerEvents:'none' }} />
                <TeachingIcon size={22} className="text-white relative z-10" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-wider mb-0.5 gradient-text">Novo AI</p>
                <p className="text-sm font-bold text-white leading-snug">Ask me anything, anytime</p>
                <p className="text-[11px] mt-0.5" style={{ color:'rgba(255,255,255,0.38)' }}>Your personal AI study tutor</p>
              </div>
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background:'rgba(91,106,245,0.18)', border:'1px solid rgba(91,106,245,0.28)' }}>
                <ArrowRight size={15} className="text-primary" />
              </div>
            </div>
          </Link>
        </motion.div>

        <div className="h-2" />
      </div>

      {/* Streak Freeze Shop */}
      <StreakFreezeShop
        open={freezeShopOpen}
        onClose={() => setFreezeShopOpen(false)}
        freezeCount={freezeCount}
        onPurchased={(count) => setFreezeCount(count)}
      />

      {/* Shareable milestone card */}
      {achievementCard && <AchievementCardModal data={achievementCard} onClose={dismissAchievementCard} />}

      {/* Daily mood check-in */}
      <AnimatePresence>
        {moodOpen && user && (
          <MoodCheckIn
            userId={user.id}
            onClose={(mood) => {
              setMoodOpen(false);
              if (mood) {
                setTodayMood(mood);
                const key = `edora_mood_${user.id}_${new Date().toISOString().slice(0, 10)}`;
                localStorage.setItem(key, mood);
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* Focus Mode — 25-min deep work timer */}
      <FocusModeOverlay
        open={focusModeOpen}
        onClose={() => setFocusModeOpen(false)}
      />

      {/* Spotify Study Break Player */}
      <SpotifyBreakPlayer
        open={musicOpen}
        onClose={() => setMusicOpen(false)}
        breakMin={10}
      />

      {/* Onboarding tour — fires once after first login */}
      {showTour && (
        <OnboardingTour
          onDone={() => {
            if (user) localStorage.setItem(`edora_tour_done_${user.id}`, '1');
            setShowTour(false);
          }}
        />
      )}
    </div>
  );
}
