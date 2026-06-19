// ═══════════════════════════════════════════════════════════════
// Edora — ExamPredictionPage
// Route: /exam-prediction
// AI-powered exam score prediction with animated gauge, study
// plan accordion, mastery snapshot and weak/strong topic cards.
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Target, Clock, Calendar, ChevronDown,
  AlertCircle, CheckCircle2, RefreshCw, Sparkles, Info,
  TrendingUp, BookOpen, Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

// ── Types ─────────────────────────────────────────────────────────────────────

interface StudyWeek {
  week: string;
  focus: string;
  hours_per_day: number;
  topics: string[];
}

interface MasteryEntry {
  mastered: number;
  total: number;
}

interface PredictionData {
  predicted_score: number;
  predicted_grade: string;
  target_score: number;
  target_grade: string;
  daily_hours_needed: number;
  confidence_level: 'high' | 'medium' | 'low';
  weak_topics: string[];
  strong_topics: string[];
  narrative: string;
  study_plan: StudyWeek[];
  mastery_snapshot: Record<string, MasteryEntry>;
  days_remaining: number | null;
  has_exam_date?: boolean;
}

const GRADE_OPTIONS = ['A*', 'A', 'B', 'C'] as const;

// ── Score Gauge ───────────────────────────────────────────────────────────────
// Semicircular gauge: left=180° to right=0° (SVG arc from left to right)
// viewBox="-90 -90 180 90" with radius=70

function ScoreGauge({ score, target }: { score: number; target: number }) {
  const r = 70;
  const circumference = Math.PI * r; // half circle = π*r
  const [animScore, setAnimScore] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimScore(score), 100);
    return () => clearTimeout(timer);
  }, [score]);

  const scoreOffset = circumference - (animScore / 100) * circumference;
  const targetOffset = circumference - (target / 100) * circumference;

  const scoreColor = score >= 70 ? '#34D399' : score >= 50 ? '#FBBF24' : '#F87171';
  const targetColor = '#818CF8';

  // Grade badge colour
  const gradeScore = score;
  const gradeColor = gradeScore >= 70 ? '#34D399' : gradeScore >= 50 ? '#FBBF24' : '#F87171';

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 200, height: 106 }}>
        <svg
          viewBox="-90 -90 180 90"
          width={200}
          height={106}
          style={{ overflow: 'visible' }}
        >
          {/* Track arc */}
          <path
            d={`M -70 0 A 70 70 0 0 1 70 0`}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={12}
            strokeLinecap="round"
          />
          {/* Target arc (ghost) */}
          <path
            d={`M -70 0 A 70 70 0 0 1 70 0`}
            fill="none"
            stroke={`${targetColor}30`}
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={targetOffset}
            style={{ transformOrigin: '0 0', transform: 'scaleX(-1) scaleY(-1)' }}
          />
          {/* Score arc */}
          <path
            d={`M -70 0 A 70 70 0 0 1 70 0`}
            fill="none"
            stroke={scoreColor}
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={scoreOffset}
            style={{
              transformOrigin: '0 0',
              transform: 'scaleX(-1) scaleY(-1)',
              transition: 'stroke-dashoffset 1.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          />
          {/* Target tick mark */}
          {(() => {
            const angle = Math.PI - (target / 100) * Math.PI;
            const x1 = Math.cos(angle) * 62;
            const y1 = -Math.sin(angle) * 62;
            const x2 = Math.cos(angle) * 78;
            const y2 = -Math.sin(angle) * 78;
            return (
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={targetColor}
                strokeWidth={3}
                strokeLinecap="round"
              />
            );
          })()}
        </svg>

        {/* Left label: PREDICTED */}
        <div className="absolute bottom-0 left-0 flex flex-col items-start">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            Predicted
          </span>
          <span
            className="font-heading font-bold text-3xl leading-tight"
            style={{ color: scoreColor }}
          >
            {animScore}%
          </span>
        </div>

        {/* Right label: TARGET */}
        <div className="absolute bottom-0 right-0 flex flex-col items-end">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            Target
          </span>
          <span
            className="font-heading font-bold text-3xl leading-tight"
            style={{ color: targetColor }}
          >
            {target}%
          </span>
        </div>
      </div>

      {/* Grade badges row */}
      <div className="flex items-center gap-3 mt-2">
        <span
          className="px-3 py-1 rounded-full text-xs font-bold text-white"
          style={{ background: gradeColor }}
        >
          Predicted: {score >= 90 ? 'A*' : score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : 'D'}
        </span>
        <span
          className="px-3 py-1 rounded-full text-xs font-bold text-white"
          style={{ background: targetColor }}
        >
          Target: {target >= 90 ? 'A*' : target >= 80 ? 'A' : target >= 70 ? 'B' : target >= 60 ? 'C' : 'D'}
        </span>
      </div>
    </div>
  );
}

