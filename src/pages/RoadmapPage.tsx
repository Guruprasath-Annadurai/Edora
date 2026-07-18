// ═══════════════════════════════════════════════════════════════
// Edora — RoadmapPage  (AI Study Roadmap)
//
// Phases:
//   loading    → fetch existing roadmap from DB
//   setup      → exam name + date form (pre-filled from profile)
//   generating → Gemini building the plan
//   view       → week-by-week calendar with check-off + recalibrate
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Calendar, CheckCircle2, Circle, ChevronDown,
  Sparkles, RefreshCw, Clock, BookOpen, Zap, AlertTriangle,
  Trophy, Target,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';

// ── Types ─────────────────────────────────────────────────────────────────────
interface RoadmapDay {
  day: number;
  subject: string;
  topic: string;
  description: string;
  duration_minutes: number;
}

interface RoadmapWeek {
  week_number: number;
  theme: string;
  days: RoadmapDay[];
}

interface StudyRoadmap {
  id: string;
  user_id: string;
  exam_name: string;
  exam_date: string;
  plan_summary: string;
  subjects: string[];
  weeks: RoadmapWeek[];
  start_date: string;
  total_days: number;
  plan_weeks: number;
  study_days_per_week: number;
  generated_at: string;
  recalibrated_at: string | null;
  status: string;
}

type Phase = 'loading' | 'setup' | 'generating' | 'view';

// ── Constants ─────────────────────────────────────────────────────────────────
const EXAM_PRESETS = [
  { name: 'JEE Mains' },
  { name: 'JEE Advanced' },
  { name: 'NEET' },
  { name: 'SAT' },
  { name: 'ACT' },
  { name: 'CBSE 12th' },
  { name: 'CBSE 10th' },
  { name: 'UPSC' },
  { name: 'CAT' },
  { name: 'IELTS' },
];

const GENERATING_MESSAGES = [
  'Analysing the exam syllabus…',
  'Mapping topics week by week…',
  'Balancing subjects for best coverage…',
  'Building your personalised plan…',
  'Almost done — finalising schedule…',
];

const SUBJECT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'Mathematics':            { bg: 'rgba(91,106,245,0.12)',  text: '#818CF8', dot: '#818CF8' },
  'Physics':                { bg: 'rgba(219,39,119,0.12)',  text: '#F472B6', dot: '#F472B6' },
  'Chemistry':              { bg: 'rgba(5,150,105,0.12)',   text: '#34D399', dot: '#34D399' },
  'Biology':                { bg: 'rgba(217,119,6,0.12)',   text: '#FBBF24', dot: '#FBBF24' },
  'English':                { bg: 'rgba(2,132,199,0.12)',   text: '#38BDF8', dot: '#38BDF8' },
  'History':                { bg: 'rgba(147,51,234,0.12)',  text: '#C084FC', dot: '#C084FC' },
  'Geography':              { bg: 'rgba(22,163,74,0.12)',   text: '#4ADE80', dot: '#4ADE80' },
  'Science':                { bg: 'rgba(234,88,12,0.12)',   text: '#FB923C', dot: '#FB923C' },
  'Social Science':         { bg: 'rgba(220,38,38,0.12)',   text: '#F87171', dot: '#F87171' },
  'Verbal Ability':         { bg: 'rgba(3,105,161,0.12)',   text: '#38BDF8', dot: '#38BDF8' },
  'Quantitative Aptitude':  { bg: 'rgba(67,56,202,0.12)',   text: '#818CF8', dot: '#818CF8' },
  'Logical Reasoning':      { bg: 'rgba(124,58,237,0.12)',  text: '#A78BFA', dot: '#A78BFA' },
  'Data Interpretation':    { bg: 'rgba(4,120,87,0.12)',    text: '#34D399', dot: '#34D399' },
};

function subjectStyle(subject: string) {
  return SUBJECT_COLORS[subject] ?? { bg: 'rgba(91,106,245,0.12)', text: '#818CF8', dot: '#818CF8' };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exam  = new Date(dateStr); exam.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((exam.getTime() - today.getTime()) / 86_400_000));
}

