import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarDays, ChevronLeft, Sparkles, CheckCircle2, Circle,
  Clock, AlertTriangle, BookOpen, Zap, Trophy, RefreshCw,
  ChevronRight, ChevronDown, CalendarCheck, Target, X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { geminiJSON } from '@/lib/gemini';
import { Toast } from '@capacitor/toast';

// ── Types ─────────────────────────────────────────────────────────────────────
interface PlanWeek {
  week: number;
  label: string;              // "Week 1 — Jun 16–22"
  chapters: PlanChapter[];
  mock_test?: boolean;
  buffer_day?: boolean;
}
interface PlanChapter {
  id: string;
  subject: string;
  chapter: string;
  hours: number;
  priority: 'high' | 'medium' | 'low';
  done: boolean;
}
interface RevisionPlan {
  id: string;
  exam_name: string;
  exam_date: string;
  weeks: PlanWeek[];
  chapters_count: number;
  daily_hours: number;
  created_at: string;
}
interface StatusInfo {
  weeks_elapsed: number;
  chapters_done: number;
  chapters_total: number;
  on_track: boolean;
  days_behind: number;
  recommendation?: string;
}

const PRIORITY_STYLE = {
  high:   { color: '#EF4444', bg: 'rgba(239,68,68,0.1)',   label: 'High' },
  medium: { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  label: 'Medium' },
  low:    { color: '#6EE7B7', bg: 'rgba(16,185,129,0.1)',  label: 'Low' },
};

const CHAPTER_LISTS: Record<string, string[]> = {
  Physics:     ['Physical World & Units','Motion in a Straight Line','Motion in a Plane','Laws of Motion','Work Energy & Power','System of Particles & Rotational Motion','Gravitation','Mechanical Properties of Solids','Mechanical Properties of Fluids','Thermal Properties of Matter','Thermodynamics','Kinetic Theory','Oscillations','Waves','Electric Charges & Fields','Electrostatic Potential & Capacitance','Current Electricity','Moving Charges & Magnetism','Magnetism & Matter','Electromagnetic Induction','Alternating Current','Electromagnetic Waves','Ray Optics','Wave Optics','Dual Nature of Radiation','Atoms','Nuclei','Semiconductor Electronics'],
  Chemistry:   ['Some Basic Concepts','Structure of Atom','Classification of Elements','Chemical Bonding','States of Matter','Thermodynamics','Equilibrium','Redox Reactions','Hydrogen','s-Block Elements','p-Block Elements (11)','Organic Chemistry - Basic','Hydrocarbons','Environmental Chemistry','Solid State','Solutions','Electrochemistry','Chemical Kinetics','Surface Chemistry','Isolation of Elements','p-Block Elements (12)','d & f Block Elements','Coordination Compounds','Haloalkanes & Haloarenes','Alcohols Phenols & Ethers','Aldehydes & Ketones','Carboxylic Acids','Amines','Biomolecules','Polymers','Chemistry in Everyday Life'],
  Mathematics: ['Sets','Relations & Functions','Trigonometric Functions','Mathematical Induction','Complex Numbers','Linear Inequalities','Permutations & Combinations','Binomial Theorem','Sequences & Series','Straight Lines','Conic Sections','3D Geometry (11)','Limits & Derivatives','Mathematical Reasoning','Statistics','Probability (11)','Relations & Functions (12)','Inverse Trig','Matrices','Determinants','Continuity & Differentiability','Applications of Derivatives','Integrals','Applications of Integrals','Differential Equations','Vectors','3D Geometry (12)','Linear Programming','Probability (12)'],
  Biology:     ['Living World','Biological Classification','Plant Kingdom','Animal Kingdom','Morphology of Flowering Plants','Anatomy of Flowering Plants','Structural Organisation in Animals','Cell — Unit of Life','Biomolecules','Cell Cycle & Cell Division','Transport in Plants','Mineral Nutrition','Photosynthesis','Respiration in Plants','Plant Growth & Development','Digestion & Absorption','Breathing & Exchange of Gases','Body Fluids & Circulation','Excretory Products & Elimination','Locomotion & Movement','Neural Control & Coordination','Chemical Coordination','Reproduction in Organisms','Sexual Reproduction in Flowering Plants','Human Reproduction','Reproductive Health','Heredity & Variation','Molecular Basis of Inheritance','Evolution','Human Health & Disease','Strategies for Food Production','Microbes in Human Welfare','Biotechnology - Principles','Biotechnology — Applications','Organisms & Populations','Ecosystem','Biodiversity','Environmental Issues'],
};

