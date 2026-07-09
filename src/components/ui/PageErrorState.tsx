import { motion } from 'framer-motion';
import { AlertCircle, RefreshCw, WifiOff } from 'lucide-react';

interface PageErrorStateProps {
  message?: string;
  onRetry?: () => void;
  offline?: boolean;
  className?: string;
}

export function PageErrorState({
  message,
  onRetry,
  offline = false,
  className = '',
}: PageErrorStateProps) {
  const Icon   = offline ? WifiOff : AlertCircle;
  const title  = offline ? 'No internet connection' : 'Something went wrong';
  const body   = message ?? (offline
    ? 'Check your connection and try again.'
    : 'We couldn\'t load this page. Please try again.');

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex flex-col items-center justify-center gap-4 px-8 py-16 text-center ${className}`}
    >
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: offline ? 'rgba(251,191,36,0.1)' : 'rgba(239,68,68,0.1)' }}
      >
        <Icon size={22} style={{ color: offline ? '#FBBF24' : '#F87171' }} strokeWidth={1.75} />
      </div>

      <div>
        <h3 className="font-heading font-bold text-white text-base mb-1">{title}</h3>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-450)' }}>{body}</p>
      </div>

      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold text-white active:scale-95 transition-transform"
          style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
        >
          <RefreshCw size={13} />
          Try again
        </button>
      )}
    </motion.div>
  );
}
