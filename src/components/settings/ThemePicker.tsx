import { motion } from 'framer-motion';
import { Check, Lock } from 'lucide-react';
import { useTheme, THEMES, AppTheme } from '@/contexts/ThemeContext';

interface Props {
  className?: string;
}

export function ThemePicker({ className = '' }: Props) {
  const { theme, setTheme, isPro } = useTheme();

  return (
    <div className={className}>
      <h3 className="text-sm font-bold text-white/60 uppercase tracking-widest mb-3">App Theme</h3>
      <div className="grid grid-cols-4 gap-3">
        {THEMES.map((t) => {
          const active   = theme === t.id;
          const locked   = t.pro && !isPro;
          return (
            <motion.button
              key={t.id}
              whileTap={{ scale: 0.92 }}
              onClick={() => !locked && setTheme(t.id as AppTheme)}
              aria-pressed={active}
              aria-label={`${t.label} theme${locked ? ' (Pro)' : ''}`}
              disabled={locked}
              className="flex flex-col items-center gap-2 relative"
            >
              {/* Swatch */}
              <div
                className="w-14 h-14 rounded-2xl relative overflow-hidden transition-all duration-200"
                style={{
                  background: `linear-gradient(135deg,${t.preview[0]},${t.preview[1]})`,
                  boxShadow: active
                    ? `0 0 0 2.5px white, 0 0 20px ${t.preview[0]}80`
                    : '0 2px 8px rgba(0,0,0,0.3)',
                }}
              >
                {active && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.35)' }}
                  >
                    <Check size={20} className="text-white" strokeWidth={2.5} />
                  </motion.div>
                )}
                {locked && (
                  <div className="absolute inset-0 flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.55)' }}>
                    <Lock size={14} className="text-white/70" />
                  </div>
                )}
              </div>

              {/* Label */}
              <div className="text-center">
                <p className="text-[10px] font-bold text-white/70 leading-tight">{t.label}</p>
                {t.pro && !isPro && (
                  <p className="text-[9px] font-bold" style={{ color: '#EAB308' }}>PRO</p>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {!isPro && (
        <p className="text-[11px] text-white/30 mt-3 text-center">
          Unlock Midnight Blue & Sakura Pink with Pro
        </p>
      )}
    </div>
  );
}
