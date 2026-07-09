// ═══════════════════════════════════════════════════════════════
// Edora — ConfidenceScorePage
// Tracks speed × accuracy to surface genuine mastery vs overconfidence.
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, HelpCircle, Zap, AlertTriangle, XCircle, BookOpen,
  ArrowUpDown, ChevronDown, ChevronUp, BookMarked,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TopicConfidence {
  subject: string;
  topic: string;
  score: number;
  level: 'high' | 'medium' | 'shaky' | 'low';
  drill: string;
  sample_count: number;
}

interface ConfidenceData {
  by_subject: Record<string, { avg: number; topics: TopicConfidence[] }>;
  all_topics: TopicConfidence[];
}

type SortOrder = 'weakest' | 'strongest' | 'subject';

// ── Level config ──────────────────────────────────────────────────────────────

const LEVEL_CONFIG: Record<
  TopicConfidence['level'],
  { label: string; color: string; bg: string; badgeBg: string; badgeText: string }
> = {
  high:   { label: 'HIGH',   color: '#34D399', bg: 'rgba(16,185,129,0.12)',  badgeBg: 'rgba(16,185,129,0.2)',  badgeText: '#34D399'  },
  medium: { label: 'MEDIUM', color: '#818CF8', bg: 'rgba(91,106,245,0.12)',  badgeBg: 'rgba(91,106,245,0.2)',  badgeText: '#818CF8'  },
  shaky:  { label: 'SHAKY',  color: '#FBBF24', bg: 'rgba(245,158,11,0.12)', badgeBg: 'rgba(245,158,11,0.2)', badgeText: '#FBBF24' },
  low:    { label: 'LOW',    color: '#F87171', bg: 'rgba(239,68,68,0.12)',   badgeBg: 'rgba(239,68,68,0.2)',  badgeText: '#F87171'  },
};

function overallColor(score: number): string {
  if (score >= 75) return '#10B981';
  if (score >= 50) return '#5B6AF5';
  if (score >= 30) return '#F59E0B';
  return '#EF4444';
}

function overallLabel(score: number): string {
  if (score >= 75) return 'High';
  if (score >= 50) return 'Medium';
  if (score >= 30) return 'Shaky';
  return 'Low';
}

// ── Circular Meter ─────────────────────────────────────────────────────────────

function CircularMeter({ score, color }: { score: number; color: string }) {
  const r = 60;
  const circumference = 2 * Math.PI * r;
  const targetOffset = circumference * (1 - score / 100);

  return (
    <div className="relative flex items-center justify-center" style={{ width: 'min(160px, 42vw)', height: 'min(160px, 42vw)' }}>
      <svg width={160} height={160} className="-rotate-90" viewBox="0 0 160 160">
        {/* Track */}
        <circle
          cx={80}
          cy={80}
          r={r}
          fill="none"
          stroke="var(--ink-080)"
          strokeWidth={12}
        />
        {/* Progress */}
        <motion.circle
          cx={80}
          cy={80}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: targetOffset }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.2 }}
        />
      </svg>
      {/* Center label */}
      <div className="absolute flex flex-col items-center">
        <motion.span
          className="text-4xl font-heading font-bold"
          style={{ color }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          {score}
        </motion.span>
        <span className="text-xs text-muted-foreground font-medium">/ 100</span>
      </div>
    </div>
  );
}

// ── Legend Card ────────────────────────────────────────────────────────────────

function LegendCard({
  icon: Icon, label, range, desc, color, bg,
}: {
  icon: React.ComponentType<{ size?: number | string; className?: string; style?: React.CSSProperties }>; label: string; range: string; desc: string; color: string; bg: string;
}) {
  return (
    <div
      className="flex flex-col gap-1 p-2 rounded-2xl text-center flex-1 min-w-0"
      style={{ background: bg, border: '1px solid var(--ink-070)' }}
    >
      <Icon size={16} style={{ color }} className="mx-auto" />
      <span className="text-xs font-bold uppercase tracking-wide" style={{ color }}>
        {label}
      </span>
      <span className="text-xs text-muted-foreground font-medium">{range}</span>
      <span className="text-xs text-muted-foreground leading-tight hidden sm:block">{desc}</span>
    </div>
  );
}

// ── Topic Card ─────────────────────────────────────────────────────────────────

