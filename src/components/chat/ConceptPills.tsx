// Concept chain pills — shown below Novo responses
// Tapping a pill sends "Tell me more about <concept>" into the chat

import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

interface Props {
  concepts: string[];
  onTap: (concept: string) => void;
}

export function ConceptPills({ concepts, onTap }: Props) {
  if (!concepts.length) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}
    >
      <span style={{ fontSize: 12, color: 'var(--ink-300)', fontWeight: 600, alignSelf: 'center', letterSpacing: 0.5 }}>
        EXPLORE →
      </span>
      {concepts.map((c) => (
        <motion.button
          key={c}
          whileTap={{ scale: 0.94 }}
          onClick={() => onTap(c)}
          style={{
            padding: '5px 12px',
            borderRadius: 20,
            border: '1px solid rgba(91,106,245,0.35)',
            background: 'rgba(91,106,245,0.1)',
            color: '#A0AEFF',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.15s',
          }}
        >
          {c}
          <ArrowRight size={10} />
        </motion.button>
      ))}
    </motion.div>
  );
}
