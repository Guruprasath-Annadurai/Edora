import { motion, AnimatePresence } from 'framer-motion';
import { Zap } from 'lucide-react';

interface SmartReplyChipsProps {
  suggestions: string[];
  onSelect:    (text: string) => void;
  loading:     boolean;
}

export function SmartReplyChips({ suggestions, onSelect, loading }: SmartReplyChipsProps) {
  return (
    <AnimatePresence>
      {/* Loading shimmer */}
      {loading && (
        <motion.div
          key="loading"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="flex items-center gap-2 px-4 pb-1"
        >
          <Zap size={12} className="text-primary shrink-0" />
          {[80, 64, 96].map((w, i) => (
            <div
              key={i}
              className="h-8 rounded-full animate-pulse bg-secondary"
              style={{ width: w }}
            />
          ))}
        </motion.div>
      )}

      {/* Suggestion chips */}
      {!loading && suggestions.length > 0 && (
        <motion.div
          key="chips"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-2 px-4 pb-1 overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          <Zap size={12} className="text-primary shrink-0" />
          {suggestions.map((text, i) => (
            <motion.button
              key={text}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => onSelect(text)}
              className="shrink-0 h-8 px-3 rounded-full text-xs font-medium whitespace-nowrap
                         transition-all active:scale-95 border"
              style={{
                background: 'rgba(124,58,237,0.12)',
                borderColor: 'rgba(124,58,237,0.35)',
                color: '#a78bfa',
              }}
            >
              {text}
            </motion.button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