function TopicCard({ topic, index }: { topic: TopicConfidence; index: number }) {
  const cfg = LEVEL_CONFIG[topic.level];

  return (
    <motion.div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
    >
      {/* Confidence bar */}
      <div className="h-1.5 w-full" style={{ background: 'var(--ink-080)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: cfg.color }}
          initial={{ width: 0 }}
          animate={{ width: `${topic.score}%` }}
          transition={{ duration: 0.8, delay: 0.1 + index * 0.04, ease: 'easeOut' }}
        />
      </div>

      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-white truncate">{topic.topic}</span>
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
                style={{ background: cfg.badgeBg, color: cfg.badgeText }}
              >
                {cfg.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground italic mt-0.5 leading-snug">
              {topic.drill}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Based on {topic.sample_count} review{topic.sample_count !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <span
              className="text-2xl font-heading font-bold"
              style={{ color: cfg.color }}
            >
              {topic.score}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Subject Section ────────────────────────────────────────────────────────────

function SubjectSection({
  subject,
  avg,
  topics,
}: {
  subject: string;
  avg: number;
  topics: TopicConfidence[];
}) {
  const [expanded, setExpanded] = useState(true);
  const color = overallColor(avg);

  return (
    <div className="mb-4">
      <button
        className="flex items-center justify-between w-full mb-2"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <span className="font-heading font-bold text-white text-sm">{subject}</span>
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: `${color}20`, color }}
          >
            {avg}
          </span>
        </div>
        {expanded ? (
          <ChevronUp size={16} className="text-muted-foreground" />
        ) : (
          <ChevronDown size={16} className="text-muted-foreground" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2">
              {topics.map((t, i) => (
                <TopicCard key={`${t.subject}-${t.topic}`} topic={t} index={i} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Tooltip ────────────────────────────────────────────────────────────────────

function InfoTooltip({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="absolute right-0 top-8 z-50 w-64 text-white text-xs rounded-2xl p-3 shadow-xl leading-relaxed"
          style={{ background: 'var(--hdr-a-880)', border: '1px solid var(--ink-120)' }}
          initial={{ opacity: 0, y: -6, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.95 }}
          transition={{ duration: 0.15 }}
        >
          <strong className="block mb-1">How Confidence Score Works</strong>
          Confidence = speed × accuracy. Fast + correct means genuine mastery. Slow + correct may
          mean lucky guessing or shaky memory. Fast + wrong signals dangerous overconfidence.
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ConfidenceScorePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [data, setData] = useState<ConfidenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState('All');
  const [sortOrder, setSortOrder] = useState<SortOrder>('weakest');
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Close tooltip on outside click
  useEffect(() => {
    if (!tooltipVisible) return;
    const handler = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setTooltipVisible(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tooltipVisible]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: resp, error: fnError } = await withTimeout(
          supabase.functions.invoke('analytics', { body: { action: 'get_confidence' } }),
          30_000,
          'Request timed out. Please check your connection and try again.',
        );
        if (fnError) throw fnError;
        setData(resp as ConfidenceData);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load confidence data';
        setError(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, retryKey]);

  // ── Derived values ───────────────────────────────────────────────────────────

  const subjects = data ? ['All', ...Object.keys(data.by_subject)] : ['All'];

  const filteredTopics: TopicConfidence[] = (() => {
    if (!data) return [];
    const base =
      selectedSubject === 'All'
        ? data.all_topics
        : (data.by_subject[selectedSubject]?.topics ?? []);

    const copy = [...base];
    if (sortOrder === 'weakest') copy.sort((a, b) => a.score - b.score);
    else if (sortOrder === 'strongest') copy.sort((a, b) => b.score - a.score);
    else copy.sort((a, b) => a.subject.localeCompare(b.subject) || a.topic.localeCompare(b.topic));
    return copy;
  })();

  const overallScore = (() => {
    if (!data) return 0;
    const all = data.all_topics;
    if (!all.length) return 0;
    return Math.round(all.reduce((s, t) => s + t.score, 0) / all.length);
  })();

  const mainColor = overallColor(overallScore);
  const mainLabel = overallLabel(overallScore);

  const shakyOrLow = data
    ? data.all_topics.filter(t => t.level === 'shaky' || t.level === 'low').slice(0, 3)
    : [];

  const hasSufficientData = data && data.all_topics.length > 0;

  // ── Group for "By Subject" sort in "All" tab ─────────────────────────────────

  const groupedForRender = (() => {
    if (!data) return null;
    if (selectedSubject !== 'All' || sortOrder !== 'subject') return null;
    return Object.entries(data.by_subject).sort(([a], [b]) => a.localeCompare(b));
  })();

  // ── Skeleton ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-gradient-page">
        <div
          className="px-4 py-3 flex items-center gap-3 shrink-0"
          style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}
        >
          <div className="w-8 h-8 rounded-xl animate-pulse" style={{ background: 'var(--ink-080)' }} />
          <div className="flex-1">
            <div className="h-5 w-36 rounded-lg animate-pulse" style={{ background: 'var(--ink-080)' }} />
            <div className="h-3 w-24 rounded-lg animate-pulse mt-1" style={{ background: 'var(--ink-050)' }} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto pb-nav px-4 py-4 space-y-3">
          <div
            className="rounded-3xl p-6 flex flex-col items-center gap-4"
            style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}
          >
            <div className="w-40 h-40 rounded-full animate-pulse" style={{ background: 'var(--ink-080)' }} />
            <div className="h-4 w-32 rounded-lg animate-pulse" style={{ background: 'var(--ink-080)' }} />
          </div>
          {([1, 2, 3] as const).map(i => (
            <div
              key={i}
              className="rounded-2xl h-20 animate-pulse"
              style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col h-full bg-gradient-page">
        <div
          className="px-4 py-3 flex items-center gap-3 shrink-0"
          style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}
        >
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}
          >
            <ArrowLeft size={18} className="text-white" />
          </button>
          <span className="font-heading font-bold text-white">Confidence Score</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
          <div
            className="w-16 h-16 rounded-3xl flex items-center justify-center"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            <XCircle size={28} className="text-red-400" />
          </div>
          <p className="text-white font-semibold">Something went wrong</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
            onClick={() => setRetryKey(k => k + 1)}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── Empty / Low Data ──────────────────────────────────────────────────────────

  if (!hasSufficientData) {
    return (
      <div className="flex flex-col h-full bg-gradient-page">
        <div
          className="px-4 py-3 flex items-center gap-3 shrink-0"
          style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}
        >
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}
          >
            <ArrowLeft size={18} className="text-white" />
          </button>
          <span className="font-heading font-bold text-white">Confidence Score</span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-5">
          <motion.div
            className="w-20 h-20 rounded-3xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200 }}
          >
            <Zap size={32} className="text-white" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-2"
          >
            <h2 className="font-heading font-bold text-xl text-white">
              Not enough data yet
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              Confidence scores are built from your quiz answers, sprint results, flashcard
              reviews, and challenge attempts.
            </p>
            <p className="text-sm font-semibold text-white/70">
              Complete 10+ reviews to see your profile.
            </p>
          </motion.div>

          <motion.button
            className="px-6 py-3 rounded-2xl text-sm font-bold text-white shadow-md"
            style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            onClick={() => navigate('/spaced-review')}
            whileTap={{ scale: 0.97 }}
          >
            Review Flashcards →
          </motion.button>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-gradient-page">
      {/* ── Header ── */}
      <div
        className="px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}
      >
        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
          style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}
        >
          <ArrowLeft size={18} className="text-white" />
        </button>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-heading font-bold text-white">Confidence Score</span>
            <div ref={tooltipRef} className="relative">
              <button
                className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground transition-colors"
                onClick={() => setTooltipVisible(v => !v)}
              >
                <HelpCircle size={15} />
              </button>
              <InfoTooltip visible={tooltipVisible} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Speed × Accuracy analysis</p>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto pb-nav px-4 py-4 space-y-4">

        {/* ── Hero: Overall Meter ── */}
        <motion.div
          className="rounded-3xl p-6 flex flex-col items-center gap-3"
          style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <CircularMeter score={overallScore} color={mainColor} />
          <div className="text-center">
            <p className="font-heading font-bold text-lg text-white">
              Overall Confidence
            </p>
            <p className="text-sm font-semibold" style={{ color: mainColor }}>
              {mainLabel} Confidence
            </p>
          </div>
        </motion.div>

        {/* ── Legend ── */}
        <motion.div
          className="rounded-3xl p-4"
          style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">
            Confidence Levels
          </p>
          <div className="flex gap-2">
            <LegendCard
              icon={Zap}
              label="High"
              range="75–100"
              desc="Fast + Correct — Deep understanding"
              color={LEVEL_CONFIG.high.color}
              bg={LEVEL_CONFIG.high.bg}
            />
            <LegendCard
              icon={BookOpen}
              label="Medium"
              range="50–74"
              desc="Correct but slower — Solid but practice more"
              color={LEVEL_CONFIG.medium.color}
              bg={LEVEL_CONFIG.medium.bg}
            />
            <LegendCard
              icon={AlertTriangle}
              label="Shaky"
              range="30–49"
              desc="Slow + Correct — Lucky or memorised"
              color={LEVEL_CONFIG.shaky.color}
              bg={LEVEL_CONFIG.shaky.bg}
            />
            <LegendCard
              icon={XCircle}
              label="Low"
              range="<30"
              desc="Fast+Wrong or Slow+Wrong"
              color={LEVEL_CONFIG.low.color}
              bg={LEVEL_CONFIG.low.bg}
            />
          </div>
        </motion.div>

        {/* ── Subject tabs + Sort ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15 }}
        >
          {/* Subject tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {subjects.map(subj => (
              <button
                key={subj}
                onClick={() => setSelectedSubject(subj)}
                className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={
                  selectedSubject === subj
                    ? { background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)', color: 'var(--ink-950)' }
                    : { background: 'var(--ink-055)', color: 'var(--ink-500)', border: '1px solid var(--ink-080)' }
                }
              >
                {subj}
                {subj !== 'All' && data && (
                  <span className="ml-1.5 opacity-70">
                    {Math.round(data.by_subject[subj]?.avg ?? 0)}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Sort row */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <ArrowUpDown size={13} className="text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground font-medium shrink-0">Sort:</p>
            {(['weakest', 'strongest', 'subject'] as SortOrder[]).map(opt => (
              <button
                key={opt}
                onClick={() => setSortOrder(opt)}
                className="text-xs px-2.5 py-1 rounded-lg font-medium transition-all"
                style={
                  sortOrder === opt
                    ? { background: '#5B6AF5', color: 'var(--ink-950)' }
                    : { background: 'var(--ink-055)', color: 'var(--ink-500)', border: '1px solid var(--ink-080)' }
                }
              >
                {opt === 'weakest' ? 'Weakest First' : opt === 'strongest' ? 'Strongest First' : 'By Subject'}
              </button>
            ))}
          </div>
        </motion.div>

        {/* ── Topic List ── */}
        <div>
          {groupedForRender ? (
            groupedForRender.map(([subject, { avg, topics }]) => (
              <SubjectSection key={subject} subject={subject} avg={Math.round(avg)} topics={topics} />
            ))
          ) : selectedSubject !== 'All' && data ? (
            <SubjectSection
              subject={selectedSubject}
              avg={Math.round(data.by_subject[selectedSubject]?.avg ?? 0)}
              topics={filteredTopics}
            />
          ) : (
            <div className="flex flex-col gap-2">
              {filteredTopics.map((t, i) => (
                <TopicCard key={`${t.subject}-${t.topic}`} topic={t} index={i} />
              ))}
            </div>
          )}
        </div>

        {/* ── Drill CTA ── */}
        <AnimatePresence mode="wait">
          {shakyOrLow.length > 0 ? (
            <motion.div
              key="drill"
              className="rounded-3xl p-4"
              style={{ background: 'rgba(245,158,11,0.08)', border: '2px solid rgba(245,158,11,0.3)' }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(245,158,11,0.2)' }}
                >
                  <AlertTriangle size={16} style={{ color: '#FBBF24' }} />
                </div>
                <div>
                  <p className="font-heading font-bold text-sm" style={{ color: '#FBBF24' }}>
                    Novo recommends drilling these topics
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Your confidence is shaky or low here
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 mb-4">
                {shakyOrLow.map(t => (
                  <div key={`${t.subject}-${t.topic}`} className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: LEVEL_CONFIG[t.level].color }}
                    />
                    <span className="text-sm font-medium text-white">{t.topic}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{t.subject}</span>
                  </div>
                ))}
              </div>

              <button
                className="w-full py-3 rounded-2xl text-sm font-bold text-white shadow-sm"
                style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}
                onClick={() => navigate('/spaced-review')}
              >
                Start Targeted Review →
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="great"
              className="rounded-3xl p-4 flex items-center gap-3"
              style={{ background: 'rgba(16,185,129,0.08)', border: '2px solid rgba(16,185,129,0.3)' }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
            >
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(16,185,129,0.15)' }}
              >
                <BookMarked size={20} style={{ color: '#34D399' }} />
              </div>
              <div>
                <p className="font-heading font-bold text-sm" style={{ color: '#34D399' }}>
                  Great confidence across all topics!
                </p>
                <p className="text-xs text-muted-foreground">
                  Keep it up — you're genuinely mastering this material.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
