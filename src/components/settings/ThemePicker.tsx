import { motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface Props {
  className?: string;
}

// Simple binary dark/light switch. 'default' (dark violet) <-> 'light' (white).
// The accent-color grid (blue/green/red/gold/midnight/sakura) still exists in
// ThemeContext for anyone who wants it, just not surfaced in this simplified control.
export function ThemePicker({ className = '' }: Props) {
  const { theme, setTheme } = useTheme();
  const isLight = theme === 'light';

  return (
    <div className={className}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground">Appearance</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isLight ? 'Light mode' : 'Dark mode'}
          </p>
        </div>

        {/* Absolute-positioned knob animated via `x`, not a `layout`-animated
            child toggling the parent's justifyContent — on-device testing
            found that combination rendering the knob on the wrong side
            (left/OFF) even while correctly in light mode, a known-fragile
            Framer Motion + flex-reflow timing issue. Explicit x-transform is
            deterministic regardless of the FLIP animation's timing. */}
        <button
          type="button"
          role="switch"
          aria-checked={isLight}
          aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
          onClick={() => setTheme(isLight ? 'default' : 'light')}
          className="relative w-16 h-9 rounded-full transition-colors duration-200"
          style={{ background: isLight ? 'rgba(15,23,42,0.12)' : 'rgba(124,58,237,0.35)' }}
        >
          <motion.div
            className="absolute top-1 w-7 h-7 rounded-full flex items-center justify-center shadow-md"
            style={{ background: isLight ? '#FFFFFF' : '#7C3AED' }}
            initial={false}
            animate={{ x: isLight ? 30 : 4 }}
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          >
            {isLight
              ? <Sun size={15} color="#F59E0B" strokeWidth={2.5} />
              : <Moon size={15} color="#FFFFFF" strokeWidth={2.5} />}
          </motion.div>
        </button>
      </div>
    </div>
  );
}
