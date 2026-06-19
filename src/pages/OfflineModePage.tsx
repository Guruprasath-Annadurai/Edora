// ═══════════════════════════════════════════════════════════════════════════
// OfflineModePage — Full Offline Mode Hub
// Route: /offline-mode
//
// Surfaces the existing offline infrastructure (SW + IndexedDB + SyncQueue)
// into a user-facing management page:
//   • View what's currently cached per subject
//   • Download content for each subject (quiz questions, flashcard decks)
//   • See storage usage and last-sync time
//   • Clear cache
//   • Feature availability matrix (what works offline)
//
// The actual caching machinery lives in lib/offlineCache.ts and lib/syncQueue.ts
// — this page is the UX layer on top.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Wifi, WifiOff, Download, CheckCircle2,
  Loader2, Trash2, RefreshCw, Zap, BookOpen,
  MessageCircle, Brain, AlertCircle, HardDrive,
  FlaskConical, Hash, Atom,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { supabase } from '@/lib/supabase';
import { OfflineCache } from '@/lib/offlineCache';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubjectCacheStatus {
  subject:         string;
  quizCount:       number;
  flashcardCount:  number;
  lastCached:      number | null;
  downloading:     boolean;
  error:           string | null;
}

interface OfflineFeature {
  label:       string;
  description: string;
  available:   boolean;
  icon:        React.FC<{ className?: string }>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];

const SUBJECT_META: Record<string, { icon: React.FC<{ className?: string; style?: React.CSSProperties }>; color: string }> = {
  Physics:     { icon: Atom,         color: '#5B6AF5' },
  Chemistry:   { icon: FlaskConical, color: '#10B981' },
  Mathematics: { icon: Hash,         color: '#F59E0B' },
  Biology:     { icon: Brain,        color: '#EC4899' },
};

