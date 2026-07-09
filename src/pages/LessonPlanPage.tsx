import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarDays, ChevronLeft, Sparkles, CheckCircle2, Circle,
  Clock, RefreshCw, BookOpen, Zap, ClipboardList, Trophy, RotateCcw, Search,
  type LucideIcon,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Toast } from '@capacitor/toast';
import type { LessonPlan, LessonPlanTask, LessonTaskType } from '@/types';

// ── Subjects ──────────────────────────────────────────────────────────────────

const SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology',
  'History', 'Geography', 'English', 'Economics',
  'Computer Science', 'Hindi', 'Sociology', 'Psychology',
];

// ── Task type styling ─────────────────────────────────────────────────────────

const TASK_STYLES: Record<LessonTaskType, { icon: LucideIcon; color: string; bg: string; border: string; label: string }> = {
  study:         { icon: BookOpen,     color: '#8B9BFA', bg: 'rgba(91,106,245,0.12)',  border: 'rgba(91,106,245,0.3)',  label: 'Study' },
  practice:      { icon: Zap,          color: '#FBBF24', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', label: 'Practice' },
  review:        { icon: RotateCcw,    color: '#34D399', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', label: 'Review' },
  quiz:          { icon: ClipboardList,color: '#F472B6', bg: 'rgba(236,72,153,0.12)', border: 'rgba(236,72,153,0.3)', label: 'Quiz' },
  milestone_quiz:{ icon: Trophy,       color: '#C4B5FD', bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.3)', label: 'Milestone' },
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_FULL  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ── Helper ────────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function getDayIndex(): number {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1; // 0=Mon … 6=Sun
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TaskCard({
  task, onToggle, completing,
}: {
  task: LessonPlanTask;
  onToggle: (id: string, done: boolean) => void;
  completing: string | null;
}) {
  const style = TASK_STYLES[task.task_type] ?? TASK_STYLES.study;
  const Icon = style.icon;
  const isBusy = completing === task.id;

  return (
    <motion.div layout
      className="flex items-start gap-3 rounded-2xl px-4 py-3.5"
      style={{
        background: 'var(--hdr-b-750)',
        border: '1px solid var(--ink-070)',
        ...(task.completed ? { opacity: 0.55 } : {}),
      }}>
      <button
        onClick={() => onToggle(task.id, !task.completed)}
        disabled={isBusy}
        className="mt-0.5 shrink-0 active:scale-90 transition-transform">
        {isBusy
          ? <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(91,106,245,0.3)', borderTopColor: '#5B6AF5' }} />
          : task.completed
            ? <CheckCircle2 size={20} style={{ color: '#5B6AF5' }} />
            : <Circle size={20} style={{ color: 'var(--ink-250)' }} />
        }
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
            style={{ color: style.color, background: style.bg, border: `1px solid ${style.border}` }}>
            <Icon size={10} />{style.label}
          </span>
          {task.duration_min && (
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              <Clock size={10} />{task.duration_min}m
            </span>
          )}
        </div>
        <p className="text-sm font-medium" style={{ color: task.completed ? 'var(--ink-400)' : 'var(--ink-900)', textDecoration: task.completed ? 'line-through' : 'none' }}>
          {task.title}
        </p>
        {task.description && !task.completed && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{task.description}</p>
        )}
      </div>
    </motion.div>
  );
}

// ── Subject Picker (extracted component with custom input) ────────────────────

function SubjectPicker({ onSelect, onBack }: { onSelect: (s: string) => void; onBack: () => void }) {
  const [query, setQuery]   = useState('');
  const [custom, setCustom] = useState('');

  const filtered = query.trim()
    ? SUBJECTS.filter(s => s.toLowerCase().includes(query.toLowerCase()))
    : SUBJECTS;

  function handleCustomSubmit() {
    const val = (custom || query).trim();
    if (val.length < 2) return;
    // Capitalise first letter of each word
    onSelect(val.replace(/\b\w/g, c => c.toUpperCase()));
  }

  return (
    <div className="flex flex-col h-full bg-gradient-page">
      <div className="px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
        <button aria-label="Go back" onClick={onBack} className="text-white">
          <ChevronLeft size={20} />
        </button>
        <p className="font-heading font-bold text-white flex-1">Choose a Subject</p>
      </div>

      {/* Search / custom input */}
      <div className="px-4 pt-4 pb-2 shrink-0"
        style={{ background: 'var(--hdr-a-880)', borderBottom: '1px solid var(--ink-060)' }}>
        <div className="flex items-center gap-2 rounded-2xl px-3 h-11"
          style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
          <Search size={15} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && filtered.length === 0 && handleCustomSubmit()}
            placeholder="Search or type any subject…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
            style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
            autoFocus
          />
        </div>
        {/* Custom subject submit — shown when search matches nothing */}
        {query.trim().length >= 2 && filtered.length === 0 && (
          <button
            onClick={handleCustomSubmit}
            className="mt-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white text-center"
            style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
            Generate plan for "{query.trim()}" →
          </button>
        )}
      </div>

      <div className="flex-1 native-scroll pb-nav px-4 py-4">
        {filtered.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map(sub => (
              <button key={sub}
                onClick={() => onSelect(sub)}
                className="p-4 rounded-2xl text-sm font-medium text-white text-left transition-colors"
                style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
                {sub}
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">
              No subjects match "<strong>{query}</strong>"
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Press Enter or tap the button above to use it as a custom subject.
            </p>
          </div>
        )}

        {/* Always-visible custom entry at bottom */}
        {filtered.length > 0 && (
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--ink-060)' }}>
            <p className="text-xs text-muted-foreground mb-2 px-1 font-semibold">Custom subject</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={custom}
                onChange={e => setCustom(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCustomSubmit()}
                placeholder="e.g. French, Music Theory, UPSC GS2…"
                className="flex-1 rounded-xl px-3 h-10 text-sm text-white placeholder:text-white/30 outline-none"
                style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)', WebkitUserSelect: 'text', userSelect: 'text' }}
              />
              <button
                onClick={handleCustomSubmit}
                disabled={custom.trim().length < 2}
                className="px-4 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
                Go
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function LessonPlanPage() {
  const { user } = useAuth();

  const [plan, setPlan]         = useState<LessonPlan | null>(null);
  const [tasks, setTasks]       = useState<LessonPlanTask[]>([]);
  const [loading, setLoading]   = useState(true);
  const [generating, setGenerating] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);
  const [activeDay, setActiveDay]   = useState<number>(getDayIndex());
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const [selectedSubject, setSelectedSubject]     = useState('');

  async function callFn(body: Record<string, unknown>) {
    const { data: { session } } = await supabase.auth.getSession();
    return supabase.functions.invoke('lesson-planner', {
      body,
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
  }

  async function load() {
    if (!user) return;
    setLoading(true);
    try {
      const res = await callFn({ action: 'get_current' });
      if (res.data?.plan) {
        setPlan(res.data.plan);
        setTasks(res.data.tasks ?? []);
        setSelectedSubject(res.data.plan.subject);
      }
    } catch { /* no plan yet */ }
    setLoading(false);
  }

  useEffect(() => { load(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generatePlan(subject: string) {
    setGenerating(true);
    setShowSubjectPicker(false);
    try {
      const res = await callFn({ action: 'generate', subject, force: !!plan });
      if (res.error) throw new Error(res.error.message ?? 'Generation failed');
      setPlan(res.data.plan);
      setTasks(res.data.tasks ?? []);
      setSelectedSubject(subject);
      setActiveDay(getDayIndex());
      if (Capacitor.isNativePlatform()) {
        await Toast.show({ text: 'Lesson plan ready', duration: 'short', position: 'bottom' });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to generate plan';
      if (Capacitor.isNativePlatform()) {
        await Toast.show({ text: msg, duration: 'short', position: 'bottom' });
      }
    }
    setGenerating(false);
  }

  async function toggleTask(taskId: string, done: boolean) {
    setCompleting(taskId);
    try {
      const res = await callFn({ action: 'complete_task', task_id: taskId, completed: done });
      if (res.error) throw new Error(res.error.message);
      // Optimistic update
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: done, completed_at: done ? new Date().toISOString() : null } : t));
      if (res.data?.plan) setPlan(prev => prev ? { ...prev, done_tasks: res.data.plan.done_tasks } : prev);
    } catch {
      if (Capacitor.isNativePlatform()) {
        await Toast.show({ text: 'Failed to update task', duration: 'short', position: 'bottom' });
      }
    }
    setCompleting(null);
  }

  const dayTasks = (day: number) => tasks.filter(t => t.day_index === day);
  const dayDone  = (day: number) => dayTasks(day).filter(t => t.completed).length;
  const pct = plan && plan.total_tasks > 0
    ? Math.round((plan.done_tasks / plan.total_tasks) * 100)
    : 0;

  // ── Subject picker sheet ──────────────────────────────────────────────────
  if (showSubjectPicker) {
    return (
      <SubjectPicker
        onSelect={generatePlan}
        onBack={() => setShowSubjectPicker(false)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-gradient-page">

      {/* ── Header ── */}
      <div className="px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
        <Link aria-label="Go back" to="/profile" className="text-white">
          <ChevronLeft size={20} />
        </Link>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
          <CalendarDays size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h2 className="font-heading font-bold text-white text-sm">Novo's Lesson Plan</h2>
          <p className="text-xs text-muted-foreground">
            {plan ? `${plan.subject} · Week of ${formatDate(plan.week_start)}` : 'No plan yet'}
          </p>
        </div>
        <button
          onClick={() => setShowSubjectPicker(true)}
          disabled={generating}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl"
          style={{ color: '#8B9BFA', background: 'rgba(91,106,245,0.15)' }}>
          {generating
            ? <RefreshCw size={12} className="animate-spin" />
            : <Sparkles size={12} />}
          {plan ? 'New' : 'Generate'}
        </button>
      </div>

      <div className="flex-1 native-scroll pb-nav">

        {/* ── Loading ── */}
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        )}

        {/* ── Generating ── */}
        {generating && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center h-full gap-4 px-8">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
              <Sparkles size={36} className="text-white animate-pulse" />
            </div>
            <div className="text-center">
              <p className="font-heading text-xl font-bold text-white">Building your plan…</p>
              <p className="text-muted-foreground text-sm mt-1">
                Novo is personalising a full week of {selectedSubject || 'study'} for you
              </p>
            </div>
          </motion.div>
        )}

        {/* ── Empty state ── */}
        {!loading && !generating && !plan && (
          <div className="flex flex-col items-center justify-center h-full px-8 gap-6">
            <div className="w-24 h-24 rounded-4xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(91,106,245,0.1), rgba(139,92,246,0.1))' }}>
              <CalendarDays size={44} style={{ color: '#8B9BFA' }} strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <h3 className="font-heading text-2xl font-bold text-white">No Plan Yet</h3>
              <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
                Let Novo build a personalised 7-day study plan for any subject — with daily tasks, milestones, and built-in quizzes.
              </p>
            </div>
            <Button size="lg" onClick={() => setShowSubjectPicker(true)} className="w-full">
              <Sparkles size={17} /> Generate My Plan
            </Button>
          </div>
        )}

        {/* ── Plan view ── */}
        {!loading && !generating && plan && (
          <div className="flex flex-col gap-0">

            {/* Progress bar */}
            <div className="px-4 py-4"
              style={{ background: 'var(--hdr-a-880)', borderBottom: '1px solid var(--ink-060)' }}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs text-muted-foreground">Week progress</p>
                  <p className="font-semibold text-white text-sm">{plan.done_tasks} of {plan.total_tasks} tasks done</p>
                </div>
                <span className="text-lg font-bold"
                  style={{ color: pct >= 80 ? '#34D399' : pct >= 40 ? '#8B9BFA' : 'var(--ink-400)' }}>
                  {pct}%
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--ink-080)' }}>
                <motion.div className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, #5B6AF5, #8B5CF6)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }} />
              </div>
              {plan.goal && (
                <p className="text-xs text-muted-foreground mt-2 italic">{plan.goal}</p>
              )}
            </div>

            {/* Day tabs */}
            <div className="px-3 py-2 flex gap-1 overflow-x-auto hide-scrollbar"
              style={{ background: 'var(--hdr-a-880)', borderBottom: '1px solid var(--ink-060)' }}>
              {DAY_NAMES.map((d, i) => {
                const dt = dayTasks(i);
                const dd = dayDone(i);
                const isToday = i === getDayIndex();
                const done = dt.length > 0 && dd === dt.length;
                return (
                  <button key={i} onClick={() => setActiveDay(i)}
                    className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl min-w-[44px] transition-all ${activeDay === i ? 'text-white' : 'text-muted-foreground'}`}
                    style={activeDay === i ? { background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' } : {}}>
                    <span className="text-xs font-bold">{d}</span>
                    <div className="flex items-center gap-0.5">
                      {done
                        ? <CheckCircle2 size={10} className={activeDay === i ? 'text-white' : 'text-green-500'} />
                        : <span className={`text-xs font-medium ${isToday && activeDay !== i ? 'text-primary' : ''}`}>
                            {dt.length > 0 ? `${dd}/${dt.length}` : '·'}
                          </span>
                      }
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Tasks for selected day */}
            <div className="px-4 py-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-heading font-bold text-white">{DAY_FULL[activeDay]}</p>
                  {plan.plan_data?.days?.[activeDay]?.theme && (
                    <p className="text-xs text-muted-foreground">
                      {plan.plan_data.days[activeDay].theme}
                      {plan.plan_data.days[activeDay].is_milestone_day && (
                        <span className="ml-2 font-semibold" style={{ color: '#C4B5FD' }}>Milestone Day</span>
                      )}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {dayDone(activeDay)}/{dayTasks(activeDay).length} done
                </span>
              </div>

              <AnimatePresence mode="wait">
                <motion.div key={activeDay}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex flex-col gap-2">
                  {dayTasks(activeDay).length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No tasks for this day</p>
                  ) : (
                    dayTasks(activeDay)
                      .sort((a, b) => a.task_index - b.task_index)
                      .map(task => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          onToggle={toggleTask}
                          completing={completing}
                        />
                      ))
                  )}
                </motion.div>
              </AnimatePresence>

              {pct === 100 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="mt-2 rounded-2xl p-5 text-center"
                  style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(6,182,212,0.1))' }}>
                  <Trophy size={32} style={{ color: '#34D399' }} className="mb-1 mx-auto" />
                  <p className="font-heading font-bold text-white">Week Complete!</p>
                  <p className="text-sm text-muted-foreground mt-1">Amazing work finishing your full lesson plan.</p>
                  <Button size="sm" onClick={() => generatePlan(plan.subject)} className="mt-3">
                    <RefreshCw size={14} /> New Plan
                  </Button>
                </motion.div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
