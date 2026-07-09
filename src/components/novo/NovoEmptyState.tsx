// ─────────────────────────────────────────────────────────────────────────────
// NovoEmptyState — rich personalised empty state for the Novo chat screen
// ─────────────────────────────────────────────────────────────────────────────

import { motion } from 'framer-motion';
import {
  Zap, BookOpen, Target, Brain, Flame,
  type LucideIcon,
} from 'lucide-react';
import { NovoAvatar } from './NovoAvatar';
import type { StudyContext } from '@/hooks/useStudyContext';
import { lessonIdToLabel } from '@/hooks/useStudyContext';
import type { NovoMemoryContext } from '@/types';

interface NovoEmptyStateProps {
  firstName: string;
  examName: string | null;
  streak: number;
  personality: string;
  personalityLabel: string;
  personalityGradient: string;
  studyCtx: StudyContext;
  memCtx: NovoMemoryContext | null;
  chips: string[];
  onChipSelect: (text: string) => void;
}

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return 'Still up?';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Burning the midnight oil?';
}

interface CapabilityItem {
  icon: LucideIcon;
  label: string;
  color: string;
  bg: string;
}

const CAPABILITIES: CapabilityItem[] = [
  { icon: Brain,    label: 'Explain concepts',   color: '#A0AEFF', bg: 'rgba(91,106,245,0.1)'  },
  { icon: Target,   label: 'Quiz me on a topic', color: '#F472B6', bg: 'rgba(244,114,182,0.1)' },
  { icon: BookOpen, label: 'Work through problems', color: '#34D399', bg: 'rgba(52,211,153,0.1)' },
];