/**
 * Maps today's calendar date to the correct STUDY-day index.
 *
 * Study days are numbered sequentially (1..N) skipping rest days.
 * A plan with 5 days/week maps:
 *   elapsed 0-4  → study days 1-5   (Mon-Fri, week 1)
 *   elapsed 5-6  → rest (clamp → 5) (Sat-Sun, week 1)
 *   elapsed 7-11 → study days 6-10  (Mon-Fri, week 2)
 *
 * Returns:
 *   dayIndex   — 1-based study day (clamped to last study day on rest days)
 *   isRestDay  — true when today is a configured rest day
 *   beforeStart — true when today is before the plan start date
 */
interface StudyDayInfo { dayIndex: number; isRestDay: boolean; beforeStart: boolean; }

function todayStudyDay(startDate: string, daysPerWeek: number): StudyDayInfo {
  const start = new Date(startDate + 'T00:00:00Z');
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const elapsed = Math.floor((today.getTime() - start.getTime()) / 86_400_000);
  if (elapsed < 0) return { dayIndex: 0, isRestDay: false, beforeStart: true };
  const calWeek   = Math.floor(elapsed / 7);
  const dayOfWeek = elapsed % 7;
  const isRestDay = dayOfWeek >= daysPerWeek;
  const dayIndex  = calWeek * daysPerWeek + Math.min(dayOfWeek, daysPerWeek - 1) + 1;
  return { dayIndex, isRestDay, beforeStart: false };
}

/** Which week number contains the given study-day index? */
function currentWeekNumber(dayIdx: number, daysPerWeek: number): number {
  if (dayIdx <= 0) return 1;
  return Math.max(1, Math.ceil(dayIdx / daysPerWeek));
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SubjectPill({ subject, small = false }: { subject: string; small?: boolean }) {
  const s = subjectStyle(subject);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${small ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'}`}
      style={{ background: s.bg, color: s.text }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.dot }} />
      {subject}
    </span>
  );
}

function DayRow({
  day, completed, isToday, isPast, onToggle, disabled,
}: {
  day: RoadmapDay; completed: boolean; isToday: boolean; isPast: boolean;
  onToggle: () => void; disabled?: boolean;
}) {
  return (
    <motion.button
      onClick={onToggle}
      disabled={disabled}
      whileTap={{ scale: 0.98 }}
      className={`w-full flex items-start gap-3 px-3 py-3 rounded-2xl text-left transition-all ${
        isToday
          ? 'ring-2 ring-primary/30'
          : ''
      } ${completed ? 'opacity-60' : ''}`}
      style={{
        background: isToday
          ? 'linear-gradient(135deg, rgba(91,106,245,0.12), rgba(139,92,246,0.12))'
          : 'transparent',
      }}>
      {/* Checkbox */}
      <div className="shrink-0 mt-0.5">
        {completed
          ? <CheckCircle2 size={18} className="text-emerald-500" />
          : <Circle size={18} className={isPast ? 'text-red-300' : 'text-muted-foreground/40'} />
        }
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <SubjectPill subject={day.subject} small />
          {isToday && (
            <span className="text-[9px] font-bold uppercase tracking-wide text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
              TODAY
            </span>
          )}
          {!isToday && isPast && !completed && (
            <span className="text-[9px] font-bold uppercase tracking-wide text-red-400 px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(239,68,68,0.15)' }}>
              MISSED
            </span>
          )}
        </div>
        <p className={`text-sm font-semibold mt-0.5 leading-snug ${completed ? 'line-through text-muted-foreground' : 'text-white'}`}>
          {day.topic}
        </p>
        {(isToday || !completed) && (
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
            {day.description}
          </p>
        )}
      </div>

      {/* Duration */}
      <div className="shrink-0 flex items-center gap-0.5 text-muted-foreground/60 mt-0.5">
        <Clock size={11} />
        <span className="text-[10px]">{day.duration_minutes}m</span>
      </div>
    </motion.button>
  );
}

