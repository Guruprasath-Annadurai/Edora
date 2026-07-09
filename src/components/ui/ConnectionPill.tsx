// ConnectionPill — shows WebSocket/Realtime connection status in multiplayer pages.
// Renders nothing when connected (no noise). Only surfaces when degraded.

import { motion, AnimatePresence } from 'framer-motion';
import {spring} from '@/lib/motion';
import {WifiOff, RefreshCw} from 'lucide-react';

export type ConnStatus = 'connected' | 'reconnecting' | 'disconnected';

interface Props {
  status: ConnStatus;
  onRetry?: () => void;
  /** Override default label for reconnecting state */
  reconnectingLabel?: string;
}

export function ConnectionPill({ status, onRetry, reconnectingLabel }: Props) {
  return (
    <AnimatePresence>
      {status !== 'connected' && (
        <motion.div
          key={status}
          initial={{ opacity: 0, y: -6, scale: 0.92 }}
          animate={{ opacity: 1, y: 0,  scale: 1     }}
          exit={{    opacity: 0, y: -6, scale: 0.92   }}
          transition={spring.snappy}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
          style={{
            background: status === 'reconnecting'
              ? 'rgba(251,191,36,0.12)'
              : 'rgba(239,68,68,0.12)',
            border: `1px solid ${status === 'reconnecting' ? 'rgba(251,191,36,0.3)' : 'rgba(239,68,68,0.3)'}`,
            color: status === 'reconnecting' ? '#FBBF24' : '#F87171' }}
        >
          {status === 'reconnecting' ? (
            <>
              <RefreshCw size={11} className="animate-spin" />
              <span>{reconnectingLabel ?? 'Reconnecting…'}</span>
            </>
          ) : (
            <>
              <WifiOff size={11} />
              <span>Disconnected</span>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="ml-1 underline underline-offset-2 active:opacity-70"
                >
                  Retry
                </button>
              )}
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Dot-only variant for tight headers
export function ConnectionDot({ status }: { status: ConnStatus }) {
  const color =
    status === 'connected'    ? '#10B981' :
    status === 'reconnecting' ? '#FBBF24' : '#EF4444';
  return (
    <div
      className="w-2 h-2 rounded-full shrink-0"
      style={{
        background:  color,
        boxShadow:   `0 0 6px ${color}`,
        animation:   status === 'reconnecting' ? 'pulse 1s infinite' : undefined }}
    />
  );
}
