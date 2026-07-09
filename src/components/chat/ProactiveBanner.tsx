import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TeachingIcon } from '@/components/ui/icons';
import type { NovoProactiveMessage } from '@/types';

export function ProactiveBanner({ msg, onDismiss }: {
  msg: NovoProactiveMessage;
  onDismiss: () => void;
}) {
  const navigate = useNavigate();
  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      className="mx-3 mt-2 mb-1 rounded-2xl overflow-hidden shrink-0"
      style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
            <TeachingIcon size={16} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/70 font-semibold mb-0.5">Novo reached out</p>
            <p className="text-sm text-white leading-relaxed">{msg.message}</p>
            {msg.cta_label && msg.cta_route && (
              <button
                onClick={() => { onDismiss(); navigate(msg.cta_route!); }}
                className="mt-2 text-xs font-bold bg-white/20 text-white px-3 py-1.5 rounded-xl active:bg-white/30">
                {msg.cta_label} →
              </button>
            )}
          </div>
          <button onClick={onDismiss} className="text-white/60 mt-0.5 shrink-0">
            <ChevronDown size={16} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
