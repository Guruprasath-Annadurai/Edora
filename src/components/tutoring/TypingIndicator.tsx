import { motion } from 'framer-motion';
import { NovoAvatar } from '@/components/tutoring/NovoAvatar';

export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex items-end gap-2">
      <NovoAvatar size={32} />
      <div className="px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1 items-center"
        style={{ background: 'var(--hdr-b-900)', border: '1px solid var(--ink-080)' }}>
        {[0, 0.15, 0.3].map((delay, i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-primary"
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 0.55, repeat: Infinity, delay }}
          />
        ))}
      </div>
    </motion.div>
  );
}
