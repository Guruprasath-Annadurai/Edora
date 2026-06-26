import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          key="offline-banner"
          initial={{ y: -48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -48, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          className="flex items-center gap-2.5 px-4 py-2.5 shrink-0"
          style={{
            background: 'rgba(239,68,68,0.15)',
            borderBottom: '1px solid rgba(239,68,68,0.25)',
            backdropFilter: 'blur(8px)',
          }}
          role="alert"
        >
          <WifiOff size={13} style={{ color: '#F87171', flexShrink: 0 }} />
          <p className="text-xs font-semibold" style={{ color: '#F87171' }}>
            No internet connection
            <span className="font-normal" style={{ color: 'rgba(248,113,113,0.7)' }}>
              {' '}· Some features may be unavailable
            </span>
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
