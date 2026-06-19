import { NavLink, useLocation } from 'react-router-dom';
import { Home, BookOpen, Swords, User, type LucideIcon } from 'lucide-react';
import { TeachingIcon } from '@/components/ui/icons';
import { motion } from 'framer-motion';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

const LEFT_TABS: { to: string; icon: LucideIcon; label: string }[] = [
  { to: '/home',     icon: Home,     label: 'Home'    },
  { to: '/learning', icon: BookOpen, label: 'Learn'   },
];

const RIGHT_TABS: { to: string; icon: LucideIcon; label: string }[] = [
  { to: '/battle',   icon: Swords,   label: 'Battle'  },
  { to: '/profile',  icon: User,     label: 'Profile' },
];

async function hapticLight() {
  try { await Haptics.impact({ style: ImpactStyle.Light }); } catch { /* web */ }
}

function TabButton({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <NavLink
      to={to}
      onClick={hapticLight}
      className="flex-1 flex flex-col items-center justify-center gap-0.5 pt-2 pb-1 relative min-w-0"
      style={{ minHeight: 44, minWidth: 44 }}
      aria-label={label}
    >
      {({ isActive }) => (
        <>
          <motion.div
            style={{ position: 'absolute', top: 0, left: '50%', x: '-50%', height: 2, borderRadius: 2 }}
            animate={isActive
              ? { width: 24, opacity: 1, background: 'linear-gradient(90deg,#7C3AED,#A855F7)' }
              : { width: 0,  opacity: 0 }
            }
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
          />

          <motion.div
            className="flex items-center justify-center rounded-2xl"
            style={{ width: 40, height: 36 }}
            animate={isActive
              ? { scale: 1.08, background: 'rgba(124,58,237,0.18)', boxShadow: '0 0 12px rgba(124,58,237,0.3)' }
              : { scale: 1,    background: 'transparent',           boxShadow: 'none' }
            }
            transition={{ duration: 0.2 }}
          >
            <Icon
              size={20}
              strokeWidth={isActive ? 2.5 : 1.75}
              style={isActive
                ? { color: '#A855F7', filter: 'drop-shadow(0 0 6px rgba(124,58,237,0.7))' }
                : { color: 'rgba(255,255,255,0.35)' }
              }
            />
          </motion.div>

          <span
            style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
              color: isActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)',
            }}
          >
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}

function NovoCenterButton() {
  const location = useLocation();
  const isActive = location.pathname === '/chat';

  return (
    <NavLink
      to="/chat"
      onClick={hapticLight}
      className="flex-1 flex flex-col items-center justify-center relative py-1 min-w-0"
      style={{ minHeight: 44 }}
      aria-label="Novo AI"
    >
      {/* Ambient glow */}
      <motion.div
        style={{
          position: 'absolute', width: 60, height: 60, borderRadius: '50%',
          top: '50%', left: '50%', transform: 'translate(-50%, -55%)',
          pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(124,58,237,0.35), transparent 70%)',
        }}
        animate={{ scale: [1, 1.12, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
      />

      <motion.div
        style={{
          width: 52, height: 52, borderRadius: '50%', marginTop: -16,
          background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}
        animate={isActive
          ? { scale: 1.1, boxShadow: '0 0 0 3px rgba(124,58,237,0.3), 0 8px 28px rgba(124,58,237,0.7)' }
          : { scale: 1,   boxShadow: '0 4px 20px rgba(124,58,237,0.55), 0 0 0 1.5px rgba(168,85,247,0.3)' }
        }
        whileTap={{ scale: 0.92 }}
        transition={{ duration: 0.2 }}
      >
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.22), transparent 60%)',
        }} />
        <TeachingIcon size={22} className="text-white relative z-10" />
      </motion.div>

      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', marginTop: 2,
        color: isActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.35)',
        ...(isActive ? { textShadow: '0 0 8px rgba(168,85,247,0.6)' } : {}),
      }}>
        Novo
      </span>
    </NavLink>
  );
}

export function TabBar() {
  return (
    <div
      className="absolute bottom-0 left-0 right-0 pointer-events-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 10, paddingRight: 10, zIndex: 50 }}
    >
      <nav
        className="pointer-events-auto flex items-stretch"
        role="navigation"
        aria-label="Main navigation"
        style={{
          height: 'var(--nav-pill-height)',
          borderRadius: 26,
          marginBottom: 'var(--nav-bottom-offset)',
          background: 'rgba(10,10,15,0.93)',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          border: '1px solid rgba(124,58,237,0.12)',
          boxShadow: '0 -4px 32px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.05)',
          overflow: 'visible',
        }}
      >
        {LEFT_TABS.map(tab => <TabButton key={tab.to} {...tab} />)}
        <NovoCenterButton />
        {RIGHT_TABS.map(tab => <TabButton key={tab.to} {...tab} />)}
      </nav>
    </div>
  );
}
