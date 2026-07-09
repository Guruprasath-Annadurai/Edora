import { motion } from 'framer-motion';
import { PersonalityCards } from '@/components/chat/PersonalityCards';
import type { NovoPersonality } from '@/types';

export function PersonalitySheet({ current, onSelect, onClose }: {
  current: NovoPersonality;
  onSelect: (p: NovoPersonality) => void;
  onClose: () => void;
}) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="w-full rounded-t-3xl p-5 pb-8"
        style={{ background: 'var(--hdr-a-880)', border: '1px solid var(--ink-070)' }}
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: 'var(--ink-150)' }} />
        <p className="font-heading font-bold text-white text-lg mb-4">Novo's Personality</p>
        <PersonalityCards current={current} onSelect={p => { onSelect(p); onClose(); }} />
      </motion.div>
    </motion.div>
  );
}