function WeekCard({
  week, dayIdx, progress, onToggle, defaultOpen,
}: {
  week: RoadmapWeek;
  dayIdx: number;
  daysPerWeek?: number;
  progress: Map<number, boolean>;
  onToggle: (dayIndex: number) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const completed  = week.days.filter(d => progress.get(d.day)).length;
  const total      = week.days.length;
  const pct        = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isCurrentW = week.days.some(d => d.day === dayIdx);
  const isPastW    = week.days.every(d => d.day < dayIdx);

  const weekColor = isPastW && pct === 100
    ? '#10B981'
    : isCurrentW
    ? '#5B6AF5'
    : '#9CA3AF';

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${
      isCurrentW ? 'border-primary/30' : 'border-border'
    }`}
      style={{ background: 'var(--hdr-b-750)', backdropFilter: 'blur(10px)' }}>
      {/* Week header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
        {/* Week number badge */}
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold text-white"
          style={{ background: weekColor }}>
          {week.week_number}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Week {week.week_number}
          </p>
          <p className="text-sm font-semibold text-white truncate leading-tight">{week.theme}</p>
        </div>

        {/* Progress */}
        <div className="shrink-0 flex items-center gap-2">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold" style={{ color: weekColor }}>
              {completed}/{total}
            </span>
            <div className="w-16 h-1.5 rounded-full overflow-hidden mt-0.5" style={{ background: 'var(--ink-100)' }}>
              <div className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: weekColor }} />
            </div>
          </div>
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={15} className="text-muted-foreground" />
          </motion.div>
        </div>
      </button>

      {/* Day rows */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}>
            <div className="px-2 pb-2 pt-1 flex flex-col gap-0.5" style={{ borderTop: '1px solid var(--ink-070)' }}>
              {week.days.map(day => (
                <DayRow
                  key={day.day}
                  day={day}
                  completed={progress.get(day.day) ?? false}
                  isToday={day.day === dayIdx}
                  isPast={day.day < dayIdx}
                  onToggle={() => onToggle(day.day)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RoadmapPage() {
  const { user, profile } = useAuth();

  const [phase,       setPhase]       = useState<Phase>('loading');
  const [roadmap,     setRoadmap]     = useState<StudyRoadmap | null>(null);
  const [progress,    setProgress]    = useState<Map<number, boolean>>(new Map());
  const [error,       setError]       = useState('');

  // Setup form state (pre-filled from profile)
  const [examName, setExamName] = useState('');
  const [examDate, setExamDate] = useState('');

  // Generating animation
  const [genMsgIdx,   setGenMsgIdx]   = useState(0);
  const genMsgTimer = useRef<ReturnType<typeof setInterval>>();

  // Recalibrate
  const [isRecal,     setIsRecal]     = useState(false);
  const [recalDone,   setRecalDone]   = useState(false);
  const [missedCount, setMissedCount] = useState(0);

  // ── Fetch roadmap on mount ─────────────────────────────────────────────────
  const fetchRoadmap = useCallback(async () => {
    if (!user) return;
    setPhase('loading');

    const { data: rm } = await supabase
      .from('study_roadmaps')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (rm) {
      const { data: prog } = await supabase
        .from('study_roadmap_progress')
        .select('day_index, completed, completed_at')
        .eq('roadmap_id', rm.id);

      const progMap = new Map<number, boolean>();
      for (const p of (prog ?? [])) {
        if (p.completed) progMap.set(p.day_index, true);
      }
      setRoadmap(rm as StudyRoadmap);
      setProgress(progMap);
      setPhase('view');
    } else {
      // Pre-fill from profile
      setExamName(profile?.exam_name ?? '');
      setExamDate(profile?.exam_date ?? '');
      setPhase('setup');
    }
  }, [user, profile]);

  useEffect(() => { fetchRoadmap(); }, [fetchRoadmap]);

  // ── Generating animation ───────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'generating') {
      genMsgTimer.current = setInterval(() => {
        setGenMsgIdx(i => (i + 1) % GENERATING_MESSAGES.length);
      }, 2800);
    } else {
      clearInterval(genMsgTimer.current);
      setGenMsgIdx(0);
    }
    return () => clearInterval(genMsgTimer.current);
  }, [phase]);

  // ── Generate ───────────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (!examName.trim() || !examDate) { setError('Please enter both exam name and date.'); return; }
    const daysLeft = daysUntil(examDate);
    if (daysLeft < 7) { setError('Exam date must be at least 7 days away.'); return; }

    setError('');
    setPhase('generating');

    try {
      const { data, error: fnErr } = await supabase.functions.invoke('roadmap-generator', {
        body: { mode: 'generate', exam_name: examName.trim(), exam_date: examDate, study_level: profile?.study_level ?? 'school' },
      });

      if (fnErr) throw new Error(fnErr.message);
      if (!data?.roadmap) throw new Error('No roadmap returned');

      setRoadmap(data.roadmap as StudyRoadmap);
      setProgress(new Map());
      setPhase('view');
      track('roadmap_generated', { exam: examName, days_until: daysLeft });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate roadmap. Please try again.');
      setPhase('setup');
    }
  }

  // ── Toggle day completion ──────────────────────────────────────────────────
  async function toggleDay(dayIndex: number) {
    if (!roadmap || !user) return;
    const wasCompleted = progress.get(dayIndex) ?? false;
    const nowCompleted = !wasCompleted;

    // Optimistic update
    setProgress(prev => {
      const next = new Map(prev);
      next.set(dayIndex, nowCompleted);
      return next;
    });

    const { error: upsertErr } = await supabase
      .from('study_roadmap_progress')
      .upsert({
        user_id:     user.id,
        roadmap_id:  roadmap.id,
        day_index:   dayIndex,
        completed:   nowCompleted,
        completed_at: nowCompleted ? new Date().toISOString() : null,
      }, { onConflict: 'roadmap_id,day_index' });

    if (upsertErr) {
      // Revert on error
      setProgress(prev => {
        const next = new Map(prev);
        next.set(dayIndex, wasCompleted);
        return next;
      });
    }
  }

  // ── Recalibrate ────────────────────────────────────────────────────────────
  async function handleRecalibrate(useNemotron = false) {
    if (!roadmap) return;
    setIsRecal(true);
    setError('');

    const completedIndices = Array.from(progress.entries())
      .filter(([, v]) => v)
      .map(([k]) => k);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke('roadmap-generator', {
        body: { mode: 'recalibrate', roadmap_id: roadmap.id, completed_day_indices: completedIndices, use_nemotron: useNemotron },
      });

      // Soft errors — edge function returns 200 with a code field
      if (data?.code) {
        if (data.code === 'EXAM_TOO_CLOSE') {
          // Pivot to setup so the user can generate a focused last-mile plan
          setError('Your exam is very close — Novo will generate a focused last-stretch plan for you.');
          setExamName(roadmap.exam_name);
          setExamDate(roadmap.exam_date);
          setPhase('setup');
        } else {
          setError(data.error ?? 'Recalibration failed — please try again.');
        }
        return;
      }

      if (fnErr) throw new Error(fnErr.message);
      if (!data?.roadmap) throw new Error('No updated roadmap returned');

      setRoadmap(data.roadmap as StudyRoadmap);
      setMissedCount(data.missed_count ?? 0);
      setRecalDone(true);
      setTimeout(() => setRecalDone(false), 4000);
      track('roadmap_recalibrated', { missed: data.missed_count });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recalibration failed — please try again.');
    } finally {
      setIsRecal(false);
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  // Use study-day-aware mapping — rest days are NOT counted as missed
  const studyDayInfo = roadmap
    ? todayStudyDay(roadmap.start_date, roadmap.study_days_per_week)
    : null;
  const dayIdx      = studyDayInfo?.dayIndex ?? 0;
  const isRestDay   = studyDayInfo?.isRestDay ?? false;
  const beforeStart = studyDayInfo?.beforeStart ?? false;

  const currWeekNum  = currentWeekNumber(dayIdx, roadmap?.study_days_per_week ?? 5);
  const totalDays    = roadmap?.total_days ?? 0;
  const completedCnt = Array.from(progress.values()).filter(Boolean).length;
  const progressPct  = totalDays > 0 ? Math.round((completedCnt / totalDays) * 100) : 0;
  const daysLeft     = roadmap ? daysUntil(roadmap.exam_date) : 0;

  // Missed days = study days before today that aren't completed.
  // Rest days are never in the plan, so they're never counted as missed.
  const missedDays = (roadmap && !beforeStart)
    ? roadmap.weeks.flatMap(w => w.days).filter(d => d.day < dayIdx && !(progress.get(d.day) ?? false)).length
    : 0;

  // Today's focus task (null on rest days, before-start, or past-plan)
  const todayTask = (roadmap && !isRestDay && !beforeStart && dayIdx > 0)
    ? roadmap.weeks.flatMap(w => w.days).find(d => d.day === dayIdx) ?? null
    : null;

  // ── Phase: Loading ─────────────────────────────────────────────────────────
  if (phase === 'loading') return (
    <div className="flex flex-col h-full bg-gradient-page">
      <div className="px-4 py-3 flex items-center gap-3 shrink-0 shrink-0"
        style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
        <Link aria-label="Go back" to="/home" className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
          style={{ background: 'var(--ink-040)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', border: '1px solid var(--ink-100)' }}>
          <ArrowLeft size={17} className="text-white" />
        </Link>
        <h1 className="font-heading text-lg font-bold text-white">Study Roadmap</h1>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      </div>
    </div>
  );

  // ── Phase: Setup ───────────────────────────────────────────────────────────
  if (phase === 'setup') return (
    <div className="flex flex-col h-full bg-gradient-page">
      <div className="px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
        <Link aria-label="Go back" to="/home" className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
          style={{ background: 'var(--ink-040)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', border: '1px solid var(--ink-100)' }}>
          <ArrowLeft size={17} className="text-white" />
        </Link>
        <div>
          <h1 className="font-heading text-lg font-bold text-white">Study Roadmap</h1>
          <p className="text-xs text-muted-foreground">AI-powered week-by-week plan</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto native-scroll pb-nav px-4 py-5 flex flex-col gap-5">

        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-5 flex flex-col items-center text-center gap-3"
          style={{ background: 'linear-gradient(135deg, var(--grad-purple-header-1), var(--grad-purple-header-2))' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--ink-120)' }}>
            <Calendar size={26} className="text-white" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-white">Your AI Study Plan</h2>
            <p className="text-purple-300 text-sm mt-1 leading-relaxed">
              Enter your exam and Novo will build a personalised, day-by-day roadmap that adapts as you progress.
            </p>
          </div>
        </motion.div>

        {/* Exam selector */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Select Exam</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {EXAM_PRESETS.map(ex => (
              <button key={ex.name} onClick={() => setExamName(ex.name)}
                className="flex items-center gap-2.5 px-3 py-3 rounded-2xl border text-left transition-all active:scale-95"
                style={examName === ex.name
                  ? { background: 'var(--v2-primary-tint-2)', borderColor: 'var(--v2-primary)' }
                  : { background: 'var(--v2-card)', borderColor: 'var(--v2-border)' }}>
                <span className="text-sm font-semibold" style={{ color: examName === ex.name ? 'var(--v2-primary)' : 'var(--v2-text-1)' }}>{ex.name}</span>
              </button>
            ))}
          </div>
          {/* Custom exam input */}
          <div className="rounded-2xl flex items-center px-3 h-11 v2-card">
            <BookOpen size={15} style={{ color: 'var(--v2-text-4)' }} className="mr-2 shrink-0" />
            <input
              type="text" placeholder="Or type your exam name…"
              value={examName} onChange={e => setExamName(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-[color:var(--v2-text-4)]"
              style={{ color: 'var(--v2-text-1)', WebkitUserSelect: 'text', userSelect: 'text' }} />
          </div>
        </motion.div>

        {/* Exam date */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Exam Date</p>
          <div className="rounded-2xl flex items-center px-3 h-11 v2-card">
            <Calendar size={15} style={{ color: 'var(--v2-text-4)' }} className="mr-2 shrink-0" />
            <input
              type="date" value={examDate} onChange={e => setExamDate(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--v2-text-1)', WebkitUserSelect: 'text', userSelect: 'text' }} />
          </div>
          {examDate && daysUntil(examDate) > 0 && (
            <p className="text-xs text-muted-foreground mt-1.5 ml-1">
              {daysUntil(examDate)} days away
            </p>
          )}
        </motion.div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <AlertTriangle size={14} className="text-red-400 shrink-0" />
            <p className="text-xs text-red-400 font-medium">{error}</p>
          </div>
        )}

        {/* Generate button */}
        <motion.button
          onClick={handleGenerate}
          disabled={!examName || !examDate}
          whileTap={{ scale: 0.97 }}
          className="w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
          <Sparkles size={16} />
          Generate My Study Roadmap
        </motion.button>

        <div className="h-4" />
      </div>
    </div>
  );

  // ── Phase: Generating ──────────────────────────────────────────────────────
  if (phase === 'generating') return (
    <div className="flex flex-col h-full bg-gradient-page items-center justify-center px-6 gap-6">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary" />
      <div className="text-center">
        <h2 className="font-heading text-xl font-bold text-white mb-2">Building Your Roadmap</h2>
        <AnimatePresence mode="wait">
          <motion.p
            key={genMsgIdx}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="text-sm text-muted-foreground">
            {GENERATING_MESSAGES[genMsgIdx]}
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="text-xs text-muted-foreground text-center max-w-xs leading-relaxed">
        Novo is analysing the {examName} syllabus and building your personalised week-by-week plan.
      </div>
    </div>
  );

  // ── Phase: View ────────────────────────────────────────────────────────────
  if (phase === 'view' && roadmap) return (
    <div className="flex flex-col h-full bg-gradient-page">

      {/* ── Header ── */}
      <div className="shrink-0"
        style={{ background: 'linear-gradient(160deg, var(--grad-purple-header-1) 0%, var(--grad-purple-header-2) 60%, var(--grad-purple-header-3) 100%)' }}>
        <div className="px-4 pt-4 pb-5">
          <div className="flex items-center gap-3 mb-4">
            <Link aria-label="Go back" to="/home"
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'var(--ink-120)' }}>
              <ArrowLeft size={17} className="text-white" />
            </Link>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-widest text-yellow-300">Study Roadmap</p>
              <h1 className="font-heading text-lg font-bold text-white leading-tight truncate">
                {roadmap.exam_name}
              </h1>
            </div>
            <button
              onClick={() => { setExamName(roadmap.exam_name); setExamDate(roadmap.exam_date); setPhase('setup'); }}
              className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-white/80 shrink-0"
              style={{ background: 'var(--ink-120)' }}>
              Change
            </button>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Days Left',  value: daysLeft,        icon: Calendar, color: '#FCD34D' },
              { label: 'Done',       value: `${completedCnt}/${totalDays}`, icon: CheckCircle2, color: '#34D399' },
              { label: 'Progress',   value: `${progressPct}%`, icon: Trophy, color: '#818CF8' },
              { label: 'Missed',     value: missedDays,      icon: AlertTriangle, color: missedDays > 0 ? '#F87171' : '#34D399' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="rounded-2xl p-2.5 text-center"
                style={{ background: 'var(--ink-080)' }}>
                <Icon size={15} style={{ color }} className="mx-auto mb-1" />
                <p className="font-heading font-bold text-sm text-white leading-none">{value}</p>
                <p className="text-[9px] text-purple-300 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #818CF8, #34D399)' }}
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 1, ease: 'easeOut' }} />
          </div>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto native-scroll pb-nav px-4 py-4 flex flex-col gap-4">

        {/* ── Recalibrate banner ── */}
        <AnimatePresence>
          {recalDone && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2.5 px-4 py-3 rounded-2xl"
              style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)' }}>
              <CheckCircle2 size={16} style={{ color: '#34D399' }} className="shrink-0" />
              <div>
                <p className="text-sm font-bold" style={{ color: '#34D399' }}>Plan recalibrated!</p>
                <p className="text-xs text-muted-foreground">
                  {missedCount} missed topic{missedCount !== 1 ? 's' : ''} redistributed across upcoming weeks.
                </p>
              </div>
            </motion.div>
          )}
          {!recalDone && missedDays > 2 && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl"
              style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <AlertTriangle size={16} style={{ color: '#FBBF24' }} className="shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold" style={{ color: '#FBBF24' }}>
                  {missedDays} day{missedDays !== 1 ? 's' : ''} behind
                </p>
                <p className="text-xs text-muted-foreground">Novo can redistribute missed topics across upcoming weeks.</p>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button onClick={() => handleRecalibrate(false)} disabled={isRecal}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}>
                  {isRecal
                    ? <><div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Updating…</>
                    : <><RefreshCw size={11} /> Recalibrate</>
                  }
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Deep re-optimize — reasons over actual retention data (sr_cards), not just missed-topic count. Slower, opt-in. */}
        {!recalDone && roadmap && (
          <button onClick={() => handleRecalibrate(true)} disabled={isRecal}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-xs font-semibold disabled:opacity-60"
            style={{ background: 'var(--v2-card, rgba(139,92,246,0.08))', border: '1px solid rgba(139,92,246,0.25)', color: '#C4B5FD' }}>
            <Sparkles size={13} />
            {isRecal ? 'Deep re-optimizing…' : 'Deep re-optimize (uses your retention data — slower, more precise)'}
          </button>
        )}

        {/* ── Today's card — three states: before-start / rest day / study day ── */}
        {beforeStart ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
              Today's Focus
            </p>
            <div className="rounded-3xl p-5 flex flex-col items-center text-center gap-2"
              style={{ background: 'var(--ink-040)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', border: '1px solid var(--ink-080)' }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(91,106,245,0.15)' }}>
                <Calendar size={22} className="text-primary" />
              </div>
              <p className="font-bold text-base text-white">Your plan kicks off tomorrow</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Day 1 is scheduled for {formatDate(roadmap.start_date)}. Rest up — the journey starts soon!
              </p>
            </div>
          </motion.div>
        ) : isRestDay ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
              Today's Focus
            </p>
            <div className="rounded-3xl p-5 flex flex-col items-center text-center gap-2"
              style={{ background: 'var(--ink-040)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', border: '1px solid var(--ink-080)' }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(52,211,153,0.15)' }}>
                <Sparkles size={22} style={{ color: '#34D399' }} />
              </div>
              <p className="font-bold text-base text-white">Rest Day</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Recharge today — your brain consolidates what you studied. Back at it tomorrow!
              </p>
            </div>
          </motion.div>
        ) : todayTask ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
              Today's Focus
            </p>
            <div className="rounded-3xl p-4"
              style={{ background: 'var(--ink-040)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', border: '1px solid rgba(91,106,245,0.3)' }}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: subjectStyle(todayTask.subject).bg }}>
                  <Target size={18} style={{ color: subjectStyle(todayTask.subject).text }} />
                </div>
                <div className="flex-1 min-w-0">
                  <SubjectPill subject={todayTask.subject} />
                  <p className="font-bold text-base text-white mt-1 leading-snug">{todayTask.topic}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{todayTask.description}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock size={12} />
                      <span className="text-xs">{todayTask.duration_minutes} min</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Zap size={12} />
                      <span className="text-xs">Day {todayTask.day} of {totalDays}</span>
                    </div>
                  </div>
                </div>
              </div>
              <button
                onClick={() => toggleDay(todayTask.day)}
                className="mt-3 w-full py-2.5 rounded-2xl text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-2 text-white"
                style={progress.get(todayTask.day)
                  ? { background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)', color: '#34D399' }
                  : { background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
                {progress.get(todayTask.day)
                  ? <><CheckCircle2 size={15} /> Done — great work!</>
                  : <><Circle size={15} /> Mark as Complete</>
                }
              </button>
            </div>
          </motion.div>
        ) : null}

        {/* ── Week list ── */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
            Full Schedule — {roadmap.plan_weeks} Weeks
          </p>
          <div className="flex flex-col gap-2.5">
            {roadmap.weeks.map(week => (
              <WeekCard
                key={week.week_number}
                week={week}
                dayIdx={dayIdx}
                daysPerWeek={roadmap.study_days_per_week}
                progress={progress}
                onToggle={toggleDay}
                defaultOpen={week.week_number === currWeekNum}
              />
            ))}
          </div>
        </div>

        {/* Plan summary */}
        {roadmap.plan_summary && (
          <div className="rounded-2xl p-4"
            style={{ background: 'var(--ink-040)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', border: '1px solid var(--ink-080)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-primary" />
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Novo's Strategy</p>
            </div>
            <p className="text-sm text-white/80 leading-relaxed">{roadmap.plan_summary}</p>
            {roadmap.recalibrated_at && (
              <p className="text-[10px] text-muted-foreground mt-2">
                Recalibrated {new Date(roadmap.recalibrated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <AlertTriangle size={14} className="text-red-400 shrink-0" />
            <p className="text-xs text-red-400 font-medium">{error}</p>
          </div>
        )}

        {/* Regenerate entire plan option */}
        <button
          onClick={() => { setExamName(roadmap.exam_name); setExamDate(roadmap.exam_date); setPhase('setup'); }}
          className="w-full py-3 rounded-2xl text-xs font-bold text-muted-foreground active:scale-95 transition-all flex items-center justify-center gap-2"
          style={{ background: 'var(--ink-040)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', border: '1px solid var(--ink-080)' }}>
          <RefreshCw size={13} />
          Start a new roadmap
        </button>

        <div className="h-4" />
      </div>
    </div>
  );

  return null;
}
