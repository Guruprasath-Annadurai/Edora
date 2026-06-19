// ═══════════════════════════════════════════════════════════════
// Edora — LearningStylePage
// Shows the user's learning style profile and lets them re-analyse.
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Lightbulb, Brain, Sparkles, Clock, Eye, FileText, List, Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  loadLearningStyle,
  STYLE_DESCRIPTIONS,
  type LearningStyleProfile,
  type LearningStyleType,
} from '@/lib/learningStyle';

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const diff  = Date.now() - new Date(iso).getTime();
  const days  = Math.floor(diff / 86_400_000);
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1)   return 'just now';
  if (hours < 24)  return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  if (days === 1)  return 'yesterday';
  if (days < 30)   return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

function styleGradient(style: LearningStyleType): string {
  switch (style) {
    case 'visual':        return 'linear-gradient(135deg, #7C3AED, #3B82F6)';
    case 'conceptual':    return 'linear-gradient(135deg, #4F46E5, #7C3AED)';
    case 'example_driven':return 'linear-gradient(135deg, #D97706, #F97316)';
    case 'step_by_step':  return 'linear-gradient(135deg, #0D9488, #06B6D4)';
    case 'mixed':         return 'linear-gradient(135deg, #5B6AF5, #EC4899, #F59E0B)';
    default:              return 'linear-gradient(135deg, #5B6AF5, #8B5CF6)';
  }
}

function styleAdaptText(style: LearningStyleType): string {
  switch (style) {
    case 'visual':        return 'describe concepts spatially and use vivid analogies';
    case 'conceptual':    return 'lead with the underlying why and first principles';
    case 'example_driven':return 'always show worked examples before theory';
    case 'step_by_step':  return 'break everything into numbered sequential steps';
    case 'mixed':         return 'mix different explanation styles based on the topic';
    default:              return 'adapt to what works best for you';
  }
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={`rounded-xl animate-pulse ${className ?? ''}`}
      style={{ background: 'rgba(255,255,255,0.06)' }} />
  );
}

function LoadingSkeleton() {
  return (
    <div className="px-4 py-4 flex flex-col gap-4">
      <div className="rounded-3xl overflow-hidden">
        <SkeletonBlock className="h-48 rounded-3xl" />
      </div>
      <div className="rounded-2xl p-4 space-y-4"
        style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <SkeletonBlock className="h-4 w-28" />
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3">
            <SkeletonBlock className="h-4 w-24" />
            <div className="flex-1 h-3 rounded-full animate-pulse"
              style={{ background: 'rgba(255,255,255,0.06)' }} />
            <SkeletonBlock className="h-4 w-10" />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {[0, 1, 2].map(i => <SkeletonBlock key={i} className="h-8 w-28 rounded-full" />)}
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map(i => <SkeletonBlock key={i} className="h-16 rounded-2xl" />)}
      </div>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState() {
  const navigate = useNavigate();
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center text-center px-6 pt-12 pb-8"
    >
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center mb-5"
        style={{ background: 'rgba(91,106,245,0.15)', border: '1px solid rgba(91,106,245,0.3)' }}
      >
        <Brain size={44} style={{ color: '#8B9BFA' }} />
      </div>

      <h2 className="font-heading text-xl font-bold text-white mb-2">
        Not analysed yet
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed mb-8 max-w-xs">
        Your learning style hasn't been analysed yet. Start a tutoring session
        to let Novo learn how you think.
      </p>

      <button
        onClick={() => navigate('/tutoring')}
        className="flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold text-white active:scale-95 transition-all"
        style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
      >
        <Sparkles size={15} />
        Go to Tutoring
      </button>
    </motion.div>
  );
}

// ── Animated Bar ─────────────────────────────────────────────────────────────

interface BarRowProps {
  label:     string;
  icon:      React.ComponentType<{ size?: number | string; className?: string; style?: React.CSSProperties }>;
  iconColor: string;
  pct:       number;
  isPrimary: boolean;
  delay:     number;
}

