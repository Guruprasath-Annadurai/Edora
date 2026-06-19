// ─────────────────────────────────────────────────────────────────────────────
// ConnectionGuard — offline banner (non-blocking) + sync queue flush on reconnect
//
// Design: show a sticky top banner when offline so the app remains usable.
// Cached content (quiz questions, flashcards) still works offline.
// Queued actions sync automatically when connection is restored.
// ─────────────────────────────────────────────────────────────────────────────

import { AnimatePresence, motion } from 'framer-motion';
import { WifiOff, RefreshCw, CheckCircle } from 'lucide-react';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useState, useEffect } from 'react';

export function ConnectionGuard({ children }: { children: React.ReactNode }) {
  const { isOnline, queueSize, isSyncing, lastSyncAt } = useOfflineSync();
  const [showSyncedToast, setShowSyncedToast] = useState(false);
  const prevOnline = usePrevious(isOnline);

  // Show "Synced!" toast briefly after coming back online and flushing
  useEffect(() => {
    if (!prevOnline && isOnline && queueSize === 0 && lastSyncAt) {
      setShowSyncedToast(true);
      const t = setTimeout(() => setShowSyncedToast(false), 3000);
      return () => clearTimeout(t);
    }
  }, [isOnline, queueSize, lastSyncAt]);

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
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="fixed top-0 left-0 right-0 z-[8500] flex items-center justify-center gap-2 px-4 py-2.5"
            style={{ background: '#1E293B', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
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

      {/* ── Synced toast ── */}
      <AnimatePresence>
        {showSyncedToast && (
          <motion.div
            key="synced-toast"
            initial={{ y: -48, opacity: 0 }}
            animate={{ y: 0,   opacity: 1 }}
            exit={{    y: -48, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="fixed top-0 left-0 right-0 z-[8500] flex items-center justify-center gap-2 px-4 py-2.5"
            style={{ background: '#065F46' }}
            role="status"
            aria-live="polite"
          >
            <CheckCircle size={14} className="text-emerald-300 shrink-0" />
            <span className="text-xs font-medium text-white">
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
