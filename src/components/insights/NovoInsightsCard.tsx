// ═══════════════════════════════════════════════════════════════
// NovoInsightsCard — compact homepage card for weekly AI report
// Shows when a fresh report exists for the current ISO week.
// Dismissable per week (stored in localStorage).
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, TrendingUp, TrendingDown, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { storage } from '@/lib/storage';

// ── Types ─────────────────────────────────────────────────────────────────────
interface WeakSubject  { subject: string; score_pct: number }
interface StrongSubject { subject: string; score_pct: number }

interface NovoInsight {
  id: string;
  week_start: string;
  headline: string;
  weakest_subjects: WeakSubject[];
  strongest_subjects: StrongSubject[];
  xp_this_week: number;
  quizzes_taken: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
/** ISO Monday of the current UTC week */
function currentWeekStart(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  return monday.toISOString().slice(0, 10);
}

function dismissKey(weekStart: string) {
  return `novo_insights_dismissed_${weekStart}`;
}

function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00Z');
  const end   = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function NovoInsightsCard() {
  const { user } = useAuth();
  const [insight,   setInsight]   = useState<NovoInsight | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading,   setLoading]   = useState(true);

  const weekStart = currentWeekStart();

  // Check dismissed state + prune keys older than 60 days (runs once per mount)
  useEffect(() => {
    const key = dismissKey(weekStart);
    setDismissed(storage.getItem(key) === '1');

    // Prune stale dismissal keys so localStorage doesn't grow unbounded (52 keys/year otherwise)
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 60);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      for (let i = storage.length - 1; i >= 0; i--) {
        const k = storage.key(i);
        if (k?.startsWith('novo_insights_dismissed_')) {
          const dateStr = k.slice('novo_insights_dismissed_'.length);
          if (dateStr < cutoffStr) storage.removeItem(k);
        }
      }
    } catch { /* storage unavailable */ }
  }, [weekStart]);

  // Fetch insight for current week
  useEffect(() => {
    if (!user || dismissed) { setLoading(false); return; }

    supabase
      .from('novo_insights')
      .select('id, week_start, headline, weakest_subjects, strongest_subjects, xp_this_week, quizzes_taken')
      .eq('user_id', user.id)
      .eq('week_start', weekStart)
      .maybeSingle()
      .then(({ data }) => {
        setInsight(data as NovoInsight | null);
        setLoading(false);
      });
  }, [user, weekStart, dismissed]);

  function handleDismiss(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    storage.setItem(dismissKey(weekStart), '1');
    setDismissed(true);
  }

  // Don't render if: loading, dismissed, or no insight yet
  if (loading || dismissed || !insight) return null;

  const weak   = insight.weakest_subjects?.slice(0, 2) ?? [];
  const strong = insight.strongest_subjects?.slice(0, 1) ?? [];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0,  scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}>

        <Link to="/novo-insights" className="block active:scale-[0.98] transition-transform">
          <div className="rounded-3xl overflow-hidden relative"
            style={{
              background: 'linear-gradient(135deg, #1A1144 0%, #2D1B7E 45%, #3B1FA0 100%)',
              boxShadow: '0 8px 32px rgba(45,27,126,0.35)',
            }}>

            {/* Subtle star pattern overlay */}
            <div className="absolute inset-0 opacity-10"
              style={{
                backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.15) 0%, transparent 60%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.1) 0%, transparent 50%)',
              }} />

            <div className="relative px-4 py-4">
              {/* Header row */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <Sparkles size={13} className="text-yellow-300" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-yellow-300">
                    Novo Insights
                  </span>
                  <span className="text-[10px] text-purple-300 ml-1">
                    {formatWeekRange(insight.week_start)}
                  </span>
                </div>
                <button
                  onClick={handleDismiss}
                  aria-label="Dismiss"
                  className="flex items-center justify-center -mr-1 -my-1"
                  style={{ width: 44, height: 44 }}>
                  <span className="w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.12)' }}>
                    <X size={12} className="text-white/70" />
                  </span>
                </button>
              </div>

              {/* Headline */}
              <p className="text-white font-bold text-[15px] leading-snug mb-3.5">
                {insight.headline}
              </p>

              {/* Subject pills row */}
              <div className="flex flex-wrap gap-2 mb-4">
                {weak.map(s => (
                  <div key={s.subject} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                    style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)' }}>
                    <TrendingDown size={11} className="text-red-300" />
                    <span className="text-[11px] font-semibold text-red-200">{s.subject}</span>
                    <span className="text-[11px] text-red-300/70">{s.score_pct}%</span>
                  </div>
                ))}
                {strong.map(s => (
                  <div key={s.subject} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                    style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.3)' }}>
                    <TrendingUp size={11} className="text-emerald-300" />
                    <span className="text-[11px] font-semibold text-emerald-200">{s.subject}</span>
                    <span className="text-[11px] text-emerald-300/70">{s.score_pct}%</span>
                  </div>
                ))}
                {/* XP pill */}
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                  style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.25)' }}>
                  <span className="text-[11px] font-semibold text-yellow-300">+{insight.xp_this_week} XP</span>
                </div>
              </div>

              {/* CTA */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-purple-300">
                  {insight.quizzes_taken} quiz{insight.quizzes_taken !== 1 ? 'zes' : ''} this week
                </span>
                <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.12)' }}>
                  <span className="text-[11px] font-bold text-white">View full report</span>
                  <ChevronRight size={13} className="text-white/80" />
                </div>
              </div>
            </div>
          </div>
        </Link>
      </motion.div>
    </AnimatePresence>
  );
}
