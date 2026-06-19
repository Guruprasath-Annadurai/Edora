// ─────────────────────────────────────────────────────────────────────────────
// useOfflineSync — monitors network state and flushes the sync queue
// automatically when the device comes back online.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { Network }    from '@capacitor/network';
import { SyncQueue }  from '@/lib/syncQueue';
import { track }      from '@/lib/analytics';

export function useOfflineSync() {
  const [isOnline,   setIsOnline]   = useState(true);
  const [queueSize,  setQueueSize]  = useState(0);
  const [isSyncing,  setIsSyncing]  = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const flushLock  = useRef(false);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flush queue when we come back online
  async function flush() {
    if (flushLock.current || isSyncing) return;
    const size = await SyncQueue.size();
    if (size === 0) return;

    flushLock.current = true;
    setIsSyncing(true);
    try {
      const flushed = await SyncQueue.flush();
      if (flushed > 0) {
        setLastSyncAt(new Date());
        track('offline_sync_flushed', { flushed_count: flushed });
      }
      setQueueSize(await SyncQueue.size());
    } finally {
      setIsSyncing(false);
      flushLock.current = false;
    }
  }

  useEffect(() => {
    // Seed initial network state
    Network.getStatus().then(s => setIsOnline(s.connected));

    const listenerPromise = Network.addListener('networkStatusChange', async (status) => {
      setIsOnline(status.connected);
      if (status.connected) {
        if (flushTimer.current) clearTimeout(flushTimer.current);
        flushTimer.current = setTimeout(flush, 1500);
      }
    });

    // Refresh queue size on mount
    SyncQueue.size().then(setQueueSize);

    return () => {
      listenerPromise.then(l => l.remove()).catch(() => {});
      if (flushTimer.current) clearTimeout(flushTimer.current);
    };
  }, []);

  return { isOnline, queueSize, isSyncing, lastSyncAt, flush };
}
