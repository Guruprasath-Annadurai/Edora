// ─────────────────────────────────────────────────────────────────────────────
// ConnectionGuard — offline banner (non-blocking) + sync queue flush on reconnect
//
// Design: show a sticky top banner when offline so the app remains usable.
// Cached content (quiz questions, flashcards) still works offline.
// Queued actions sync automatically when connection is restored.
// ─────────────────────────────────────────────────────────────────────────────

import { AnimatePresence, motion } from 'framer-motion';
import { spring } from '@/lib/motion';
import { WifiOff, RefreshCw, CheckCircle, Download, X } from 'lucide-react';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useState, useEffect } from 'react';
import { autoWakeIfReady, initOfflineModel, isModelReady } from '@/lib/offlineModel';

const OFFLINE_NUDGE_KEY = 'edora_offline_nudge_dismissed';

export function ConnectionGuard({ children }: { children: React.ReactNode }) {
  const { isOnline, queueSize, isSyncing, lastSyncAt } = useOfflineSync();
  const [showSyncedToast, setShowSyncedToast]   = useState(false);
  const [showDownloadNudge, setShowDownloadNudge] = useState(false);
  const [downloading, setDownloading]             = useState(false);
  const prevOnline = usePrevious(isOnline);

  // Auto-wake worker when going offline (model already downloaded)
  useEffect(() => {
    if (!isOnline) {
      autoWakeIfReady();
      // First-time nudge: show download prompt if model not yet downloaded
      if (!isModelReady() && !localStorage.getItem(OFFLINE_NUDGE_KEY)) {
        const t = setTimeout(() => setShowDownloadNudge(true), 1200);
        return () => clearTimeout(t);
      }
    }
  }, [isOnline]);

  // Show "Synced!" toast briefly after coming back online and flushing
  useEffect(() => {
    if (!prevOnline && isOnline && queueSize === 0 && lastSyncAt) {
      setShowSyncedToast(true);
      const t = setTimeout(() => setShowSyncedToast(false), 3000);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, queueSize, lastSyncAt]);

  async function handleDownloadOfflineAI() {
    setDownloading(true);
    try {
      await initOfflineModel();
      localStorage.setItem(OFFLINE_NUDGE_KEY, '1');
      setShowDownloadNudge(false);
    } catch {
      // silently ignore — user can retry from Offline Mode page
    } finally {
      setDownloading(false);
    }
  }

  function dismissNudge() {
    localStorage.setItem(OFFLINE_NUDGE_KEY, '1');
    setShowDownloadNudge(false);
  }

  return (
    <>
      {children}

      {/* ── Offline banner ── */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            key="offline-banner"
            initial={{ y: -48, opacity: 0 }}
            animate={{ y: 0,   opacity: 1 }}
            exit={{    y: -48, opacity: 0 }}
            transition={spring.snappy}
            className="fixed top-0 left-0 right-0 z-[8500] flex items-center justify-center gap-2 px-4 py-2.5"
            style={{ background: 'var(--surface-banner-1)', borderBottom: '1px solid var(--ink-080)' }}
            role="status"
            aria-live="polite"
          >
            <WifiOff size={14} className="text-amber-400 shrink-0" strokeWidth={2} />
            <span className="text-xs font-medium text-white">
              Practicing offline
              {queueSize > 0 && (
                <span className="text-amber-300 ml-1">· {queueSize} action{queueSize !== 1 ? 's' : ''} will sync</span>
              )}
            </span>
            {isSyncing && (
              <RefreshCw size={12} className="text-amber-400 animate-spin ml-1" />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Offline AI download nudge ── */}
      <AnimatePresence>
        {showDownloadNudge && !isOnline && (
          <motion.div
            key="offline-nudge"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0,  opacity: 1 }}
            exit={{    y: 80, opacity: 0 }}
            transition={spring.snappy}
            className="fixed bottom-24 left-4 right-4 z-[8400] rounded-2xl px-4 py-3 flex items-center gap-3"
            style={{ background: 'var(--surface-banner-2)', border: '1px solid rgba(91,106,245,0.35)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(91,106,245,0.2)' }}>
              <Download size={16} className="text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white leading-tight">Download Novo AI offline (~80 MB)</p>
              <p className="text-xs text-white/45 mt-0.5">Works without internet once downloaded</p>
            </div>
            {downloading
              ? <div className="w-5 h-5 rounded-full border-2 border-indigo-400/30 border-t-indigo-400 animate-spin shrink-0" />
              : (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={handleDownloadOfflineAI}
                    className="text-xs font-bold px-3 py-1.5 rounded-xl active:scale-90 transition-transform"
                    style={{ background: 'rgba(91,106,245,0.3)', color: '#A5B4FC' }}
                  >
                    Download
                  </button>
                  <button onClick={dismissNudge} className="p-1 active:scale-90 transition-transform">
                    <X size={14} className="text-white/30" />
                  </button>
                </div>
              )
            }
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Synced toast ── */}
      <AnimatePresence>
        {showSyncedToast && (
          <motion.div
            key="synced-toast"
            initial={{ y: -48, opacity: 0 }}
            animate={{ y: 0,   opacity: 1 }}
            exit={{    y: -48, opacity: 0 }}
            transition={spring.snappy}
            className="fixed top-0 left-0 right-0 z-[8500] flex items-center justify-center gap-2 px-4 py-2.5"
            style={{ background: '#065F46' }}
            role="status"
            aria-live="polite"
          >
            <CheckCircle size={14} className="text-emerald-300 shrink-0" />
            <span className="text-xs font-medium" style={{ color: '#FFFFFF' }}>
              Back online — your progress has synced!
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// Tiny helper — avoids adding a library for a one-liner
function usePrevious<T>(value: T): T | undefined {
  const [prev, setPrev] = useState<T | undefined>(undefined);
  useEffect(() => { setPrev(value); }, [value]);
  return prev;
}