// ── Status bar ────────────────────────────────────────────────────────────────
function StatusBanner({ info }: { info: StatusInfo }) {
  if (info.on_track && info.days_behind === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-2xl mb-4"
        style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
        <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
        <div>
          <p className="text-sm font-bold text-emerald-300">You're on track 🎯</p>
          <p className="text-xs text-white/50">{info.chapters_done}/{info.chapters_total} chapters done</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 px-4 py-3 rounded-2xl mb-4"
      style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
      <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-bold text-red-300">
          You're {info.days_behind} day{info.days_behind !== 1 ? 's' : ''} behind plan
        </p>
        {info.recommendation && (
          <p className="text-xs text-white/50 mt-0.5">{info.recommendation}</p>
        )}
      </div>
    </div>
  );
}

// ── Calendar heatmap ──────────────────────────────────────────────────────────
function HeatmapBar({ plan }: { plan: RevisionPlan }) {
  const examDate = new Date(plan.exam_date);
  const today = new Date();
  const totalDays = Math.ceil((examDate.getTime() - new Date(plan.created_at).getTime()) / 86400000);
  const daysPassed = Math.ceil((today.getTime() - new Date(plan.created_at).getTime()) / 86400000);
  const chapsDone = plan.weeks.flatMap(w => w.chapters).filter(c => c.done).length;
  const chapsTotal = plan.weeks.flatMap(w => w.chapters).length;
  const progress = chapsTotal ? chapsDone / chapsTotal : 0;

  const cells: { intensity: number; isToday: boolean; isPast: boolean }[] = [];
  for (let d = 0; d < Math.min(totalDays, 84); d++) {
    const isPast = d < daysPassed;
    const isToday = d === daysPassed;
    const weekIdx = Math.floor(d / 7);
    const week = plan.weeks[weekIdx];
    const intensity = week
      ? (week.chapters.filter(c => c.done).length / Math.max(week.chapters.length, 1))
      : 0;
    cells.push({ intensity: isPast ? Math.max(intensity, 0.2) : intensity, isToday, isPast });
  }

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-white/50">Study intensity heatmap</p>
        <p className="text-xs text-white/40">{Math.ceil(progress * 100)}% complete</p>
      </div>
      <div className="flex flex-wrap gap-0.5">
        {cells.map((c, i) => (
          <div
            key={i}
            className="w-3.5 h-3.5 rounded-sm"
            style={{
              background: c.isToday
                ? '#5B6AF5'
                : c.isPast
                  ? `rgba(91,106,245,${0.15 + c.intensity * 0.85})`
                  : `rgba(255,255,255,${c.intensity * 0.1})`,
              border: c.isToday ? '1.5px solid #8B9BFA' : '1px solid rgba(255,255,255,0.04)',
            }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <p className="text-[9px] text-white/25">Less</p>
        <div className="flex gap-0.5">
          {[0.15, 0.3, 0.5, 0.7, 0.9].map(o => (
            <div key={o} className="w-3 h-3 rounded-sm" style={{ background: `rgba(91,106,245,${o})` }} />
          ))}
        </div>
        <p className="text-[9px] text-white/25">More</p>
      </div>
    </div>
  );
}

// ── Week block ────────────────────────────────────────────────────────────────
function WeekBlock({ week, onToggle }: { week: PlanWeek; onToggle: (id: string) => void }) {
  const [open, setOpen] = useState(week.week === 1);
  const done = week.chapters.filter(c => c.done).length;
  const total = week.chapters.length;

  return (
    <div className="rounded-2xl overflow-hidden mb-3" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <button className="w-full px-4 py-3.5 flex items-center justify-between" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: done === total && total > 0 ? 'rgba(16,185,129,0.2)' : 'rgba(91,106,245,0.15)' }}>
            {done === total && total > 0
              ? <CheckCircle2 size={14} className="text-emerald-400" />
              : <CalendarDays size={14} className="text-indigo-400" />
            }
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-white">{week.label}</p>
            <p className="text-[10px] text-white/40 mt-0.5">
              {done}/{total} chapters {week.mock_test ? '· Mock test' : ''}
              {week.buffer_day ? '· Buffer day' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Mini progress */}
          <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${total ? (done/total)*100 : 0}%`, background: '#5B6AF5' }} />
          </div>
          {open ? <ChevronDown size={14} className="text-white/30" /> : <ChevronRight size={14} className="text-white/30" />}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-4 pb-4 space-y-2 border-t border-white/5 pt-2">
              {week.chapters.map(ch => {
                const p = PRIORITY_STYLE[ch.priority];
                return (
                  <button
                    key={ch.id}
                    onClick={() => onToggle(ch.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all active:scale-98"
                    style={{ background: ch.done ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.03)', border: `1px solid ${ch.done ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)'}` }}
                  >
                    {ch.done
                      ? <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                      : <Circle size={16} className="text-white/25 shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold leading-tight ${ch.done ? 'text-white/40 line-through' : 'text-white'}`}>{ch.chapter}</p>
                      <p className="text-[10px] text-white/35 mt-0.5">{ch.subject} · ~{ch.hours}h</p>
                    </div>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: p.bg, color: p.color }}>
                      {p.label}
                    </span>
                  </button>
                );
              })}
              {week.mock_test && (
                <div className="flex items-center gap-2.5 p-3 rounded-xl"
                  style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
                  <Trophy size={14} className="text-violet-400" />
                  <p className="text-xs font-bold text-violet-300">Mock Test Day</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Plan builder sheet ────────────────────────────────────────────────────────
function PlanBuilder({ onClose, onGenerate }: { onClose: () => void; onGenerate: (subjects: string[], dailyHours: number) => void }) {
  const { profile } = useAuth();
  const [subjects, setSubjects] = useState<string[]>(['Physics', 'Chemistry']);
  const [dailyHours, setDailyHours] = useState(4);

  function toggleSubject(s: string) {
    setSubjects(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }

  const examDate = profile?.exam_date;
  const daysLeft = examDate ? Math.ceil((new Date(examDate).getTime() - Date.now()) / 86400000) : null;

  return (
    <motion.div
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 340, damping: 36 }}
      className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl px-4 pb-10 pt-5"
      style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)' }}
    >
      <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-heading text-lg font-bold text-white">Build Revision Plan</h2>
        <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <X size={16} className="text-white/60" />
        </button>
      </div>

      {examDate && daysLeft !== null && (
        <div className="flex items-center gap-2 p-3 rounded-2xl mb-4" style={{ background: 'rgba(91,106,245,0.12)', border: '1px solid rgba(91,106,245,0.2)' }}>
          <CalendarCheck size={14} className="text-indigo-400" />
          <p className="text-sm text-white/80">
            <span className="font-bold text-white">{profile?.exam_name ?? 'Exam'}</span> in {daysLeft} days
          </p>
        </div>
      )}

      {!examDate && (
        <div className="flex items-center gap-2 p-3 rounded-2xl mb-4" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <AlertTriangle size={14} className="text-amber-400" />
          <div>
            <p className="text-xs text-amber-300">No exam date set</p>
            <p className="text-[10px] text-white/40">Set your exam date in Profile → Settings for a better plan</p>
          </div>
        </div>
      )}

      <p className="text-xs font-bold text-white/50 uppercase tracking-wider mb-2">Subjects to cover</p>
      <div className="flex flex-wrap gap-2 mb-5">
        {Object.keys(CHAPTER_LISTS).map(s => (
          <button key={s} onClick={() => toggleSubject(s)}
            className="px-3.5 py-1.5 rounded-xl text-sm font-bold transition-all"
            style={{ background: subjects.includes(s) ? '#5B6AF5' : 'rgba(255,255,255,0.07)', color: subjects.includes(s) ? 'white' : 'rgba(255,255,255,0.4)' }}>
            {s}
          </button>
        ))}
      </div>

      <p className="text-xs font-bold text-white/50 uppercase tracking-wider mb-2">Daily study hours: {dailyHours}h</p>
      <div className="flex gap-2 mb-6">
        {[2, 3, 4, 5, 6, 8].map(h => (
          <button key={h} onClick={() => setDailyHours(h)}
            className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
            style={{ background: dailyHours === h ? '#5B6AF5' : 'rgba(255,255,255,0.07)', color: dailyHours === h ? 'white' : 'rgba(255,255,255,0.4)' }}>
            {h}h
          </button>
        ))}
      </div>

      <button
        onClick={() => subjects.length > 0 && onGenerate(subjects, dailyHours)}
        disabled={subjects.length === 0}
        className="w-full py-4 rounded-2xl text-base font-bold text-white flex items-center justify-center gap-2"
        style={{ background: subjects.length === 0 ? 'rgba(91,106,245,0.3)' : 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}
      >
        <Sparkles size={16} />
        Generate AI Plan
      </button>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RevisionPlannerPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [plan, setPlan]         = useState<RevisionPlan | null>(null);
  const [loading, setLoading]   = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [status, setStatus]     = useState<StatusInfo | null>(null);

  // Load saved plan
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('revision_plans').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).single();
      if (data) {
        setPlan(data as RevisionPlan);
        computeStatus(data as RevisionPlan);
      }
      setLoading(false);
    })();
  }, [user]);

  function computeStatus(p: RevisionPlan) {
    const today = new Date();
    const start = new Date(p.created_at);
    const exam = new Date(p.exam_date);
    const totalDays = Math.ceil((exam.getTime() - start.getTime()) / 86400000);
    const elapsed = Math.ceil((today.getTime() - start.getTime()) / 86400000);
    const totalChaps = p.weeks.flatMap(w => w.chapters).length;
    const doneChaps = p.weeks.flatMap(w => w.chapters).filter(c => c.done).length;
    const expectedRatio = Math.min(elapsed / totalDays, 1);
    const actualRatio = totalChaps ? doneChaps / totalChaps : 0;
    const behind = Math.max(0, Math.round((expectedRatio - actualRatio) * totalDays));
    const weeksElapsed = Math.floor(elapsed / 7);

    // Find which chapter should have been done
    let recommendation: string | undefined;
    if (behind > 0) {
      const nextUndone = p.weeks.flatMap(w => w.chapters).find(c => !c.done);
      if (nextUndone) recommendation = `Focus on ${nextUndone.chapter} (${nextUndone.subject}) today to catch up.`;
    }

    setStatus({ weeks_elapsed: weeksElapsed, chapters_done: doneChaps, chapters_total: totalChaps, on_track: behind === 0, days_behind: behind, recommendation });
  }

  const generatePlan = useCallback(async (subjects: string[], dailyHours: number) => {
    if (!user || !profile) return;
    setShowBuilder(false);
    setGenerating(true);

    const examDate = profile.exam_date ?? new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    const examName = profile.exam_name ?? 'Exam';
    const daysLeft = Math.ceil((new Date(examDate).getTime() - Date.now()) / 86400000);
    const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7));

    // Build chapter list
    const allChapters = subjects.flatMap(s =>
      (CHAPTER_LISTS[s] ?? []).map(ch => ({ subject: s, chapter: ch }))
    );

    try {
      const prompt = `You are an expert JEE/NEET revision planner. Create a ${weeksLeft}-week revision plan.

Exam: ${examName} in ${daysLeft} days (${weeksLeft} weeks)
Daily study: ${dailyHours} hours
Subjects & chapters: ${JSON.stringify(allChapters.slice(0, 40))} (${allChapters.length} total chapters)

Create a realistic week-by-week plan. Each week assign chapters based on:
- Difficulty (high-difficulty chapters get more days)
- Priority (JEE/NEET high-weightage chapters = high priority)
- Spaced learning (don't cram all of same subject in one week)
- Include a buffer day at the end of every 3 weeks
- Include a mock test after week 4, 8, 12 (if applicable)

Return ONLY valid JSON:
{
  "daily_hours": ${dailyHours},
  "weeks": [
    {
      "week": 1,
      "label": "Week 1 — Jun 16–22",
      "mock_test": false,
      "buffer_day": false,
      "chapters": [
        {"id":"ch_1","subject":"Physics","chapter":"Laws of Motion","hours":3,"priority":"high","done":false}
      ]
    }
  ]
}

Plan all ${allChapters.length} chapters across the ${weeksLeft} weeks. Each chapter appears exactly once. Hours per chapter: 1-4 based on difficulty.`;

      const result = await geminiJSON(prompt) as { daily_hours: number; weeks: PlanWeek[] };

      const newPlan: RevisionPlan = {
        id: crypto.randomUUID(),
        exam_name: examName,
        exam_date: examDate,
        weeks: result.weeks ?? [],
        chapters_count: allChapters.length,
        daily_hours: dailyHours,
        created_at: new Date().toISOString(),
      };

      await supabase.from('revision_plans').upsert({ ...newPlan, user_id: user.id });
      setPlan(newPlan);
      computeStatus(newPlan);
      await Toast.show({ text: 'Revision plan ready!', duration: 'short' });
    } catch {
      await Toast.show({ text: 'Failed to generate plan. Try again.', duration: 'long' });
    } finally {
      setGenerating(false);
    }
  }, [user, profile]);

  async function toggleChapter(chapterId: string) {
    if (!plan || !user) return;
    const updated: RevisionPlan = {
      ...plan,
      weeks: plan.weeks.map(w => ({
        ...w,
        chapters: w.chapters.map(ch =>
          ch.id === chapterId ? { ...ch, done: !ch.done } : ch
        ),
      })),
    };
    setPlan(updated);
    computeStatus(updated);
    await supabase.from('revision_plans').update({ weeks: updated.weeks }).eq('id', plan.id).eq('user_id', user.id);
  }

  const daysLeft = plan ? Math.ceil((new Date(plan.exam_date).getTime() - Date.now()) / 86400000) : null;

  return (
    <div className="flex flex-col h-full" style={{ background: 'transparent' }}>
      {/* Header */}
      <div className="shrink-0 px-4 pb-3" style={{ paddingTop: 'max(16px,env(safe-area-inset-top))' }}>
        <div className="flex items-center justify-between mb-4">
          <Link aria-label="Go back" to="/learning" className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <ChevronLeft size={18} className="text-white" />
          </Link>
          <h1 className="font-heading text-base font-bold text-white">Revision Planner</h1>
          <button
            onClick={() => setShowBuilder(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white"
            style={{ background: 'rgba(91,106,245,0.25)', border: '1px solid rgba(91,106,245,0.3)' }}
          >
            <RefreshCw size={12} /> Rebuild
          </button>
        </div>

        {/* Exam countdown */}
        {plan && daysLeft !== null && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl mb-3"
            style={{ background: 'linear-gradient(135deg,rgba(91,106,245,0.15),rgba(139,92,246,0.15))', border: '1px solid rgba(91,106,245,0.2)' }}>
            <Target size={18} className="text-indigo-400 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-white">{plan.exam_name}</p>
              <p className="text-xs text-white/50">{new Date(plan.exam_date).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-extrabold text-white">{Math.max(0, daysLeft)}</p>
              <p className="text-[10px] text-white/40">days left</p>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-fluid pb-nav">
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />)}
          </div>
        ) : generating ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(91,106,245,0.15)' }}>
              <Sparkles size={28} className="text-indigo-400 animate-pulse" />
            </div>
            <p className="text-base font-bold text-white">Building your plan…</p>
            <p className="text-sm text-white/40 text-center">AI is scheduling {Object.keys(CHAPTER_LISTS).length} subjects across weeks</p>
          </div>
        ) : !plan ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{ background: 'rgba(91,106,245,0.12)' }}>
              <CalendarDays size={36} className="text-indigo-400" />
            </div>
            <p className="text-lg font-bold text-white">No plan yet</p>
            <p className="text-sm text-white/40 text-center">Build a week-by-week revision schedule tailored to your exam date</p>
            <button onClick={() => setShowBuilder(true)}
              className="mt-2 px-6 py-3.5 rounded-2xl text-sm font-bold text-white flex items-center gap-2"
              style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}>
              <Sparkles size={15} /> Build My Plan
            </button>
          </div>
        ) : (
          <>
            {status && <StatusBanner info={status} />}
            <HeatmapBar plan={plan} />
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-white/50 uppercase tracking-wider">Week by Week</p>
              <p className="text-xs text-white/30">{plan.weeks.length} weeks · {plan.daily_hours}h/day</p>
            </div>
            {plan.weeks.map(w => (
              <WeekBlock key={w.week} week={w} onToggle={toggleChapter} />
            ))}
          </>
        )}
      </div>

      <AnimatePresence>
        {showBuilder && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.6)' }}
              onClick={() => setShowBuilder(false)} />
            <PlanBuilder onClose={() => setShowBuilder(false)} onGenerate={generatePlan} />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
