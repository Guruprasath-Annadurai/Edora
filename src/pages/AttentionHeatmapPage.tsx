// ═══════════════════════════════════════════════════════════════
// Edora — AttentionHeatmapPage
// Route: /attention-heatmap
// Shows which topics the user has been neglecting, with Novo
// alerts, coloured topic grid, and stats footer.
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Info, CheckCircle2, AlertCircle,
  BookOpen, Flame, BarChart3,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { withTimeout } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TopicEntry {
  subject: string;
  topic: string;
  days_since: number;
  last_studied: string;
  source: string;
}

interface Alert {
  subject: string;
  topic: string;
  days_since: number;
  message: string;
  urgency: 'high' | 'medium' | 'low';
}

interface HeatmapData {
  heatmap: Record<string, TopicEntry[]>;
  alerts: Alert[];
  total_topics: number;
}

// ── Colour helpers ────────────────────────────────────────────────────────────

function topicColor(daysSince: number): { bg: string; border: string; text: string; label: string } {
  if (daysSince <= 3)  return { bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.3)',  text: '#34D399', label: 'Recent' };
  if (daysSince <= 7)  return { bg: 'rgba(101,163,13,0.12)', border: 'rgba(101,163,13,0.3)', text: '#a3e635', label: `${daysSince}d ago` };
  if (daysSince <= 14) return { bg: 'rgba(217,119,6,0.12)',  border: 'rgba(217,119,6,0.3)',  text: '#FBBF24', label: `${daysSince}d` };
  if (daysSince <= 21) return { bg: 'rgba(234,88,12,0.12)',  border: 'rgba(234,88,12,0.3)',  text: '#FB923C', label: `${daysSince}d` };
  return { bg: 'rgba(220,38,38,0.12)', border: 'rgba(220,38,38,0.3)', text: '#F87171', label: `${daysSince}d` };
}

function sourceLabel(source: string): string {
  // Keys match what analytics/index.ts sync_from_existing actually stores
  const map: Record<string, string> = {
    sr_review:       'SR Review',
    streak:          'Streak',
    story:           'Story Mode',
    debate:          'Debate',
    curriculum:      'Curriculum',
    challenge:       'Boss Challenge',
    whiteboard:      'Whiteboard',
    photo_solver:    'Photo Solver',
    novo_reads:      'Novo Reads',
    video_companion: 'Video',
    sprint:          'Sprint',
    quiz:            'Quiz',
    flashcard:       'Flashcard',
  };
  return map[source] ?? source;
}

// ── Alert Card ────────────────────────────────────────────────────────────────

const URGENCY_CONFIG: Record<string, { bg: string; border: string; text: string; icon: LucideIcon; labelColor: string }> = {
  high:   { bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)',   text: '#F87171', icon: AlertCircle, labelColor: '#F87171' },
  medium: { bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)',  text: '#FBBF24', icon: AlertCircle, labelColor: '#FBBF24' },
  low:    { bg: 'rgba(202,138,4,0.08)',  border: 'rgba(202,138,4,0.25)', text: '#FDE047', icon: Info,         labelColor: '#FDE047' },
};

function AlertCard({ alert, index, onStudyNow }: {
  alert: Alert;
  index: number;
  onStudyNow: (subject: string) => void;
}) {
  const c = URGENCY_CONFIG[alert.urgency];
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06, type: 'spring', stiffness: 200, damping: 20 }}
      className="rounded-2xl border p-4"
      style={{ background: c.bg, borderColor: c.border }}
    >
      <div className="flex items-start gap-3">
        {(() => { const UIcon = c.icon; return <UIcon size={18} className="shrink-0 mt-0.5" style={{ color: c.text }} />; })()}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="font-bold text-sm" style={{ color: c.text }}>{alert.topic}</p>
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: c.text + '18', color: c.text }}
            >
              {alert.subject}
            </span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="font-heading font-bold text-3xl leading-none"
              style={{ color: c.text }}
            >
              {alert.days_since}
            </span>
            <span className="text-xs font-medium" style={{ color: c.text + 'aa' }}>days since reviewed</span>
          </div>
          <p className="text-xs leading-snug mb-3" style={{ color: c.text + 'cc' }}>{alert.message}</p>
          <button
            onClick={() => onStudyNow(alert.subject)}
            className="text-xs font-bold px-3.5 py-2 rounded-xl transition-all active:scale-95 text-white"
            style={{ background: c.text }}
          >
            Study Now →
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Topic Card ────────────────────────────────────────────────────────────────

