import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  /** Accent color for the icon halo — defaults to indigo */
  iconColor?: string;
  iconBg?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Extra content below the action button */
  children?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  iconColor = '#A0AEFF',
  iconBg = 'rgba(91,106,245,0.12)',
  title,
  subtitle,
  actionLabel,
  onAction,
  children,
  className = '',
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
      className={`flex flex-col items-center justify-center text-center px-6 py-10 gap-4 ${className}`}
    >
      {/* Icon halo */}
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3.5, ease: 'easeInOut', repeat: Infinity }}
        className="relative flex items-center justify-center"
      >
        {/* Ambient glow ring */}
        <div
          className="absolute rounded-full"
          style={{
            width: 80, height: 80,
            background: `radial-gradient(circle, ${iconBg.replace('0.12', '0.20')}, transparent 70%)`,
            filter: 'blur(8px)',
          }}
        />
        <div
          className="relative w-16 h-16 rounded-3xl flex items-center justify-center"
          style={{
            background: iconBg,
            border: `1px solid ${iconColor}30`,
            boxShadow: `0 8px 24px ${iconColor}18`,
          }}
        >
          <Icon size={28} style={{ color: iconColor }} strokeWidth={1.75} />
        </div>
      </motion.div>

      {/* Text */}
      <div className="flex flex-col gap-1.5 max-w-[260px]">
        <h3 className="font-heading text-lg font-bold" style={{ color: 'var(--ink-880)' }}>
          {title}
        </h3>
        {subtitle && (
          <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-450)' }}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Primary action */}
      {actionLabel && onAction && (
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onAction}
          className="px-6 py-3 rounded-2xl text-sm font-bold text-white"
          style={{
            background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)',
            boxShadow: '0 6px 24px rgba(91,106,245,0.40)',
          }}
        >
          {actionLabel}
        </motion.button>
      )}

      {children}
    </motion.div>
  );
}
