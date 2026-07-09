import { motion } from 'framer-motion';
import { PERSONALITIES } from '@/lib/chatHelpers';
import type { NovoPersonality } from '@/types';

const PRIMARY_PERSONALITIES: NovoPersonality[] = ['dominie', 'preceptor'];

export function PersonalityCards({ current, onSelect }: {
  current: NovoPersonality;
  onSelect: (p: NovoPersonality) => void;
}) {
  // Normalise legacy personalities to dominie
  const effectiveCurrent = PRIMARY_PERSONALITIES.includes(current) ? current : 'dominie';
  return (
    <div className="px-4 pt-1 pb-3 shrink-0">
      <div className="flex gap-3 justify-center pb-0.5">
        {PRIMARY_PERSONALITIES.map(key => {
          const cfg = PERSONALITIES[key];
          const active = key === effectiveCurrent;
          return (
            <motion.button
              key={key}
              onClick={() => onSelect(key)}
              whileTap={{ scale: 0.93 }}
              animate={{ scale: active ? 1 : 0.97 }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}
              className="flex-1 flex flex-col items-center gap-2 rounded-3xl transition-all relative overflow-hidden"
              style={{
                paddingTop: 18,
                paddingBottom: 14,
                background: active ? 'rgba(91,106,245,0.15)' : 'var(--ink-045)',
                border: active ? '1.5px solid rgba(91,106,245,0.45)' : '1px solid var(--ink-060)',
                boxShadow: active ? '0 4px 24px rgba(91,106,245,0.28)' : 'none' }}>
              {active && (
                <div className="absolute inset-0 opacity-10 rounded-3xl" style={{ background: cfg.gradient }} />
              )}
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center relative z-10"
                style={{
                  background: active ? cfg.gradient : 'var(--ink-060)',
                  boxShadow: active ? '0 4px 14px rgba(0,0,0,0.35)' : 'none' }}>
                <cfg.icon size={22} className="text-white" strokeWidth={1.75} />
              </div>
              <p className="text-xs font-extrabold relative z-10 text-center leading-tight"
                style={{ color: active ? '#ffffff' : 'var(--ink-500)' }}>
                {cfg.label}
              </p>
              <p className="text-xs font-medium text-center leading-tight px-2 relative z-10"
                style={{ color: active ? 'rgba(160,174,255,0.75)' : 'var(--ink-250)' }}>
                {cfg.tagline}
              </p>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
