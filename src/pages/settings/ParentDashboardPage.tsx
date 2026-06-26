// ═══════════════════════════════════════════════════════════════
// Edora — ParentDashboardPage
// Novo AI weekly parent report: live stats + AI narrative.
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, BarChart2, Zap, BookOpen, Star, Target,
  RefreshCw, Share2, Eye, X, Clock, ChevronRight, FileText,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Share } from '@capacitor/share';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Report {
  id: string;
  week_start: string;
  report_html: string;
  report_data: { narrative?: string; [key: string]: unknown };
  generated_at: string;
}

interface ReportSummary {
  id: string;
  week_start: string;
  generated_at: string;
  report_data: { narrative?: string; [key: string]: unknown };
}

interface MasteryBySubject {
  [sub: string]: { mastered: number; total: number };
}

interface Overview {
  profile: { full_name: string; xp: number; level: number; streak_count: number };
  stats: {
    sprints_completed: number;
    sr_cards_total: number;
    xp_earned: number;
    challenges_attempted: number;
  };
  mastery_by_subject: MasteryBySubject;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
}

function formatWeek(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Donut ring (inline SVG) ───────────────────────────────────────────────────

function MasteryRing({
  subject, mastered, total,
}: { subject: string; mastered: number; total: number }) {
  const pct    = total > 0 ? Math.round((mastered / total) * 100) : 0;
  const size   = 52;
  const stroke = 5;
  const r      = (size - stroke) / 2;
  const circ   = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color  = pct >= 70 ? '#10B981' : pct >= 40 ? '#F59E0B' : '#EF4444';
  const short  = subject.length > 7 ? subject.slice(0, 6) + '…' : subject;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={color} strokeWidth={stroke}
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s ease' }} />
        </svg>
        <span className="text-[10px] font-bold" style={{ color }}>{pct}%</span>
      </div>
      <span className="text-[9px] text-center leading-tight" style={{ color: 'rgba(255,255,255,0.5)' }}>{short}</span>
    </div>
  );
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-xl ${className ?? ''}`} style={{ background: 'rgba(255,255,255,0.06)' }} />
  );
}

// ── Dots animation ────────────────────────────────────────────────────────────

function ThreeDots() {
  return (
    <span className="inline-flex gap-1 items-end h-4">
      {[0, 1, 2].map(i => (
        <motion.span key={i} className="w-1.5 h-1.5 rounded-full bg-current"
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.18 }} />
      ))}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ParentDashboardPage() {
  const { user } = useAuth();

  const [overview,   setOverview]   = useState<Overview | null>(null);
  const [report,     setReport]     = useState<Report | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showModal,  setShowModal]  = useState(false);
  const [history,    setHistory]    = useState<ReportSummary[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  // ── Load overview (fast, no AI) ─────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    supabase.functions.invoke('analytics', { body: { action: 'get_overview', days: 7 } })
      .then(({ data }) => { if (data) setOverview(data as Overview); })
      .catch(e => console.error('[ParentDashboard] overview:', e))
      .finally(() => setStatsLoading(false));
  }, [user]);

  // ── Load latest report + history ────────────────────────────────────────────
  const loadReport = useCallback(async () => {
    if (!user) return;
    const [{ data: latest }, { data: hist }] = await Promise.all([
      supabase.functions.invoke('weekly-report', { body: { action: 'get_latest' } }),
      supabase.functions.invoke('weekly-report', { body: { action: 'get_history' } }),
    ]);
    if (latest?.report) setReport(latest.report as Report);
    if (hist?.reports)  setHistory(hist.reports as ReportSummary[]);
  }, [user]);

  useEffect(() => { loadReport(); }, [loadReport]);

  // ── Generate ────────────────────────────────────────────────────────────────
  async function handleGenerate() {
    setGenerating(true);
    try {
      const { data } = await supabase.functions.invoke('weekly-report', { body: { action: 'generate' } });
      if (data?.report) {
        setReport(data.report as Report);
        await loadReport();
      }
    } catch (e) {
      console.error('[ParentDashboard] generate:', e);
    } finally {
      setGenerating(false);
    }
  }

  // ── Share ────────────────────────────────────────────────────────────────────
  async function handleShare() {
    if (!report) return;
    try {
      await Share.share({
        title: 'Edora Weekly Parent Report',
        text: report.report_data?.narrative
          ? String(report.report_data.narrative).slice(0, 500)
          : 'Please find the Edora weekly progress report below.',
        dialogTitle: 'Share Parent Report',
      });
    } catch {
      // User cancelled share or share not available — silently fall back
      try {
        await navigator.clipboard.writeText(report.report_html);
      } catch { /* noop */ }
    }
  }

  const masteryEntries = Object.entries(overview?.mastery_by_subject ?? {});

  return (
    <div className="flex flex-col h-full bg-gradient-page">

      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3 shrink-0 sticky top-0 z-10"
        style={{ background: 'rgba(8,6,20,0.82)', borderBottom: '1px solid rgba(255,255,255,0.10)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
        <Link to="/profile">
          <button aria-label="Go back" className="w-8 h-8 flex items-center justify-center rounded-xl text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', WebkitTapHighlightColor: 'transparent' }}>
            <ChevronLeft size={18} />
          </button>
        </Link>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
          <BarChart2 size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h2 className="font-heading font-bold text-white text-sm">Parent Report</h2>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Novo AI weekly summary</p>
        </div>
      </div>

      <div className="flex-1 native-scroll pb-nav px-4 py-4 flex flex-col gap-4">

        {/* ── Live Stats Section ────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl overflow-hidden"
          style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="px-4 pt-4 pb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="font-semibold text-white text-sm">This Week's Activity</p>
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>Live data · last 7 days</p>
          </div>

          {statsLoading ? (
            <div className="p-4 grid grid-cols-2 gap-3">
              {[0,1,2,3].map(i => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-0">
              {[
                { icon: Zap,      label: 'Study Sessions',  value: overview?.stats.sprints_completed   ?? 0, color: '#F59E0B' },
                { icon: BookOpen, label: 'Flashcards',      value: overview?.stats.sr_cards_total      ?? 0, color: '#10B981' },
                { icon: Star,     label: 'XP This Week',    value: overview?.stats.xp_earned           ?? 0, color: '#5B6AF5' },
                { icon: Target,   label: 'Challenges',      value: overview?.stats.challenges_attempted ?? 0, color: '#EC4899' },
              ].map(({ icon: Icon, label, value, color }, i) => (
                <div key={label} className="px-4 py-4 flex items-center gap-3"
                  style={{
                    borderRight:  i % 2 === 0 ? '1px solid rgba(255,255,255,0.06)' : undefined,
                    borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.06)' : undefined,
                  }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${color}18` }}>
                    <Icon size={18} style={{ color }} strokeWidth={1.75} />
                  </div>
                  <div>
                    <p className="font-heading font-bold text-white text-base leading-none">{value}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* ── Mastery Rings ─────────────────────────────────────────────── */}
        {!statsLoading && masteryEntries.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="rounded-3xl p-4"
            style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="font-semibold text-white text-sm mb-3">Subject Mastery</p>
            <div className="flex flex-wrap gap-4 justify-center">
              {masteryEntries.map(([sub, { mastered, total }]) => (
                <MasteryRing key={sub} subject={sub} mastered={mastered} total={total} />
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Report Section ────────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>

          {generating ? (
            /* Generating skeleton */
            <div className="rounded-3xl p-5"
              style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
                  <BookOpen size={18} className="text-white" />
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">Novo is writing your report</p>
                  <p className="text-xs flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    This takes a few seconds <ThreeDots />
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full mt-1" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>

          ) : report ? (
            /* Report exists */
            <div className="rounded-3xl overflow-hidden"
              style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="px-4 pt-4 pb-3 flex items-center gap-2"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex-1">
                  <p className="font-semibold text-white text-sm">Weekly Report</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock size={10} style={{ color: 'rgba(255,255,255,0.4)' }} />
                    <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      Generated {timeAgo(report.generated_at)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleGenerate}
                  className="flex items-center gap-1 text-[11px] rounded-full px-3 py-1 transition-colors"
                  style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
                  <RefreshCw size={11} /> Regenerate
                </button>
              </div>

              {/* Narrative preview */}
              <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-xs leading-relaxed line-clamp-4" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  {report.report_data?.narrative
                    ? String(report.report_data.narrative).slice(0, 220) + '…'
                    : 'Tap "View Full Report" to read the full parent summary.'}
                </p>
              </div>

              <div className="flex gap-0">
                <button
                  onClick={() => setShowModal(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold"
                  style={{ color: '#8B9BFA', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                  <Eye size={15} /> View Full Report
                </button>
                <button
                  onClick={handleShare}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold text-white">
                  <Share2 size={15} /> Share
                </button>
              </div>
            </div>

          ) : (
            /* No report yet */
            <div className="rounded-3xl p-5"
              style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(91,106,245,0.12)', border: '1px solid rgba(91,106,245,0.25)' }}>
                  <BarChart2 size={22} style={{ color: '#8B9BFA' }} />
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">Generate This Week's Report</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Takes about 10 seconds</p>
                </div>
              </div>
              <p className="text-xs leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Novo writes a plain-English summary of this week's progress for parents — what was studied,
                what improved, and what needs attention.
              </p>
              <button
                onClick={handleGenerate}
                className="w-full py-3 rounded-2xl text-white font-semibold text-sm"
                style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
                Generate Report
              </button>
            </div>
          )}
        </motion.div>

        {/* ── History ───────────────────────────────────────────────────── */}
        {history.length > 1 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="rounded-3xl overflow-hidden"
            style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="px-4 pt-3 pb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="font-semibold text-white text-xs">Past Reports</p>
            </div>
            <div className="px-4 py-3 flex flex-col gap-0">
              {history.map((h, i) => (
                <div key={h.id}
                  className="flex items-center gap-3 py-2.5"
                  style={{ borderBottom: i < history.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(91,106,245,0.12)', border: '1px solid rgba(91,106,245,0.2)' }}>
                    <FileText size={14} style={{ color: '#8B9BFA' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white">
                      Week of {formatWeek(h.week_start)}
                    </p>
                    <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{timeAgo(h.generated_at)}</p>
                  </div>
                  <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.4)' }} className="shrink-0" />
                </div>
              ))}
            </div>
          </motion.div>
        )}

        <div className="h-6" />
      </div>

      {/* ── Full Report Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showModal && report && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col"
            style={{ background: '#0A0F25' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}>

            {/* Modal header */}
            <div className="flex items-center gap-3 px-4 py-3 shrink-0"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.10)', background: 'rgba(8,6,20,0.82)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
              <div className="flex-1">
                <p className="font-semibold text-white text-sm">Weekly Parent Report</p>
                <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Week of {formatWeek(report.week_start)}
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-white"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <X size={16} />
              </button>
            </div>

            {/* iframe */}
            <div className="flex-1 overflow-hidden">
              <iframe
                srcDoc={report.report_html}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="Parent Report"
              />
            </div>

            {/* Modal footer */}
            <div className="px-4 py-4 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button
                onClick={handleShare}
                className="w-full py-3 rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
                <Share2 size={16} /> Share Report
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