// ── Mastery bar ───────────────────────────────────────────────────────────────

function MasteryBar({ subject, mastered, total }: { subject: string; mastered: number; total: number }) {
  const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
  const color = pct >= 70 ? '#34D399' : pct >= 50 ? '#FBBF24' : '#F87171';
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-white font-medium w-24 truncate shrink-0">{subject}</span>
      <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
      <span className="text-xs font-bold w-10 text-right shrink-0" style={{ color }}>
        {pct}%
      </span>
    </div>
  );
}

// ── Study Plan Accordion Item ─────────────────────────────────────────────────

function StudyWeekCard({ week, index }: { week: StudyWeek; index: number }) {
  const [open, setOpen] = useState(index === 0);
  const colors = [
    { bg: 'rgba(91,106,245,0.1)',  border: 'rgba(91,106,245,0.3)',  accent: '#818CF8' },
    { bg: 'rgba(236,72,153,0.1)',  border: 'rgba(236,72,153,0.3)',  accent: '#F472B6' },
    { bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.3)',  accent: '#34D399' },
    { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', accent: '#FBBF24' },
  ];
  const c = colors[index % colors.length];

  return (
    <div
      className="rounded-2xl overflow-hidden border"
      style={{ background: c.bg, borderColor: c.border }}
    >
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white text-xs font-bold"
          style={{ background: c.accent }}
        >
          W{index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: c.accent }}>
            {week.week}
          </p>
          <p className="text-sm font-semibold text-white truncate">{week.focus}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-medium text-muted-foreground">
            {week.hours_per_day}h/day
          </span>
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={15} className="text-muted-foreground" />
          </motion.div>
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div
              className="px-4 pb-4 pt-2 border-t flex flex-wrap gap-1.5"
              style={{ borderColor: c.border }}
            >
              {week.topics.map(topic => (
                <span
                  key={topic}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full"
                  style={{ background: c.accent + '18', color: c.accent }}
                >
                  {topic}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Setup Screen ──────────────────────────────────────────────────────────────

function SetupScreen({
  onPredict,
  loading,
}: {
  onPredict: (grade: string, score: number) => void;
  loading: boolean;
}) {
  const [selectedGrade, setSelectedGrade] = useState<string>('A');
  const [customScore, setCustomScore] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  const gradeToScore: Record<string, number> = { 'A*': 90, A: 80, B: 70, C: 60 };

  function handleSubmit() {
    const score = useCustom
      ? Math.min(100, Math.max(0, parseInt(customScore, 10) || 70))
      : gradeToScore[selectedGrade];
    const grade = useCustom
      ? score >= 90 ? 'A*' : score >= 80 ? 'A' : score >= 70 ? 'B' : 'C'
      : selectedGrade;
    onPredict(grade, score);
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6">
      {/* Hero */}
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="w-24 h-24 rounded-3xl flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
      >
        <Target size={40} className="text-white" />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="text-center"
      >
        <h2 className="font-heading text-2xl font-bold text-white mb-1">
          What grade are you aiming for?
        </h2>
        <p className="text-sm text-muted-foreground">
          Novo will predict your score and build a personalised study plan
        </p>
      </motion.div>

      {/* Grade chips */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22 }}
        className="flex gap-3 flex-wrap justify-center"
      >
        {GRADE_OPTIONS.map(g => (
          <button
            key={g}
            onClick={() => { setSelectedGrade(g); setUseCustom(false); }}
            className="w-16 h-16 rounded-2xl flex items-center justify-center font-heading font-bold text-xl transition-all active:scale-95"
            style={
              !useCustom && selectedGrade === g
                ? { background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)', color: '#fff', boxShadow: '0 4px 20px rgba(91,106,245,0.4)' }
                : { background: 'rgba(15,20,45,0.7)', color: 'rgba(255,255,255,0.7)', border: '2px solid rgba(255,255,255,0.12)' }
            }
          >
            {g}
          </button>
        ))}
        <button
          onClick={() => setUseCustom(true)}
          className="w-16 h-16 rounded-2xl flex items-center justify-center font-heading font-bold text-sm transition-all active:scale-95"
          style={
            useCustom
              ? { background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)', color: '#fff', boxShadow: '0 4px 20px rgba(91,106,245,0.4)' }
              : { background: '#fff', color: '#1A2035', border: '2px solid #E4E8F7' }
          }
        >
          %
        </button>
      </motion.div>

      {/* Custom % input */}
      <AnimatePresence>
        {useCustom && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="w-full"
          >
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                value={customScore}
                onChange={e => setCustomScore(e.target.value)}
                placeholder="Enter target % (e.g. 75)"
                className="w-full px-4 py-3.5 rounded-2xl font-bold text-center text-lg text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
                style={{ background: 'rgba(15,20,45,0.7)', border: '1px solid rgba(255,255,255,0.12)' }}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">%</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Predict button */}
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        onClick={handleSubmit}
        disabled={loading || (useCustom && !customScore)}
        className="w-full py-4 rounded-3xl text-white font-bold text-base flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60"
        style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)', boxShadow: '0 4px 24px rgba(91,106,245,0.35)' }}
      >
        {loading ? (
          <>
            <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            Analysing your data…
          </>
        ) : (
          <>
            <Sparkles size={17} />
            Predict My Score
          </>
        )}
      </motion.button>

      {/* Disclaimer */}
      <p className="text-center text-[11px] text-muted-foreground leading-relaxed px-2">
        Based on your flashcard mastery, challenge scores, and study patterns
      </p>
    </div>
  );
}

// ── Confidence badge ──────────────────────────────────────────────────────────

const CONFIDENCE_CONFIG = {
  high:   { color: '#34D399', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.3)',  label: 'High Confidence',   desc: "Novo has plenty of data and is very sure about this prediction." },
  medium: { color: '#FBBF24', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', label: 'Medium Confidence', desc: "Prediction is solid but could improve with more study sessions." },
  low:    { color: '#F87171', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)',   label: 'Low Confidence',    desc: "Not enough data yet — keep studying to improve accuracy." },
};

// ── Score Trajectory Chart ────────────────────────────────────────────────────
// 30-day SVG line chart: current pace vs optimized pace

function ScoreTrajectory({
  currentScore,
  targetScore,
  daysRemaining,
}: {
  currentScore: number;
  targetScore: number;
  daysRemaining: number | null;
}) {
  const DAYS = 30;
  const W = 300; const H = 130;
  const PAD = { l: 34, r: 16, t: 12, b: 28 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  // Generate trajectory points
  const days = Array.from({ length: DAYS + 1 }, (_, i) => i);
  const gap = targetScore - currentScore;

  // Current pace: gentle linear extrapolation (3% per 30 days if on track, less if gap large)
  const currentPaceGain = Math.max(0, Math.min(gap * 0.3, 8)); // modest improvement
  const currentLine = days.map(d => Math.min(100, currentScore + (currentPaceGain * d) / DAYS));

  // Optimized pace: ease-out curve from currentScore → targetScore over daysRemaining (or 30)
  const optDays = daysRemaining !== null ? Math.min(daysRemaining, DAYS) : DAYS;
  const optimizedLine = days.map(d => {
    if (d >= optDays) return Math.min(100, targetScore);
    const t = d / optDays;
    const eased = 1 - Math.pow(1 - t, 2); // ease-out quadratic
    return Math.min(100, currentScore + gap * eased);
  });

  const yMin = Math.max(0, Math.min(currentScore, targetScore) - 10);
  const yMax = Math.min(100, Math.max(currentScore, targetScore) + 10);
  const yRange = yMax - yMin || 20;

  function toX(day: number) { return PAD.l + (day / DAYS) * chartW; }
  function toY(score: number) { return PAD.t + chartH - ((score - yMin) / yRange) * chartH; }

  function makePath(pts: number[]) {
    return pts.map((s, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(s).toFixed(1)}`).join(' ');
  }

  const examX = daysRemaining !== null && daysRemaining <= DAYS ? toX(daysRemaining) : null;
  const yTicks = [yMin, (yMin + yMax) / 2, yMax].map(v => Math.round(v));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="inline-block w-5 h-0.5 rounded" style={{ background: 'rgba(107,114,128,0.6)' }} /> Current pace
        </div>
        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: '#34D399' }}>
          <span className="inline-block w-5 h-0.5 rounded" style={{ background: '#34D399' }} /> Optimised pace
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
        {/* Grid lines */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD.l} y1={toY(v)} x2={W - PAD.r} y2={toY(v)}
              stroke="rgba(255,255,255,0.06)" strokeWidth={1}
            />
            <text x={PAD.l - 5} y={toY(v) + 3.5} textAnchor="end" fontSize={8} fill="rgba(255,255,255,0.35)">
              {v}%
            </text>
          </g>
        ))}

        {/* Exam day marker */}
        {examX !== null && (
          <>
            <line
              x1={examX} y1={PAD.t} x2={examX} y2={PAD.t + chartH}
              stroke="rgba(251,191,36,0.5)" strokeWidth={1.5} strokeDasharray="4 3"
            />
            <text x={examX} y={PAD.t - 3} textAnchor="middle" fontSize={8} fill="#FBBF24">
              Exam
            </text>
          </>
        )}

        {/* Current pace line */}
        <path
          d={makePath(currentLine)}
          fill="none"
          stroke="rgba(107,114,128,0.55)"
          strokeWidth={1.5}
          strokeDasharray="5 3"
        />

        {/* Optimized pace line */}
        <path
          d={makePath(optimizedLine)}
          fill="none"
          stroke="#34D399"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Target score dot */}
        <circle
          cx={toX(optDays)} cy={toY(Math.min(100, targetScore))}
          r={4} fill="#34D399" stroke="rgba(0,0,0,0.4)" strokeWidth={1.5}
        />

        {/* X-axis labels */}
        {[0, 15, 30].map(d => (
          <text key={d} x={toX(d)} y={H - 5} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.3)">
            Day {d}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ── Results Screen ────────────────────────────────────────────────────────────

function ResultsScreen({
  prediction,
  cachedAt,
  onRecalculate,
  recalculating,
  hasExamDate,
}: {
  prediction: PredictionData;
  cachedAt: string | null;
  onRecalculate: () => void;
  recalculating: boolean;
  hasExamDate: boolean;
}) {
  const conf = CONFIDENCE_CONFIG[prediction.confidence_level];
  const hoursColor = prediction.daily_hours_needed > 2 ? '#FBBF24' : '#34D399';
  const hoursBg    = prediction.daily_hours_needed > 2 ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)';
  const hoursBorder= prediction.daily_hours_needed > 2 ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)';

  const cacheLabel = cachedAt ? (() => {
    const diff = Date.now() - new Date(cachedAt).getTime();
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    return h > 0 ? `${h}h ago` : `${m}m ago`;
  })() : null;

  return (
    <div className="flex-1 flex flex-col gap-5 px-4 py-5">

      {/* Score Gauge hero */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 180, damping: 18 }}
        className="rounded-3xl p-5 flex flex-col items-center gap-2"
        style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
          {hasExamDate ? 'Exam Score Prediction' : 'Current Readiness Score'}
        </p>
        <ScoreGauge
          score={prediction.predicted_score}
          target={prediction.target_score}
        />
        {!hasExamDate && (
          <p className="text-[11px] text-muted-foreground text-center mt-1 leading-snug px-2">
            Score you'd achieve in an exam today · Set your exam date for a personalised countdown
          </p>
        )}
      </motion.div>

      {/* Set-exam-date nudge (only shown when no exam date) */}
      {!hasExamDate && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="rounded-2xl px-4 py-3 flex items-center gap-3"
          style={{ background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.3)' }}
        >
          <Calendar size={18} style={{ color: '#818CF8' }} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold" style={{ color: '#818CF8' }}>Add your exam date</p>
            <p className="text-[11px]" style={{ color: 'rgba(129,140,248,0.8)' }}>
              Get a personalised countdown, study schedule, and daily hour targets.
            </p>
          </div>
          <Zap size={15} style={{ color: '#818CF8' }} className="shrink-0" />
        </motion.div>
      )}

      {/* 30-day score trajectory */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-3xl p-4"
        style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={14} className="text-primary shrink-0" />
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            30-Day Score Trajectory
          </p>
        </div>
        <ScoreTrajectory
          currentScore={prediction.predicted_score}
          targetScore={prediction.target_score}
          daysRemaining={prediction.days_remaining}
        />
        {prediction.days_remaining !== null && prediction.target_score > prediction.predicted_score && (
          <p className="text-[11px] text-center mt-2 leading-snug" style={{ color: 'rgba(52,211,153,0.8)' }}>
            Follow the study plan to gain {prediction.target_score - prediction.predicted_score}% in {Math.min(prediction.days_remaining, 30)} days
          </p>
        )}
      </motion.div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 gap-3">
        {/* Daily hours card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-3xl p-4 flex flex-col gap-1"
          style={{ background: hoursBg, border: `1px solid ${hoursBorder}` }}
        >
          <Clock size={20} style={{ color: hoursColor }} />
          <p className="font-heading font-bold text-2xl leading-none" style={{ color: hoursColor }}>
            {prediction.daily_hours_needed}h
          </p>
          <p className="text-[11px] font-medium" style={{ color: hoursColor }}>per day needed</p>
        </motion.div>

        {/* Days remaining / Confidence */}
        {prediction.days_remaining !== null ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
            className="rounded-3xl p-4 flex flex-col gap-1"
            style={{ background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.3)' }}
          >
            <Calendar size={20} style={{ color: '#818CF8' }} />
            <p className="font-heading font-bold text-2xl leading-none" style={{ color: '#818CF8' }}>
              {prediction.days_remaining}
            </p>
            <p className="text-[11px] font-medium" style={{ color: '#818CF8' }}>days to exam</p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
            className="rounded-3xl p-4 flex flex-col gap-1"
            style={{ background: conf.bg, border: `1px solid ${conf.border}` }}
          >
            <Target size={20} style={{ color: conf.color }} />
            <p className="font-heading font-bold text-sm leading-snug" style={{ color: conf.color }}>
              {conf.label}
            </p>
          </motion.div>
        )}
      </div>

      {/* Confidence badge (full) */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="rounded-2xl p-4 flex items-start gap-3"
        style={{ background: conf.bg, border: `1px solid ${conf.border}` }}
      >
        <Info size={17} style={{ color: conf.color }} className="shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold" style={{ color: conf.color }}>{conf.label}</p>
          <p className="text-xs mt-0.5 leading-snug" style={{ color: conf.color + 'cc' }}>
            {conf.desc}
          </p>
        </div>
      </motion.div>

      {/* Narrative */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22 }}
        className="rounded-3xl p-4"
        style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={15} className="text-primary shrink-0" />
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Novo's Assessment
          </p>
        </div>
        <p className="text-sm text-white leading-relaxed">{prediction.narrative}</p>
      </motion.div>

      {/* Mastery by subject */}
      {Object.keys(prediction.mastery_snapshot).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.26 }}
          className="rounded-3xl p-4"
          style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={15} className="text-primary shrink-0" />
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Mastery by Subject
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {Object.entries(prediction.mastery_snapshot).map(([subject, { mastered, total }]) => (
              <MasteryBar key={subject} subject={subject} mastered={mastered} total={total} />
            ))}
          </div>
        </motion.div>
      )}

      {/* Study plan accordion */}
      {prediction.study_plan.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={15} className="text-primary shrink-0" />
            <h2 className="font-heading text-base font-bold text-white">Study Plan</h2>
          </div>
          <div className="flex flex-col gap-2.5">
            {prediction.study_plan.map((week, i) => (
              <StudyWeekCard key={week.week} week={week} index={i} />
            ))}
          </div>
        </motion.div>
      )}

      {/* Weak topics */}
      {prediction.weak_topics.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.34 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={15} className="text-red-500 shrink-0" />
            <h2 className="font-heading text-base font-bold text-white">Weak Topics</h2>
          </div>
          <div className="flex flex-col gap-2">
            {prediction.weak_topics.map(topic => (
              <div
                key={topic}
                className="flex items-center gap-3 rounded-2xl px-4 py-3"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                <AlertCircle size={15} className="text-red-400 shrink-0" />
                <span className="text-sm font-medium text-red-400">{topic}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Strong topics */}
      {prediction.strong_topics.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={15} className="text-green-500 shrink-0" />
            <h2 className="font-heading text-base font-bold text-white">Strong Topics</h2>
          </div>
          <div className="flex flex-col gap-2">
            {prediction.strong_topics.map(topic => (
              <div
                key={topic}
                className="flex items-center gap-3 rounded-2xl px-4 py-3"
                style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}
              >
                <CheckCircle2 size={15} style={{ color: '#34D399' }} className="shrink-0" />
                <span className="text-sm font-medium" style={{ color: '#34D399' }}>{topic}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Footer: recalculate + cache info */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.42 }}
        className="flex flex-col items-center gap-2 pb-4"
      >
        <button
          onClick={onRecalculate}
          disabled={recalculating}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold text-muted-foreground transition-all active:scale-95 disabled:opacity-50"
          style={{ background: 'rgba(15,20,45,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <RefreshCw size={14} className={recalculating ? 'animate-spin' : ''} />
          {recalculating ? 'Recalculating…' : 'Recalculate'}
        </button>
        {cacheLabel && (
          <p className="text-[10px] text-muted-foreground">Last calculated {cacheLabel}</p>
        )}
      </motion.div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ExamPredictionPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [prediction, setPrediction] = useState<PredictionData | null>(null);
  const [cachedAt, setCachedAt]     = useState<string | null>(null);
  const [phase, setPhase]           = useState<'loading' | 'setup' | 'results'>('loading');
  const [predicting, setPredicting] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const mountedRef = useRef(true);

  // Fetch cached prediction on mount
  useEffect(() => {
    if (!user) return;
    mountedRef.current = true;

    supabase.functions
      .invoke('exam-prediction', { body: { action: 'get_cached' } })
      .then(({ data, error: fnErr }) => {
        if (!mountedRef.current) return;
        if (fnErr) { setPhase('setup'); return; }
        if (data?.prediction && !data?.expired) {
          setPrediction(data.prediction as PredictionData);
          setCachedAt(data.cached_at ?? null);
          setPhase('results');
        } else {
          setPhase('setup');
        }
      })
      .catch(() => {
        if (mountedRef.current) setPhase('setup');
      });

    return () => { mountedRef.current = false; };
  }, [user]);

  async function handlePredict(grade: string, score: number) {
    setPredicting(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('exam-prediction', {
        body: { action: 'predict', target_score: score, target_grade: grade },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.prediction) {
        setPrediction(data.prediction as PredictionData);
        setCachedAt(new Date().toISOString());
        setPhase('results');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setPredicting(false);
    }
  }

  async function handleRecalculate() {
    if (!prediction) return;
    setRecalculating(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('exam-prediction', {
        body: {
          action: 'predict',
          target_score: prediction.target_score,
          target_grade: prediction.target_grade,
          force_refresh: true,
        },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.prediction) {
        setPrediction(data.prediction as PredictionData);
        setCachedAt(new Date().toISOString());
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setRecalculating(false);
    }
  }

  // ── Loading ──
  if (phase === 'loading') {
    return (
      <div className="flex flex-col h-full bg-gradient-page">
        <div
          className="px-4 py-3 flex items-center gap-3 shrink-0"
          style={{ background: 'rgba(10,12,28,0.85)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}
        >
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <ArrowLeft size={17} className="text-white" />
          </button>
          <h1 className="font-heading text-lg font-bold text-white">Exam Prediction</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Loading your prediction…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gradient-page">
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ background: 'rgba(10,12,28,0.85)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}
      >
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-colors"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <ArrowLeft size={17} className="text-white" />
        </button>
        <div className="flex-1 flex items-center gap-2">
          <Target size={18} className="text-primary" />
          <h1 className="font-heading text-lg font-bold text-white">Exam Prediction</h1>
        </div>
        {phase === 'results' && (
          <div
            className="px-2.5 py-1 rounded-full text-[10px] font-bold"
            style={{ background: 'rgba(91,106,245,0.2)', color: '#818CF8' }}
          >
            AI Powered
          </div>
        )}
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 py-2.5 flex items-center gap-2"
            style={{ background: 'rgba(239,68,68,0.1)', borderBottom: '1px solid rgba(239,68,68,0.3)' }}
          >
            <AlertCircle size={14} className="text-red-500 shrink-0" />
            <p className="text-xs text-red-400 font-medium">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Body */}
      <div className="flex-1 overflow-y-auto native-scroll pb-nav">
        <AnimatePresence mode="wait">
          {phase === 'setup' ? (
            <motion.div
              key="setup"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col h-full"
            >
              <SetupScreen onPredict={handlePredict} loading={predicting} />
            </motion.div>
          ) : prediction ? (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <ResultsScreen
                prediction={prediction}
                cachedAt={cachedAt}
                onRecalculate={handleRecalculate}
                recalculating={recalculating}
                hasExamDate={prediction.has_exam_date ?? prediction.days_remaining !== null}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
