// Teacher broadcast overlay — renders above page content when teacher sends a message
import { AnimatePresence, motion } from 'framer-motion';
import { X, Megaphone, AlertTriangle, Zap } from 'lucide-react';
import type { TeacherBroadcastMessage } from '@/hooks/useRealtime';

interface Props {
  message: TeacherBroadcastMessage | null;
  onDismiss: () => void;
}

const TYPE_CONFIG = {
  info:       { icon: Megaphone,      bg: '#EEF2FF', border: '#818CF8', text: '#3730A3', accent: '#6366F1' },
  warning:    { icon: AlertTriangle,  bg: '#FFF7ED', border: '#FB923C', text: '#9A3412', accent: '#F97316' },
  quiz_start: { icon: Zap,            bg: '#ECFDF5', border: '#34D399', text: '#065F46', accent: '#10B981' },
};

export function TeacherBroadcastBanner({ message, onDismiss }: Props) {
  if (!message) return null;
  const cfg = TYPE_CONFIG[message.type] ?? TYPE_CONFIG.info;
  const Icon = cfg.icon;

  return (
    <AnimatePresence>
      <motion.div
        key={message.id}
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0,   opacity: 1 }}
        exit={{    y: -80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="fixed top-0 left-0 right-0 z-[9000] mx-3 mt-3"
      >
        <div
          className="rounded-2xl p-4 flex items-start gap-3 shadow-lg"
          style={{ background: cfg.bg, border: `1.5px solid ${cfg.border}` }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${cfg.accent}20` }}
          >
            <Icon size={18} style={{ color: cfg.accent }} strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold mb-0.5" style={{ color: cfg.accent }}>
              {message.from_name}
            </p>
            <p className="text-sm font-medium leading-snug" style={{ color: cfg.text }}>
              {message.message}
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="shrink-0 p-1 rounded-lg active:scale-90 transition-transform"
            style={{ color: cfg.text }}
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