function TopicCard({ entry, index }: { entry: TopicEntry; index: number }) {
  const c = topicColor(entry.days_since);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.93 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.03, type: 'spring', stiffness: 250, damping: 25 }}
      className="rounded-2xl border p-3 flex flex-col gap-1.5"
      style={{ background: c.bg, borderColor: c.border }}
    >
      <p className="text-xs font-bold leading-snug" style={{ color: c.text }}>
        {entry.topic}
      </p>
      <p className="text-xs font-semibold" style={{ color: c.text + 'bb' }}>
        {c.label}
      </p>
      <span
        className="text-xs font-bold px-2 py-0.5 rounded-full self-start"
        style={{ background: c.text + '18', color: c.text }}
      >
        {sourceLabel(entry.source)}
      </span>
    </motion.div>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function InfoTooltip({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="absolute top-8 right-0 z-20 w-56 text-white text-xs leading-snug rounded-2xl px-3.5 py-2.5 shadow-lg pointer-events-none"
          style={{ background: 'var(--ink-050)', backdropFilter: 'blur(28px) saturate(170%) brightness(1.04)', WebkitBackdropFilter: 'blur(28px) saturate(170%) brightness(1.04)', border: '1px solid var(--ink-100)' }}
        >
          Shows which topics you've been avoiding — the redder a card, the longer it's been since you studied it.
          <div className="absolute top-[-5px] right-4 w-2.5 h-2.5 rotate-45" style={{ background: 'var(--hdr-b-950)' }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Stats Row ─────────────────────────────────────────────────────────────────

function StatsRow({ data }: { data: HeatmapData }) {
  const allTopics = Object.values(data.heatmap).flat();
  const reviewedThisWeek = allTopics.filter(t => t.days_since <= 7).length;
  const neglected7Plus   = allTopics.filter(t => t.days_since > 7).length;

  const stats = [
    { label: 'Topics tracked',      value: data.total_topics,    icon: BookOpen, color: '#5B6AF5' },
    { label: 'Reviewed this week',  value: reviewedThisWeek,     icon: CheckCircle2, color: '#16a34a' },
    { label: '7+ days neglected',   value: neglected7Plus,       icon: AlertCircle,  color: '#dc2626' },
  ];

  return (
    <div className="rounded-3xl p-4" style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
      <div className="grid grid-cols-3" style={{ borderTop: 'none' }}>
        {stats.map(({ label, value, icon: Icon, color }, i) => (
          <div key={label} className="flex flex-col items-center gap-1 px-2 text-center"
            style={i > 0 ? { borderLeft: '1px solid var(--ink-070)' } : {}}>
            <Icon size={16} style={{ color }} />
            <span className="font-heading font-bold text-xl leading-none text-white">{value}</span>
            <span className="text-xs text-muted-foreground font-medium leading-tight">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AttentionHeatmapPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data, setData]           = useState<HeatmapData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey]   = useState(0);
  const [activeTab, setActiveTab] = useState('All');
  const [showTooltip, setShowTooltip] = useState(false);
  const mountedRef = useRef(true);

  // Backfill + fetch on mount (retryKey triggers re-fetch on retry)
  useEffect(() => {
    if (!user) return;
    mountedRef.current = true;
    setLoading(true);
    setLoadError('');

    async function load() {
      // Fire sync in background (don't await)
      supabase.functions.invoke('analytics', { body: { action: 'sync_from_existing' } }).catch(() => {});

      // Fetch heatmap
      let res: HeatmapData | null = null;
      try {
        const { data: fnData, error } = await withTimeout(
          supabase.functions.invoke('analytics', { body: { action: 'get_heatmap' } }),
          30_000,
          'Heatmap request timed out. Please try again.',
        );
        if (!mountedRef.current) return;
        if (error) throw error;
        res = fnData as HeatmapData;
      } catch (err) {
        if (!mountedRef.current) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load heatmap. Please try again.');
        setLoading(false);
        return;
      }
      setData(res);
      setLoading(false);
    }

    load();
    return () => { mountedRef.current = false; };
  }, [user, retryKey]);

  function handleStudyNow(subject: string) {
    const params = subject ? `?subject=${encodeURIComponent(subject)}` : '';
    navigate(`/sprint${params}`);
  }

  // ── Loading / Error ──
  if (loading || loadError) {
    return (
      <div className="flex flex-col h-full bg-gradient-page">
        <div className="px-4 py-3 flex items-center gap-3 shrink-0"
          style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
          <button aria-label="Go back"
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
            style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}
          >
            <ArrowLeft size={17} className="text-white" />
          </button>
          <h1 className="font-heading text-lg font-bold text-white">Attention Heatmap</h1>
        </div>
        <div className="flex-1 flex items-center justify-center px-6">
          {loadError ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <AlertCircle size={40} className="text-red-400" />
              <p className="text-sm text-muted-foreground">{loadError}</p>
              <button
                onClick={() => setRetryKey(k => k + 1)}
                className="px-5 py-2.5 rounded-2xl text-xs font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Analysing your study patterns…</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // All subjects for tabs
  const subjects = data ? ['All', ...Object.keys(data.heatmap)] : ['All'];

  // Filtered topic entries (sorted: most neglected first)
  const filteredEntries: { subject: string; entries: TopicEntry[] }[] = (() => {
    if (!data) return [];
    const raw = activeTab === 'All'
      ? Object.entries(data.heatmap)
      : Object.entries(data.heatmap).filter(([s]) => s === activeTab);
    return raw
      .map(([subject, entries]) => ({
        subject,
        entries: [...entries].sort((a, b) => b.days_since - a.days_since),
      }))
      .filter(g => g.entries.length > 0);
  })();

  const totalEntries = filteredEntries.reduce((n, g) => n + g.entries.length, 0);

  return (
    <div className="flex flex-col h-full bg-gradient-page">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
        <button aria-label="Go back"
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
          style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}
        >
          <ArrowLeft size={17} className="text-white" />
        </button>
        <div className="flex-1 flex items-center gap-2">
          <Flame size={18} className="text-orange-400" />
          <h1 className="font-heading text-lg font-bold text-white">Attention Heatmap</h1>
        </div>
        {/* Info icon with tooltip */}
        <div className="relative">
          <button
            onClick={() => setShowTooltip(v => !v)}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}
          >
            <Info size={15} className="text-muted-foreground" />
          </button>
          <InfoTooltip visible={showTooltip} />
        </div>
      </div>

      {/* Scrollable body */}
      <div
        className="flex-1 overflow-y-auto native-scroll pb-nav px-4 py-4 flex flex-col gap-5"
        onClick={() => showTooltip && setShowTooltip(false)}
      >

        {/* ── Novo Alerts ── */}
        {!data ? (
          /* API failed — show neutral empty state, not a false positive */
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl p-6 flex flex-col items-center gap-3 text-center"
            style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(91,106,245,0.15)' }}>
              <BarChart3 size={28} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">No data yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Start a sprint or review flashcards to populate your heatmap.
              </p>
            </div>
            <button
              onClick={() => navigate('/sprint')}
              className="px-5 py-2.5 rounded-2xl text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
            >
              Start a Sprint
            </button>
          </motion.div>
        ) : data.alerts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl p-4 flex items-center gap-3"
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}
          >
            <CheckCircle2 size={22} className="text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-300">All topics reviewed recently!</p>
              <p className="text-xs text-emerald-400/80 mt-0.5">Keep up the excellent study habit.</p>
            </div>
          </motion.div>
        ) : (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle size={15} className="text-red-500 shrink-0" />
              <h2 className="font-heading text-base font-bold text-white">Novo's Alerts</h2>
              <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#F87171' }}>
                {data.alerts.length} neglected
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {data.alerts.map((alert, i) => (
                <AlertCard
                  key={`${alert.subject}-${alert.topic}`}
                  alert={alert}
                  index={i}
                  onStudyNow={handleStudyNow}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Subject tabs ── */}
        {subjects.length > 1 && (
          <div
            className="flex gap-2 overflow-x-auto pb-0.5"
            style={{ scrollbarWidth: 'none' }}
          >
            {subjects.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95"
                style={
                  activeTab === tab
                    ? { background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)', color: 'var(--ink-950)' }
                    : { background: 'var(--ink-060)', color: 'var(--ink-550)', border: '1px solid var(--ink-100)' }
                }
              >
                {tab}
              </button>
            ))}
          </div>
        )}

        {/* ── Heatmap grid ── */}
        {totalEntries === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl p-8 flex flex-col items-center gap-4 text-center"
            style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}
          >
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(91,106,245,0.15)' }}>
              <BookOpen size={32} className="text-primary" />
            </div>
            <div>
              <p className="font-heading font-bold text-white text-base mb-1">No study data yet</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Start a sprint or review your flashcards to populate your heatmap.
              </p>
            </div>
            <button
              onClick={() => navigate('/sprint')}
              className="px-6 py-3 rounded-2xl text-sm font-bold text-white active:scale-95 transition-all"
              style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
            >
              Start a Sprint
            </button>
          </motion.div>
        ) : (
          <div className="flex flex-col gap-6">
            {filteredEntries.map(({ subject, entries }) => (
              <section key={subject}>
                {/* Subject header */}
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen size={14} className="text-primary shrink-0" />
                  <h3 className="font-heading text-sm font-bold text-white">{subject}</h3>
                  <span className="text-xs text-muted-foreground font-medium ml-1">
                    {entries.length} topic{entries.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {/* 2-column grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  {entries.map((entry, i) => (
                    <TopicCard
                      key={`${entry.subject}-${entry.topic}`}
                      entry={entry}
                      index={i}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* ── Legend ── */}
        {totalEntries > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl p-3.5"
            style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}
          >
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2.5">
              Colour legend
            </p>
            <div className="flex flex-col gap-1.5">
              {[
                { label: '0–3 days',  color: '#34D399', bg: 'rgba(16,185,129,0.15)'  },
                { label: '4–7 days',  color: '#a3e635', bg: 'rgba(101,163,13,0.15)'  },
                { label: '8–14 days', color: '#FBBF24', bg: 'rgba(217,119,6,0.15)'   },
                { label: '15–21 days',color: '#FB923C', bg: 'rgba(234,88,12,0.15)'   },
                { label: '22+ days',  color: '#F87171', bg: 'rgba(220,38,38,0.15)'   },
              ].map(({ label, color, bg }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-lg shrink-0" style={{ background: bg, border: `1.5px solid ${color}60` }} />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Stats row ── */}
        {data && <StatsRow data={data} />}

        <div className="h-4" />
      </div>
    </div>
  );
}