// Questions to pre-fetch per subject
const PREFETCH_TOPICS: Record<string, string[]> = {
  Physics:     ['Mechanics', 'Electrostatics', 'Optics', 'Thermodynamics', 'Modern Physics'],
  Chemistry:   ['Chemical Bonding', 'Equilibrium', 'Organic Chemistry', 'Electrochemistry', 'Coordination'],
  Mathematics: ['Calculus', 'Algebra', 'Trigonometry', 'Coordinate Geometry', 'Probability'],
  Biology:     ['Cell Biology', 'Genetics', 'Ecology', 'Human Physiology', 'Plant Biology'],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ts: number | null): string {
  if (!ts) return 'Never';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function OfflineModePage() {
  const { user } = useAuth();
  const { isOnline, queueSize, isSyncing, flush } = useOfflineSync();

  const [subjectStatus, setSubjectStatus] = useState<SubjectCacheStatus[]>(
    SUBJECTS.map((s) => ({
      subject: s, quizCount: 0, flashcardCount: 0,
      lastCached: null, downloading: false, error: null,
    }))
  );

  const [storageInfo, setStorageInfo]   = useState<{ used: number; quota: number } | null>(null);
  const [clearing, setClearing]         = useState(false);
  const [swRegistered, setSwRegistered] = useState(false);
  const [downloadAllBusy, setDownloadAllBusy] = useState(false);

  // ── Load cache status ─────────────────────────────────────────────────────
  const refreshStatus = useCallback(async () => {
    if (!user) return;

    const updated = await Promise.all(
      SUBJECTS.map(async (subject) => {
        const decks = await OfflineCache.getAllFlashcardDecks();
        const subjectDecks = decks.filter((d) => d.subject === subject);
        const flashcardCount = subjectDecks.reduce((sum, d) => sum + (d.cards?.length ?? 0), 0);

        // Count cached quiz questions for any topic in this subject
        const topics = PREFETCH_TOPICS[subject] ?? [];
        let quizCount = 0;
        let lastCached: number | null = null;
        for (const topic of topics) {
          const qs = await OfflineCache.getQuizQuestions(topic, 100);
          quizCount += qs.length;
          if (qs.length > 0) {
            const latest = Math.max(...qs.map((q) => q.cached_at));
            if (!lastCached || latest > lastCached) lastCached = latest;
          }
        }

        return {
          subject, quizCount, flashcardCount, lastCached,
          downloading: false, error: null,
        };
      })
    );

    setSubjectStatus(updated);

    // Storage estimate
    if ('storage' in navigator && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      setStorageInfo({ used: est.usage ?? 0, quota: est.quota ?? 0 });
    }
  }, [user]);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  // ── Check SW registration ─────────────────────────────────────────────────
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        setSwRegistered(regs.length > 0);
      }).catch(() => {});
    }
  }, []);

  // ── Download subject content ──────────────────────────────────────────────
  const downloadSubject = useCallback(async (subject: string) => {
    if (!user) return;

    setSubjectStatus((prev) =>
      prev.map((s) => s.subject === subject ? { ...s, downloading: true, error: null } : s)
    );

    try {
      const topics = PREFETCH_TOPICS[subject] ?? [];

      // Fetch and cache quiz questions from each topic
      for (const topic of topics) {
        const { data } = await supabase
          .from('topic_stats')
          .select('subject, topic')
          .eq('subject', subject)
          .eq('topic', topic)
          .limit(1);

        // Fetch quiz questions for this topic via AI quiz bank (cached endpoint)
        const { data: questions } = await supabase
          .from('quiz_questions')
          .select('id, topic, subject, question, options, correct_idx, explanation, difficulty')
          .eq('subject', subject)
          .eq('topic', topic)
          .limit(20);

        if (questions && questions.length > 0) {
          await OfflineCache.cacheQuizQuestions(
            topic,
            questions.map((q) => ({
              id:           q.id,
              topic:        q.topic ?? topic,
              subject:      q.subject ?? subject,
              question:     q.question,
              options:      q.options ?? [],
              correct_idx:  q.correct_idx ?? 0,
              explanation:  q.explanation ?? '',
              difficulty:   q.difficulty ?? 2,
            }))
          );
        }

        // Small delay between topics to avoid hammering DB
        await new Promise((r) => setTimeout(r, 100));

        void data; // unused but satisfies lint
      }

      // Fetch and cache flashcard decks
      const { data: cards } = await supabase
        .from('flashcards')
        .select('id, subject, topic, front, back, due_at')
        .eq('user_id', user.id)
        .eq('subject', subject)
        .limit(100);

      if (cards && cards.length > 0) {
        await OfflineCache.cacheFlashcardDeck({
          id:      `${subject}_${user.id}`,
          subject,
          topic:   subject,
          cards:   cards.map((c) => ({ front: c.front, back: c.back, due_at: c.due_at ?? new Date().toISOString() })),
        });
      }

      setSubjectStatus((prev) =>
        prev.map((s) => s.subject === subject ? { ...s, downloading: false, error: null } : s)
      );

      // Refresh counts after download
      await refreshStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      setSubjectStatus((prev) =>
        prev.map((s) => s.subject === subject ? { ...s, downloading: false, error: msg } : s)
      );
    }
  }, [user, refreshStatus]);

  // ── Download all subjects ─────────────────────────────────────────────────
  const downloadAll = async () => {
    setDownloadAllBusy(true);
    for (const subject of SUBJECTS) {
      await downloadSubject(subject);
    }
    setDownloadAllBusy(false);
  };

  // ── Clear all caches ──────────────────────────────────────────────────────
  const clearAll = async () => {
    setClearing(true);
    await OfflineCache.clearExpired();

    // Also clear SW caches
    if ('caches' in window) {
      const keys = await caches.keys().catch(() => [] as string[]);
      await Promise.all(keys.map((k) => caches.delete(k)));
    }

    await refreshStatus();
    setClearing(false);
  };

  // ── Feature matrix ────────────────────────────────────────────────────────
  const features: OfflineFeature[] = [
    { label: 'Flashcard Review',  description: 'Review downloaded decks',      available: true,  icon: Zap },
    { label: 'Quiz Practice',     description: 'Attempt cached questions',      available: true,  icon: Brain },
    { label: 'Study Notes',       description: 'Read + edit saved notes',       available: true,  icon: BookOpen },
    { label: 'AI Chat (Novo)',    description: 'Requires internet connection',   available: false, icon: MessageCircle },
    { label: 'Boss Fights',       description: 'Requires internet connection',  available: false, icon: Zap },
    { label: 'Live Study Rooms',  description: 'Requires internet connection',  available: false, icon: MessageCircle },
  ];

  const totalCached = subjectStatus.reduce((s, st) => s + st.quizCount + st.flashcardCount, 0);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0A0A0F]/90 backdrop-blur border-b border-white/5 px-4 py-3 flex items-center gap-3">
        <Link to="/home" className="p-2 rounded-xl hover:bg-white/5 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div className="flex-1">
          <h1 className="font-bold text-white">Offline Mode</h1>
          <p className="text-xs text-gray-400">Study without internet</p>
        </div>
        <button onClick={refreshStatus} className="p-2 rounded-xl hover:bg-white/5">
          <RefreshCw className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">

        {/* Connection status */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-center gap-3 p-4 rounded-2xl border ${
            isOnline
              ? 'bg-emerald-900/20 border-emerald-500/20'
              : 'bg-amber-900/20 border-amber-500/20'
          }`}
        >
          {isOnline
            ? <Wifi className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            : <WifiOff className="w-5 h-5 text-amber-400 flex-shrink-0" />
          }
          <div className="flex-1">
            <div className={`font-semibold text-sm ${isOnline ? 'text-emerald-300' : 'text-amber-300'}`}>
              {isOnline ? 'You\'re online' : 'Offline mode active'}
            </div>
            <div className="text-xs text-gray-400">
              {isOnline
                ? `${totalCached} items cached for offline use`
                : `Using ${totalCached} cached items · ${queueSize} action${queueSize !== 1 ? 's' : ''} will sync`
              }
            </div>
          </div>
          {isOnline && queueSize > 0 && (
            <button
              onClick={flush}
              disabled={isSyncing}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 text-xs font-medium flex items-center gap-1.5"
            >
              {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Sync {queueSize}
            </button>
          )}
        </motion.div>

        {/* SW status */}
        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl ${
          swRegistered ? 'bg-emerald-900/15 text-emerald-400' : 'bg-amber-900/15 text-amber-400'
        }`}>
          {swRegistered
            ? <><CheckCircle2 className="w-3.5 h-3.5" /> App shell cached — loads offline</>
            : <><AlertCircle className="w-3.5 h-3.5" /> Service worker not registered</>
          }
        </div>

        {/* Storage usage */}
        {storageInfo && storageInfo.quota > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-4 rounded-2xl bg-white/5 border border-white/8 space-y-2"
          >
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-white font-medium">
                <HardDrive className="w-4 h-4 text-indigo-400" /> Storage Usage
              </div>
              <span className="text-gray-400 text-xs">
                {formatBytes(storageInfo.used)} / {formatBytes(storageInfo.quota)}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-indigo-500"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (storageInfo.used / storageInfo.quota) * 100)}%` }}
                transition={{ duration: 0.8 }}
              />
            </div>
          </motion.div>
        )}

        {/* Download all */}
        {isOnline && (
          <button
            onClick={downloadAll}
            disabled={downloadAllBusy}
            className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          >
            {downloadAllBusy
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Downloading all subjects…</>
              : <><Download className="w-4 h-4" /> Download All Subjects</>
            }
          </button>
        )}

        {/* Per-subject cache */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Subject Cache</p>
          <div className="space-y-3">
            {subjectStatus.map((status, i) => {
              const meta   = SUBJECT_META[status.subject];
              const Icon   = meta?.icon ?? Brain;
              const color  = meta?.color ?? '#6B7280';
              const isCached = status.quizCount > 0 || status.flashcardCount > 0;

              return (
                <motion.div
                  key={status.subject}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.05 }}
                  className="p-4 rounded-2xl bg-white/5 border border-white/8 space-y-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${color}20` }}
                    >
                      <Icon className="w-5 h-5" style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white">{status.subject}</div>
                      <div className="text-xs text-gray-500">
                        {status.quizCount} questions · {status.flashcardCount} flashcards
                        {status.lastCached && ` · Updated ${formatTime(status.lastCached)}`}
                      </div>
                    </div>

                    {isOnline ? (
                      <button
                        onClick={() => downloadSubject(status.subject)}
                        disabled={status.downloading}
                        className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                          isCached
                            ? 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10'
                            : 'text-white'
                        }`}
                        style={!isCached ? { background: `${color}30`, border: `1px solid ${color}40` } : {}}
                      >
                        {status.downloading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : isCached ? (
                          <><RefreshCw className="w-3.5 h-3.5" /> Update</>
                        ) : (
                          <><Download className="w-3.5 h-3.5" /> Download</>
                        )}
                      </button>
                    ) : (
                      isCached
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                        : <WifiOff className="w-4 h-4 text-gray-600 flex-shrink-0" />
                    )}
                  </div>

                  {/* Download progress bar */}
                  <AnimatePresence>
                    {status.downloading && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ background: color }}
                            animate={{ width: ['10%', '90%'] }}
                            transition={{ duration: 8, ease: 'easeInOut' }}
                          />
                        </div>
                        <p className="text-[10px] text-gray-500 mt-1">Caching {PREFETCH_TOPICS[status.subject]?.length ?? 5} topics…</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Error */}
                  {status.error && (
                    <div className="flex items-center gap-1.5 text-xs text-red-400">
                      <AlertCircle className="w-3 h-3" /> {status.error}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Feature availability */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="p-4 rounded-2xl bg-white/5 border border-white/8 space-y-3"
        >
          <p className="text-sm font-semibold text-white">What works offline</p>
          <div className="space-y-2">
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  f.available ? 'bg-emerald-900/40' : 'bg-white/5'
                }`}>
                  <f.icon className={`w-3.5 h-3.5 ${f.available ? 'text-emerald-400' : 'text-gray-600'}`} />
                </div>
                <div className="flex-1">
                  <div className={`text-xs font-medium ${f.available ? 'text-white' : 'text-gray-500'}`}>{f.label}</div>
                  <div className="text-[10px] text-gray-600">{f.description}</div>
                </div>
                {f.available
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  : <WifiOff className="w-3.5 h-3.5 text-gray-700 flex-shrink-0" />
                }
              </div>
            ))}
          </div>
        </motion.div>

        {/* Clear cache */}
        <button
          onClick={clearAll}
          disabled={clearing || totalCached === 0}
          className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-red-900/20 hover:border-red-500/30 disabled:opacity-40 text-sm text-gray-400 hover:text-red-400 transition-all flex items-center justify-center gap-2"
        >
          {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          {clearing ? 'Clearing…' : 'Clear All Cached Data'}
        </button>

        <div className="pb-6" />
      </div>
    </div>
  );
}