function BarRow({ label, icon: Icon, iconColor, pct, isPrimary, delay }: BarRowProps) {
  const displayPct = Math.round(Math.max(0, Math.min(100, pct)));

  return (
    <div className="flex items-center gap-3">
      {/* Label */}
      <div className="w-36 shrink-0 flex items-center gap-1.5">
        <Icon size={14} style={{ color: iconColor }} />
        <span className="text-xs font-semibold text-white truncate">{label}</span>
      </div>

      {/* Track */}
      <div className="flex-1 h-3 rounded-full overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.08)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{
            background: isPrimary
              ? 'linear-gradient(90deg, #5B6AF5, #8B5CF6)'
              : 'rgba(255,255,255,0.2)',
          }}
          initial={{ width: 0 }}
          animate={{ width: `${displayPct}%` }}
          transition={{ duration: 0.7, delay, ease: 'easeOut' }}
        />
      </div>

      {/* Pct */}
      <span
        className="w-10 text-right text-xs font-bold shrink-0"
        style={{ color: isPrimary ? '#8B9BFA' : 'rgba(255,255,255,0.4)' }}
      >
        {displayPct}%
      </span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LearningStylePage() {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const mountedRef = useRef(true);

  const [profile,  setProfile]  = useState<LearningStyleProfile | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setError(null);

    loadLearningStyle(user.id)
      .then(p => {
        if (!mountedRef.current) return;
        setProfile(p);
      })
      .catch(err => {
        if (!mountedRef.current) return;
        console.error('[LearningStyle] load:', err);
        setError('Failed to load your learning profile. Check your connection.');
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
  }, [user]);

  // ── Derived ──
  const desc = profile ? STYLE_DESCRIPTIONS[profile.primary_style] : null;

  const bars = profile
    ? [
        { label: 'Visual',        icon: Eye,      iconColor: '#8B5CF6', pct: profile.visual_score       * 100, key: 'visual'        },
        { label: 'Conceptual',    icon: Lightbulb, iconColor: '#F59E0B', pct: profile.conceptual_score  * 100, key: 'conceptual'    },
        { label: 'Example-Driven',icon: FileText,  iconColor: '#06B6D4', pct: profile.example_score     * 100, key: 'example_driven'},
        { label: 'Step-by-Step',  icon: List,      iconColor: '#10B981', pct: profile.step_by_step_score* 100, key: 'step_by_step'  },
      ]
    : [];

  const primaryKey: string = profile?.primary_style ?? '';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-gradient-page">

      {/* ── Header ── */}
      <div className="px-4 py-3 shrink-0 flex items-center gap-3 sticky top-0 z-20"
        style={{ background: 'rgba(10,12,28,0.85)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 active:scale-95 transition-all text-white"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <ArrowLeft size={17} />
        </button>
        <div className="flex-1">
          <h1 className="font-heading text-lg font-bold text-white leading-tight">
            Learning Style
          </h1>
          <p className="text-xs text-muted-foreground">How Novo adapts to you</p>
        </div>
      </div>

      {/* ── Error banner ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden shrink-0"
          >
            <div
              className="mx-4 mt-3 px-4 py-3 rounded-2xl flex items-start gap-2.5"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              <Brain size={15} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs font-medium text-red-400">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto native-scroll pb-nav">

        {loading && <LoadingSkeleton />}

        {!loading && !profile && !error && <EmptyState />}

        {!loading && profile && desc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="px-4 py-4 flex flex-col gap-4 pb-10"
          >

            {/* ── 1. Primary Style Card ── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="rounded-3xl p-6 text-white relative overflow-hidden"
              style={{ background: styleGradient(profile.primary_style) }}
            >
              {/* Decorative circles */}
              <div
                className="absolute -top-8 -right-8 w-36 h-36 rounded-full opacity-20"
                style={{ background: 'rgba(255,255,255,0.3)' }}
              />
              <div
                className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full opacity-10"
                style={{ background: 'rgba(255,255,255,0.4)' }}
              />

              {/* Content */}
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                  style={{ background: 'rgba(255,255,255,0.2)' }}>
                  {(() => {
                    const s = profile.primary_style;
                    const C = s === 'visual' ? Eye : s === 'conceptual' ? Lightbulb : s === 'example_driven' ? FileText : s === 'step_by_step' ? List : Layers;
                    return <C size={26} className="text-white" />;
                  })()}
                </div>
                <h2 className="text-2xl font-bold font-heading mb-2 leading-tight">
                  {desc.label}
                </h2>
                <p className="text-sm leading-relaxed opacity-90 mb-4">
                  {desc.description}
                </p>

                {/* Sessions badge */}
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
                  style={{ background: 'rgba(255,255,255,0.2)' }}
                >
                  <Sparkles size={11} />
                  Based on {profile.sessions_analysed} session{profile.sessions_analysed === 1 ? '' : 's'}
                </span>
              </div>
            </motion.div>

            {/* ── 2. Style Radar (bar chart) ── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="rounded-2xl p-4"
              style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <h3 className="text-sm font-bold text-white mb-4">Style Breakdown</h3>
              <div className="flex flex-col gap-3.5">
                {bars.map((bar, i) => (
                  <BarRow
                    key={bar.key}
                    label={bar.label}
                    icon={bar.icon}
                    iconColor={bar.iconColor}
                    pct={bar.pct}
                    isPrimary={bar.key === primaryKey}
                    delay={0.12 + i * 0.08}
                  />
                ))}
              </div>
            </motion.div>

            {/* ── 3. Strengths ── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="rounded-2xl p-4"
              style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <h3 className="text-sm font-bold text-white mb-3">Your Strengths</h3>
              <div className="flex flex-wrap gap-2">
                {desc.strengths.map(s => (
                  <span
                    key={s}
                    className="px-3 py-1.5 rounded-full text-xs font-bold"
                    style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#34D399' }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </motion.div>

            {/* ── 4. Study Tips ── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28, duration: 0.4 }}
            >
              <h3 className="text-sm font-bold text-white mb-3 px-1">Study Tips for You</h3>
              <div className="flex flex-col gap-2.5">
                {desc.tips.map((tip, i) => (
                  <div
                    key={i}
                    className="rounded-2xl p-3.5 flex items-start gap-3"
                    style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    <div
                      className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}
                    >
                      <Lightbulb size={13} style={{ color: '#FBBF24' }} />
                    </div>
                    <div className="flex items-start gap-2 flex-1">
                      <span
                        className="text-[11px] font-bold shrink-0 mt-0.5"
                        style={{ color: '#5B6AF5' }}
                      >
                        {i + 1}.
                      </span>
                      <p className="text-sm text-white leading-snug">{tip}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* ── 5. How Novo Adapts ── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.36, duration: 0.4 }}
              className="rounded-2xl p-4"
              style={{ background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.25)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={14} style={{ color: '#8B9BFA' }} className="shrink-0" />
                <h3 className="text-sm font-bold text-white">
                  How Novo Adapts
                </h3>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>
                Novo automatically adjusts its explanations based on your style. When you
                study in Tutoring mode, Novo will{' '}
                <span className="font-bold">{styleAdaptText(profile.primary_style)}</span>.
              </p>
            </motion.div>

            {/* ── 6. Last analysed ── */}
            <div className="flex items-center gap-1.5 px-1">
              <Clock size={12} className="text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground">
                Last updated: {daysAgo(profile.last_analysed_at)}
              </p>
            </div>

          </motion.div>
        )}
      </div>
    </div>
  );
}
