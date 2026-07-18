import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {Flame, Star, Bell, Play, CalendarClock, X, ChevronRight,
  Sparkles, Zap, Bot, BookMarked, Target,
  Calculator, Atom, FlaskConical, Microscope, BookOpen,
  BarChart3, Code2, AlertTriangle, Snowflake, ArrowRight,
  Trophy, TrendingUp, CheckCircle2, Circle, Music, Timer,
  GraduationCap, TrendingDown, Siren, BookCheck} from 'lucide-react';
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
import { StudyBreakPlayer } from '@/components/study/StudyBreakPlayer';
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
  Science: Atom };
const SUBJECT_COLOR: Record<string, string> = {
  Mathematics: '#93C5FD', Physics: '#C4B5FD', Chemistry: '#6EE7B7', Biology: '#86EFAC',
  English: '#FCA5A5', History: '#FDE68A', Economics: '#A5F3FC', 'Computer Science': '#DDD6FE',
  Science: '#C4B5FD' };

function todayKey(uid: string) { return `challenges_${uid}_${new Date().toISOString().slice(0, 10)}`; }
function getAwardedSet(uid: string): Set<string> { try { return new Set<string>(JSON.parse(localStorage.getItem(todayKey(uid)) ?? '[]')); } catch { return new Set<string>(); } }
function markAwarded(uid: string, id: string) { const s = getAwardedSet(uid); s.add(id); localStorage.setItem(todayKey(uid), JSON.stringify([...s])); }

// ── XP ring ───────────────────────────────────────────────────────────────────
function XPRing({ progress, size = 56 }: { progress: number; size?: number }) {
  const stroke = 4; const r = (size - stroke) / 2; const circ = 2 * Math.PI * r;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--ink-080)" strokeWidth={stroke} />
        <motion.circle cx={size/2} cy={size/2} r={r} fill="none" stroke="white" strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (progress / 100) * circ }}
          transition={{ duration: 1, ease: 'easeOut' }}
          style={{ filter: 'drop-shadow(0 0 4px var(--ink-600))' }} />
      </svg>
      <Play size={10} className="fill-white text-white ml-0.5" />
    </div>
  );
}

