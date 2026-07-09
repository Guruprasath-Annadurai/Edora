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

        <button
          type="button"
          role="switch"
          aria-checked={isLight}
          aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
          onClick={() => setTheme(isLight ? 'default' : 'light')}
          className="relative w-16 h-9 rounded-full flex items-center px-1 transition-colors duration-200"
          style={{
            background: isLight ? 'rgba(15,23,42,0.12)' : 'rgba(124,58,237,0.35)',
            justifyContent: isLight ? 'flex-end' : 'flex-start',
          }}
        >
          <motion.div
            layout
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
            className="w-7 h-7 rounded-full flex items-center justify-center shadow-md"
            style={{ background: isLight ? '#FFFFFF' : '#7C3AED' }}
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