export function NovoEmptyState({
  firstName,
  examName,
  streak,
  personality: _personality,
  personalityLabel,
  personalityGradient: _personalityGradient,
  studyCtx,
  memCtx,
  chips,
  onChipSelect,
}: NovoEmptyStateProps) {
  const greeting   = timeGreeting();
  const hasActivity = studyCtx.recentLessons.length > 0 || studyCtx.recentQuizTopics.length > 0;
  const weakTopics  = (memCtx?.top_weaknesses ?? []).slice(0, 2).map(w => w.topic ?? w.content.split(' ').slice(0, 4).join(' '));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center px-4 pt-4 pb-2 gap-5 select-none"
    >
      {/* ── Avatar + greeting ── */}
      <div className="flex flex-col items-center gap-3">
        {/* Glow ring */}
        <div className="relative flex items-center justify-center">
          <motion.div
            className="absolute rounded-full"
            style={{
              width: 96, height: 96,
              background: 'radial-gradient(circle, rgba(124,58,237,0.25), transparent 70%)',
            }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          />
          <NovoAvatar state="idle" size="xl" />
        </div>

        <div className="text-center">
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="font-heading text-xl font-bold text-white"
          >
            {greeting}, {firstName}!
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
            className="text-xs mt-0.5"
            style={{ color: 'var(--ink-400)' }}
          >
            {personalityLabel} · Ready to study
          </motion.p>
        </div>

        {/* Streak + today XP row */}
        {(streak > 1 || studyCtx.todayXP > 0) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center gap-3"
          >
            {streak > 1 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl"
                style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)' }}>
                <Flame size={13} style={{ color: '#FBBF24' }} />
                <span className="text-xs font-bold" style={{ color: '#FBBF24' }}>{streak} day streak</span>
              </div>
            )}
            {studyCtx.todayXP > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl"
                style={{ background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.2)' }}>
                <Zap size={13} style={{ color: '#A0AEFF' }} />
                <span className="text-xs font-bold" style={{ color: '#A0AEFF' }}>+{studyCtx.todayXP} XP today</span>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* ── Recent activity context ── */}
      {hasActivity && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="w-full rounded-3xl p-4"
          style={{
            background: 'linear-gradient(135deg, rgba(91,106,245,0.1), rgba(139,92,246,0.06))',
            border: '1px solid rgba(91,106,245,0.18)',
          }}
        >
          <p className="text-xs font-bold uppercase tracking-widest mb-2.5"
            style={{ color: 'rgba(160,174,255,0.7)' }}>
            I know what you've been studying
          </p>

          {studyCtx.recentLessons.slice(0, 2).map((l, i) => {
            const label    = lessonIdToLabel(l.lesson_id);
            const subject  = label.split(' — ')[0];
            const detail   = label.split(' — ')[1] ?? '';
            const when     = new Date(l.completed_at);
            const now      = new Date();
            const diffH    = Math.round((now.getTime() - when.getTime()) / (1000 * 60 * 60));
            const timeStr  = diffH < 1 ? 'just now' : diffH < 24 ? `${diffH}h ago` : `${Math.round(diffH / 24)}d ago`;
            return (
              <div key={l.lesson_id} className={`flex items-start gap-2 ${i > 0 ? 'mt-2' : ''}`}>
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                  style={{ background: '#A0AEFF' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{subject}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--ink-400)' }}>
                    {detail} · {timeStr}
                  </p>
                </div>
              </div>
            );
          })}

          {studyCtx.recentQuizTopics.length > 0 && (() => {
            const q = studyCtx.recentQuizTopics[0];
            const pct = q.total > 0 ? Math.round((q.score / q.total) * 100) : 0;
            const colour = pct >= 70 ? '#34D399' : pct >= 40 ? '#FBBF24' : '#F87171';
            return (
              <div className="flex items-center gap-2 mt-2">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: colour }} />
                <p className="text-xs" style={{ color: 'var(--ink-500)' }}>
                  Last quiz: <span className="font-semibold text-white">{q.topic}</span>
                  {' '}<span style={{ color: colour }}>{pct}%</span>
                </p>
              </div>
            );
          })()}
        </motion.div>
      )}

      {/* ── Weak topics nudge ── */}
      {weakTopics.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42 }}
          className="w-full rounded-3xl px-4 py-3 flex items-center gap-3"
          style={{
            background: 'rgba(239,68,68,0.06)',
            border: '1px solid rgba(239,68,68,0.15)',
          }}
        >
          <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(239,68,68,0.12)' }}>
            <Target size={13} style={{ color: '#F87171' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold" style={{ color: '#F87171' }}>Needs attention</p>
            <p className="text-xs truncate" style={{ color: 'var(--ink-450)' }}>
              {weakTopics.join(' · ')}
            </p>
          </div>
        </motion.div>
      )}

      {/* ── Quick-start chips ── */}
      {chips.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.48 }}
          className="w-full"
        >
          <p className="text-xs font-bold uppercase tracking-widest mb-2.5"
            style={{ color: 'var(--ink-250)' }}>
            Ask me
          </p>
          <div className="flex flex-col gap-2">
            {chips.map((chip, i) => (
              <motion.button
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.06 }}
                onClick={() => onChipSelect(chip)}
                className="w-full text-left px-4 py-3 rounded-2xl text-sm leading-snug"
                style={{
                  background: 'var(--ink-060)',
                  border: '1px solid var(--ink-070)',
                  color: 'var(--ink-750)',
                }}
                whileTap={{ scale: 0.97 }}
              >
                {chip}
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── What Novo can do ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.65 }}
        className="w-full"
      >
        <p className="text-xs font-bold uppercase tracking-widest mb-2.5"
          style={{ color: 'var(--ink-250)' }}>
          What I can do
        </p>
        <div className="grid grid-cols-3 gap-2">
          {CAPABILITIES.map(({ icon: Icon, label, color, bg }) => (
            <div key={label}
              className="flex flex-col items-center gap-2 p-3 rounded-2xl text-center"
              style={{ background: bg, border: `1px solid ${color}20` }}
            >
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: `${color}15` }}>
                <Icon size={15} style={{ color }} strokeWidth={1.75} />
              </div>
              <p className="text-[10px] font-semibold leading-tight"
                style={{ color: 'var(--ink-600)' }}>{label}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Exam reminder */}
      {examName && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.75 }}
          className="text-[11px] text-center pb-2"
          style={{ color: 'var(--ink-200)' }}
        >
          Preparing for {examName}
        </motion.p>
      )}
    </motion.div>
  );
}