// ── Rival status badge ────────────────────────────────────────────────────────
function RivalBadge({ userId }: { userId: string }) {
  const [rivalName, setRivalName] = useState<string | null>(null);
  const [delta, setDelta]         = useState<number | null>(null);
  const [_myXP, setMyXP]           = useState(0);
  const [_rivalXP, setRivalXP]     = useState(0);
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
        border: `1px solid ${ahead ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}
    >
      <Trophy size={12} style={{ color: ahead ? '#10B981' : '#EF4444' }} />
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: ahead ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.6)' }}>
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
    chat:      ['#5B6AF5','#8B5CF6'] };
  const [c1] = hero ? typeColor[hero.type] : ['#5B6AF5','#8B5CF6'];

  return (
    <div
      className="rounded-3xl overflow-hidden active:scale-98 transition-transform cursor-pointer v2-card"
      onClick={() => hero && navigate(hero.to)}
    >
      <div style={{ height: 2, background: c1 }} />
      <div className="p-5">
        {loading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-3 w-28 rounded-full" style={{ background: 'var(--v2-border)' }} />
            <div className="h-6 w-52 rounded-lg" style={{ background: 'var(--v2-border)' }} />
            <div className="h-3 w-36 rounded-full" style={{ background: 'var(--v2-border)' }} />
          </div>
        ) : hero ? (
          <>
            <div className="flex items-center gap-1.5 mb-2">
              {(() => { const Icon = SUBJECT_ICON[hero.subject] ?? Sparkles; return <Icon size={11} style={{ color: SUBJECT_COLOR[hero.subject] ?? '#A0AEFF' }} />; })()}
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: SUBJECT_COLOR[hero.subject] ?? '#A0AEFF' }}>{hero.subject}</p>
            </div>
            <h2 className="font-heading text-xl font-extrabold leading-tight mb-1" style={{ color: 'var(--v2-text-1)' }}>{hero.topic}</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--v2-text-4)' }}>{hero.meta}</p>
          </>
        ) : (
          <>
            <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--v2-text-4)' }}>Ready to start</p>
            <h2 className="font-heading text-xl font-extrabold leading-tight mb-1" style={{ color: 'var(--v2-text-1)' }}>Begin your first session</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--v2-text-4)' }}>Pick a subject and start earning XP</p>
          </>
        )}

        <div
          className="flex items-center justify-between px-4 py-3 rounded-2xl v2-btn-primary"
        >
          <span className="text-sm font-bold">{hero ? typeLabel[hero.type] : 'Start Learning'}</span>
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.2)' }}>
            <Play size={12} className="text-white fill-white ml-0.5" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Exam Countdown Hero Card ──────────────────────────────────────────────────
function ExamCountdownHeroCard({ examName, days, coveragePct }: { examName: string; days: number; coveragePct?: number }) {
  const tier = days <= 3 ? 'war' : days <= 14 ? 'danger' : days <= 45 ? 'caution' : 'safe';
  const TIER = {
    war:     { color: '#EF4444', glow: 'rgba(239,68,68,0.3)',    bg: 'rgba(239,68,68,0.09)',    border: 'rgba(239,68,68,0.28)',    label: 'War Mode',       tagline: 'Every hour matters. Zero distractions now.',  Icon: Siren },
    danger:  { color: '#F97316', glow: 'rgba(249,115,22,0.22)',  bg: 'rgba(249,115,22,0.08)',   border: 'rgba(249,115,22,0.22)',   label: 'Final Push',     tagline: 'Crunch time. Hammer your weak areas first.',  Icon: AlertTriangle },
    caution: { color: '#FBBF24', glow: 'rgba(251,191,36,0.18)',  bg: 'rgba(251,191,36,0.07)',   border: 'rgba(251,191,36,0.2)',    label: 'Build Momentum', tagline: 'Consistency now will pay off on exam day.',    Icon: Target },
    safe:    { color: '#A0AEFF', glow: 'rgba(160,174,255,0.14)', bg: 'rgba(91,106,245,0.07)',   border: 'rgba(91,106,245,0.16)',   label: 'On Track',       tagline: 'Steady preparation wins the race.',           Icon: CalendarClock } }[tier];
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
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: TIER.color }}>
                    {TIER.label}
                  </p>
                </div>
                <p className="text-sm font-bold text-white truncate">{examName}</p>
                <p className="text-xs mt-1.5 leading-snug" style={{ color: 'var(--ink-450)' }}>
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
                <p className="text-xs font-semibold -mt-1" style={{ color: 'var(--ink-500)' }}>days left</p>
              </div>
            </div>
            {coveragePct !== undefined && (
              <div className="mt-3 mb-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold" style={{ color: 'var(--ink-450)' }}>Syllabus covered</span>
                  <span className="text-xs font-bold" style={{ color: TIER.color }}>{coveragePct}%</span>
                </div>
                <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: 'var(--ink-080)' }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: TIER.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${coveragePct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                </div>
              </div>
            )}
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

// ── Day 7 "First Result" Modal ────────────────────────────────────────────────
interface Day7Stats { masteredCount: number; topSubject: string; topPct: number; totalTopics: number; }

function Day7FirstResultModal({ stats, onClose }: { stats: Day7Stats; onClose: () => void }) {
  const navigate = useNavigate();
  const bar = Math.min(100, Math.round((stats.masteredCount / Math.max(stats.totalTopics, 1)) * 100));

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end justify-center"
        style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(12px)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="w-full max-w-md rounded-t-[32px] px-6 pt-6 pb-10"
          style={{
            background: 'linear-gradient(160deg,var(--grad-home-hero-1) 0%,var(--grad-home-hero-2) 100%)',
            border: '1px solid rgba(91,106,245,0.22)',
            boxShadow: '0 -24px 80px rgba(91,106,245,0.22)' }}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 340, damping: 34 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div className="w-10 h-1 rounded-full mx-auto mb-6" style={{ background: 'var(--ink-150)' }} />

          {/* Trophy */}
          <motion.div
            className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg,#F59E0B,#EF4444)', boxShadow: '0 8px 32px rgba(245,158,11,0.4)' }}
            initial={{ scale: 0.5, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 20, delay: 0.15 }}
          >
            <Trophy size={36} className="text-white fill-white" />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <p className="text-center text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#F59E0B' }}>
              Week 1 complete
            </p>
            <h2 className="font-heading text-2xl font-extrabold text-white text-center leading-tight mb-1">
              Your first results are in
            </h2>
            <p className="text-center text-sm mb-6" style={{ color: 'var(--ink-450)' }}>
              Here's what you built in 7 days
            </p>
          </motion.div>

          {/* Stats row */}
          <motion.div
            className="flex gap-3 mb-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 }}
          >
            <div className="flex-1 rounded-2xl p-4 text-center" style={{ background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.2)' }}>
              <p className="font-heading text-3xl font-extrabold text-white">{stats.masteredCount}</p>
              <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--ink-400)' }}>topics mastered</p>
            </div>
            <div className="flex-1 rounded-2xl p-4 text-center" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)' }}>
              <p className="font-heading text-3xl font-extrabold" style={{ color: '#10B981' }}>{stats.topPct}%</p>
              <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--ink-400)' }}>best: {stats.topSubject}</p>
            </div>
          </motion.div>

          {/* Coverage bar */}
          <motion.div
            className="mb-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
          >
            <div className="flex justify-between mb-1.5">
              <span className="text-xs font-semibold" style={{ color: 'var(--ink-450)' }}>Syllabus coverage</span>
              <span className="text-xs font-bold" style={{ color: '#A0AEFF' }}>{bar}% of syllabus</span>
            </div>
            <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: 'var(--ink-070)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg,#5B6AF5,#8B5CF6)' }}
                initial={{ width: 0 }}
                animate={{ width: `${bar}%` }}
                transition={{ duration: 1, ease: 'easeOut', delay: 0.4 }}
              />
            </div>
          </motion.div>

          {/* CTA */}
          <motion.button
            className="w-full py-4 rounded-2xl font-bold text-white text-base active:scale-98 transition-transform"
            style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)', boxShadow: '0 8px 24px rgba(91,106,245,0.38)' }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.42 }}
            onClick={() => { onClose(); navigate('/weakness-radar'); }}
          >
            Keep the momentum going →
          </motion.button>
          <button
            className="w-full mt-3 py-3 text-sm font-medium active:opacity-70"
            style={{ color: 'var(--ink-500)' }}
            onClick={onClose}
          >
            Dismiss
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
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
                <p className="text-xs" style={{ color: 'var(--ink-400)' }}>{t.subject}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => navigate(`/quiz?subject=${encodeURIComponent(t.subject)}&topic=${encodeURIComponent(t.topic)}`)}
                  className="text-xs font-bold px-2.5 py-1.5 rounded-xl active:scale-90 transition-transform"
                  style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.22)', color: '#F87171' }}
                >
                  Quiz
                </button>
                <button
                  onClick={() => navigate(`/chat?q=${encodeURIComponent(`Help me understand ${t.topic} in ${t.subject}`)}`)}
                  className="text-xs font-bold px-2.5 py-1.5 rounded-xl active:scale-90 transition-transform"
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
            background: 'linear-gradient(135deg,var(--hdr-b-900),var(--surface-scrim))',
            border: '1px solid var(--ink-070)' }}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: `${color}15`, border: `1px solid ${color}20` }}
          >
            <Icon size={22} style={{ color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: 'var(--ink-500)' }}>
              Continue Course
            </p>
            <p className="text-sm font-bold text-white leading-snug truncate">{mainLabel}</p>
            {detail && <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--ink-400)' }}>{detail}</p>}
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
              <div className="flex items-center gap-3.5 px-4 py-3.5 rounded-2xl active:scale-97 transition-transform v2-card">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: `${a.color}18`, border: `1px solid ${a.color}28` }}>
                  {a.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold leading-tight" style={{ color: 'var(--v2-text-1)' }}>{a.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--v2-text-4)' }}>{a.sub}</p>
                </div>
                <ChevronRight size={14} style={{ color: 'var(--v2-chevron)' }} className="shrink-0" />
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
          chat: data.chat_done };
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
        background: allDone ? 'rgba(16,185,129,0.08)' : 'var(--v2-card)',
        border: allDone ? '1px solid rgba(16,185,129,0.3)' : '1px solid var(--v2-border)' }}
    >
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-white/40">Daily</p>
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
                <span className="text-xs font-extrabold" style={{ color: '#10B981' }}>+50 XP Bonus!</span>
              </motion.div>
            </AnimatePresence>
          ) : (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--ink-060)', color: 'var(--ink-400)' }}>
              {completedCount}/3
            </span>
          )}
        </div>
      </div>

      <div className="mx-4 mb-3 h-1 rounded-full overflow-hidden" style={{ background: 'var(--ink-070)' }}>
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
                background: isDone ? 'rgba(16,185,129,0.07)' : 'var(--ink-040)',
                border: isDone ? '1px solid rgba(16,185,129,0.2)' : '1px solid var(--ink-060)',
                opacity: isDone ? 0.75 : 1 }}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${task.color}18`, border: `1px solid ${task.color}28` }}>
                <Icon size={16} style={{ color: task.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white leading-tight">{task.label}</p>
                <p className="text-xs text-white/35 mt-0.5">{task.sub}</p>
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
              className="text-xs font-semibold px-2.5 py-1 rounded-full active:scale-95 transition-transform"
              style={{ background: 'var(--ink-050)', border: '1px solid var(--ink-080)', color: 'var(--ink-500)' }}
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
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} });
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
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} }).catch(() => {});
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
              <p className="text-xs font-bold text-primary uppercase tracking-wider mb-0.5">Novo reached out</p>
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

  const rankLabel = rank !== null ? `#${rank}` : '—';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-3xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg,rgba(91,106,245,0.1),rgba(139,92,246,0.08))',
        border: '1px solid rgba(91,106,245,0.2)',
        boxShadow: '0 4px 24px rgba(91,106,245,0.12)' }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--ink-400)' }}>Leaderboard</p>
          <h2 className="font-heading text-base font-extrabold text-white">Your Rank</h2>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs font-bold" style={{ color: '#10B981' }}>
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
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#EF4444,#F97316)' }}>
              {above.initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white">{above.name}</p>
              <p className="text-xs" style={{ color: 'var(--ink-380)' }}>{above.xp.toLocaleString()} XP</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-bold" style={{ color: '#F87171' }}>+{(above.xp - userXP).toLocaleString()} XP ahead</p>
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
            <p className="text-xs" style={{ color: 'var(--ink-400)' }}>{userXP.toLocaleString()} XP</p>
          </div>
          <p className="text-xs font-extrabold text-primary shrink-0">
            {loaded ? `Rank ${rankLabel}` : '…'}
          </p>
        </div>

        {/* Student below */}
        {below && (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl"
            style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)' }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#10B981,#059669)' }}>
              {below.initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white">{below.name}</p>
              <p className="text-xs" style={{ color: 'var(--ink-380)' }}>{below.xp.toLocaleString()} XP</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-bold" style={{ color: '#34D399' }}>{(userXP - below.xp).toLocaleString()} XP ahead</p>
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

// ── Primary Action Grid (Zone 3) ─────────────────────────────────────────────
const PRIMARY_TOOLS = [
  { id: 'pyq',       label: 'PYQ Bank',    sub: 'Past papers',     to: '/pyq',        gradient: 'linear-gradient(135deg,#3B82F6,#1D4ED8)',  glow: 'rgba(59,130,246,0.35)',  Icon: BookOpen },
  { id: 'mock',      label: 'Mock Test',   sub: 'Full syllabus',   to: '/mock-test',  gradient: 'linear-gradient(135deg,#EF4444,#B91C1C)',  glow: 'rgba(239,68,68,0.30)',   Icon: GraduationCap },
  { id: 'flashcard', label: 'Flashcards',  sub: 'Spaced review',   to: '/flashcard',  gradient: 'linear-gradient(135deg,#10B981,#047857)',  glow: 'rgba(16,185,129,0.30)',  Icon: BookMarked },
  { id: 'quiz',      label: 'AI Quiz',     sub: 'Adaptive test',   to: '/quiz',       gradient: 'linear-gradient(135deg,#8B5CF6,#6D28D9)',  glow: 'rgba(139,92,246,0.35)', Icon: Zap },
] as const;

function PrimaryActionGrid({ dueCards }: { dueCards: number }) {
  const navigate = useNavigate();
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
      <div className="grid grid-cols-2 gap-3">
        {PRIMARY_TOOLS.map((tool, i) => {
          const { Icon } = tool;
          const badge = tool.id === 'flashcard' && dueCards > 0 ? dueCards : null;
          return (
            <motion.button
              key={tool.id}
              onClick={() => navigate(tool.to)}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.06 + i * 0.04, type: 'spring', stiffness: 340, damping: 28 }}
              className="card-l1 p-4 flex flex-col gap-3 text-left active:scale-[0.97] transition-transform relative"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: tool.gradient, boxShadow: `0 4px 16px ${tool.glow}` }}
              >
                <Icon size={18} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-white leading-tight">{tool.label}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-400)' }}>{tool.sub}</p>
              </div>
              {badge !== null && (
                <div
                  className="absolute top-3 right-3 min-w-[20px] h-5 rounded-full flex items-center justify-center px-1.5 text-xs font-extrabold text-white"
                  style={{ background: 'linear-gradient(135deg,#10B981,#047857)', fontSize: 12 }}
                >
                  {badge > 99 ? '99+' : badge}
                </div>
              )}
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const { user, profile, loading } = useAuth();

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
  const [masteredCount, setMasteredCount]   = useState(0);
  const [showDay7Modal, setShowDay7Modal]   = useState(false);
  const [day7Stats, setDay7Stats]           = useState<Day7Stats | null>(null);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Show mood check-in once per day; hydrate todayMood from a prior check-in
  useEffect(() => {
    if (!user) return;
    const key = `edora_mood_${user.id}_${new Date().toISOString().slice(0, 10)}`;
    const existing = localStorage.getItem(key);
    if (existing) setTodayMood(existing);
    else setTimeout(() => setMoodOpen(true), 800);
  }, [user]);

  // Day 7 "first result" moment
  useEffect(() => {
    if (!user || !profile) return;
    const seenKey = `edora_day7_shown_${user.id}`;
    if (localStorage.getItem(seenKey)) return;

    const createdAt = new Date(profile.created_at ?? Date.now());
    const daysOld = Math.floor((Date.now() - createdAt.getTime()) / 86_400_000);
    if (daysOld < 7 || daysOld > 10) return;

    // Fetch mastery stats for the modal
    Promise.all([
      supabase
        .from('subtopic_mastery')
        .select('subject, mastery_score', { count: 'exact' })
        .eq('user_id', user.id)
        .gte('mastery_score', 0.7),
      supabase
        .from('subtopic_mastery')
        .select('subject, mastery_score')
        .eq('user_id', user.id)
        .order('mastery_score', { ascending: false })
        .limit(5),
    ]).then(([masteredRes, topRes]) => {
      const count = masteredRes.count ?? 0;
      if (count === 0) return; // nothing to show yet

      type MRow = { subject: string; mastery_score: number };
      const topRows = (topRes.data ?? []) as MRow[];
      const subjectAvg: Record<string, { sum: number; n: number }> = {};
      for (const r of topRows) {
        const s = subjectAvg[r.subject] ?? { sum: 0, n: 0 };
        s.sum += r.mastery_score; s.n++;
        subjectAvg[r.subject] = s;
      }
      const best = Object.entries(subjectAvg)
        .map(([subj, { sum, n }]) => ({ subj, avg: sum / n }))
        .sort((a, b) => b.avg - a.avg)[0];

      const examName = profile.exam_name ?? '';
      const totalSubtopics = examName.toLowerCase().includes('neet') ? 750
        : examName.toLowerCase().includes('jee') ? 850 : 800;

      setDay7Stats({
        masteredCount: count,
        topSubject: best?.subj ?? 'Physics',
        topPct: best ? Math.round(best.avg * 100) : 0,
        totalTopics: totalSubtopics });
      localStorage.setItem(seenKey, '1');
      setTimeout(() => setShowDay7Modal(true), 1500);
    }).catch(() => {});
  }, [user, profile]);

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
      // Mastered subtopics count (mastery_score >= 0.7)
      supabase.from('subtopic_mastery').select('subject, mastery_score', { count: 'exact' }).eq('user_id', user.id).gte('mastery_score', 0.7),
    ]).then(([sprintRes, weakRes, cardsRes, sessionRes, freezeRes, sprintCountRes, flashCountRes, lessonRes, masteryRes]) => {
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

      // Mastered subtopics
      const mastered = masteryRes.count ?? 0;
      setMasteredCount(mastered);

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
          ch: 'Chemistry', bi: 'Biology', en: 'English' };
        const code        = subjCode.replace(/\d+/g, '');
        const subjectName = subjectMap[code] ?? 'Science';
        setResumeLesson({
          lessonId: lastLesson.lesson_id,
          label,
          subject: subjectName,
          to: `/course?class=${classNum}&subject=${subjCode}&chapter=${chapterId}` });
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      examDays: examDaysLeft !== undefined && examDaysLeft > 0 ? examDaysLeft : undefined });
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Syllabus coverage %
  const examName4cov  = profile?.exam_name ?? '';
  const totalSubtopics = examName4cov.toLowerCase().includes('neet') ? 750
    : examName4cov.toLowerCase().includes('jee') ? 850 : 800;
  const coveragePct = Math.min(100, Math.round((masteredCount / totalSubtopics) * 100));

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
      icon: <Zap size={18} style={{ color: '#A0AEFF' }} /> });
  }
  if (weakTopics[0]) {
    actions.push({
      id: 'weak', label: `Practice ${weakTopics[0].topic}`,
      sub: `Your weakest area in ${weakTopics[0].subject}`,
      to: `/quiz?subject=${encodeURIComponent(weakTopics[0].subject)}&topic=${encodeURIComponent(weakTopics[0].topic)}`,
      color: '#EF4444',
      icon: <Target size={18} style={{ color: '#FCA5A5' }} /> });
  }
  if (dueCards > 0) {
    actions.push({
      id: 'cards', label: `Review ${Math.min(dueCards, 10)} Flashcards`,
      sub: `${dueCards} card${dueCards > 1 ? 's' : ''} due for spaced repetition`,
      to: '/flashcard', color: '#10B981',
      icon: <BookMarked size={18} style={{ color: '#6EE7B7' }} /> });
  }
  if (actions.length < 3) {
    actions.push({
      id: 'chat', label: 'Ask Novo a question',
      sub: 'AI tutor available 24/7',
      to: '/chat', color: '#8B5CF6',
      icon: <Bot size={18} style={{ color: '#C4B5FD' }} /> });
  }
  const top3 = actions.slice(0, 3);

  return (
    <div className="h-full native-scroll pb-nav" style={{ background: 'transparent' }}>
      <div className="px-4 pt-5 flex flex-col gap-3">

        {/* ── ZONE 1: STATUS BAR — header + streak/XP strip ───────── */}
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          className="v2-card rounded-3xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-sm font-bold text-white"
              style={{ background: 'var(--v2-primary)' }}
              aria-label={`${firstName}'s avatar`}
            >
              {initials}
            </div>
            <div>
              <p className="text-xs font-semibold" style={{ color: 'var(--v2-text-4)' }}>{getGreeting()}</p>
              <h1 className="font-heading text-xl font-extrabold leading-tight" style={{ color: 'var(--v2-text-1)' }}>{firstName}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setFreezeShopOpen(true)}
              aria-label={`${freezeCount} streak freeze${freezeCount !== 1 ? 's' : ''}`}
              className="flex items-center gap-1.5 px-2.5 rounded-full active:scale-90 transition-transform min-h-[44px]"
              style={{ background: 'rgba(56,189,248,0.10)', border: '1px solid rgba(56,189,248,0.22)' }}>
              <Snowflake size={12} style={{ color: '#38BDF8' }} />
              <span className="text-xs font-bold v2-tnum" style={{ color: '#38BDF8' }}>{freezeCount}</span>
            </button>
            <button onClick={() => window.dispatchEvent(new CustomEvent('edora:open-session-ritual'))}
              className="flex items-center gap-1.5 px-3 rounded-full active:scale-90 transition-transform min-h-[44px]"
              style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.28)' }}
              aria-label={`${streak} day streak`}>
              <Flame size={13}
                className={isEvening && streak > 0 ? 'streak-heartbeat' : ''}
                style={{ color: 'var(--v2-warning)' }} />
              <span className="text-xs font-extrabold v2-tnum" style={{ color: 'var(--v2-warning)' }}>{streak}</span>
            </button>
            <Link to="/reminders" aria-label="Reminders">
              <button className="w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                style={{ background: 'var(--v2-elevated)', border: '1px solid var(--v2-border)' }}>
                <Bell size={15} style={{ color: 'var(--v2-text-4)' }} strokeWidth={1.75} />
              </button>
            </Link>
          </div>
        </motion.div>

        {/* Compact XP progress strip */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.03 }}
          className="flex items-center gap-3 px-4 py-2.5 rounded-2xl v2-card">
          <XPRing progress={levelProgress} size={36} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-bold v2-tnum" style={{ color: 'var(--v2-text-1)' }}>Lv.{level} · {xp.toLocaleString()} XP</p>
              <p className="text-xs v2-tnum" style={{ color: 'var(--v2-text-4)' }}>{levelProgress}% to Lv.{level + 1}</p>
            </div>
            <div className="w-full rounded-full overflow-hidden" style={{ height: 3, background: 'var(--v2-border)' }}>
              <motion.div className="h-full rounded-full"
                style={{ background: 'var(--v2-primary)' }}
                initial={{ width: 0 }}
                animate={{ width: `${levelProgress}%` }}
                transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
              />
            </div>
          </div>
          {user && <RivalBadge userId={user.id} />}
        </motion.div>

        {/* ── URGENT: exam ≤14 days ────────────────────────────────── */}
        {isUrgent && profile?.exam_date && examDays !== null && examDays >= 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
            <ExamCountdownHeroCard examName={profile.exam_name ?? 'Your Exam'} days={examDays} coveragePct={coveragePct} />
            {weakTopics.length > 0 && <WeakTopicsSection topics={weakTopics} delay={0.08} />}
          </motion.div>
        )}

        {/* ── WAR ROOM — exam <48h ─────────────────────────────────── */}
        {isWarMode && profile?.exam_date && hoursLeft !== null && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <WarRoomBanner examName={profile.exam_name ?? 'Exam'} hoursLeft={Math.round(hoursLeft)} />
          </motion.div>
        )}

        {/* ── Proactive banner ─────────────────────────────────────── */}
        <NovoProactiveBanner />

        {/* ── ZONE 2: HERO ACTION — continue or start ──────────────── */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
          <ContinueCard hero={hero} loading={heroLoading} />
        </motion.div>

        {/* ── ZONE 3: PRIMARY TOOLS GRID ───────────────────────────── */}
        <PrimaryActionGrid dueCards={dueCards} />

        {/* ── ZONE 4: QUICK STATS — today's session progress ───────── */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }}>
          <DailyPowerRing />
        </motion.div>

        {/* ── ZONE 5: SECONDARY CONTENT ────────────────────────────── */}

        {/* Non-urgent exam countdown */}
        {!isUrgent && profile?.exam_date && examDays !== null && examDays >= 0 && (
          <ExamCountdownHeroCard examName={profile.exam_name ?? 'Your Exam'} days={examDays} coveragePct={coveragePct} />
        )}

        {/* Course resume */}
        {resumeLesson && <CourseResumeCard resume={resumeLesson} delay={0.1} />}

        {/* Weak topics */}
        {!isUrgent && weakTopics.length > 0 && <WeakTopicsSection topics={weakTopics} delay={0.1} />}

        {/* D30 experiment variants */}
        {d30Variant === 'social_first' && user && <SocialFeedCard userId={user.id} userXP={xp} />}
        {d30Variant === 'content_first' && <NovoInsightsCard />}

        {/* Today's Mission */}
        {user && (
          <TodaysMissionCard
            userId={user.id}
            onAllDone={() => checkLevel(getLevelFromXP((profile?.xp ?? 0) + 50))}
          />
        )}

        {/* AI Insights (non-content_first variants) */}
        {d30Variant !== 'content_first' && <NovoInsightsCard />}

        {/* Recommended Actions */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <RecommendedActions actions={top3} />
        </motion.div>

        {/* Focus Mode | Study Break */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.13 }}
          className="bento-grid">
          <button onClick={() => setFocusModeOpen(true)}
            className="card-l1 p-4 flex items-center gap-3 active:scale-97 transition-transform text-left">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(145deg,#7C3AED,#A855F7)', boxShadow: 'inset 0 1px 0 var(--ink-200), 0 4px 12px rgba(124,58,237,0.45)' }}>
              <Timer size={16} className="text-white" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">Focus Mode</p>
              <p className="text-xs" style={{ color: 'var(--ink-380)' }}>25-min timer</p>
            </div>
          </button>
          <button onClick={() => setMusicOpen(true)}
            className="card-l1 p-4 flex items-center gap-3 active:scale-97 transition-transform text-left">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(145deg,#059669,#10B981)', boxShadow: 'inset 0 1px 0 var(--ink-200), 0 4px 12px rgba(16,185,129,0.4)' }}>
              <Music size={16} className="text-white" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">Study Break</p>
              <p className="text-xs" style={{ color: 'var(--ink-380)' }}>10-min music</p>
            </div>
          </button>
        </motion.div>

        {/* Concept of Day */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
          <ConceptOfDayCard />
        </motion.div>

        {/* Novo AI CTA */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
          <Link to="/chat">
            <div className="card-l2 specular rounded-3xl p-4 flex items-center gap-4 active:scale-98 transition-transform">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 relative"
                style={{ background: 'linear-gradient(145deg,#6373F6,#7C3AED)', boxShadow: 'inset 0 1.5px 0 var(--ink-220), 0 6px 22px rgba(91,106,245,0.55)' }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: 14, background: 'radial-gradient(ellipse 65% 40% at 35% 28%, var(--ink-240), transparent 65%)', pointerEvents: 'none' }} />
                <TeachingIcon size={22} className="text-white relative z-10" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-wider mb-0.5 gradient-text">Novo AI</p>
                <p className="text-sm font-bold text-white leading-snug">Ask me anything, anytime</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-380)' }}>Your personal AI study tutor</p>
              </div>
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'rgba(91,106,245,0.18)', border: '1px solid rgba(91,106,245,0.28)' }}>
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

      {/* Study Break Player — 10-25 min slider, mood-aware YouTube playlist auto-pick */}
      <StudyBreakPlayer
        open={musicOpen}
        onClose={() => setMusicOpen(false)}
        breakMin={10}
        mood={todayMood}
        enforceBreak
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

      {/* Day 7 "first result" modal */}
      {showDay7Modal && day7Stats && (
        <Day7FirstResultModal
          stats={day7Stats}
          onClose={() => setShowDay7Modal(false)}
        />
      )}
    </div>
  );
}
