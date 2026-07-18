import { NavLink, useLocation } from 'react-router-dom';
import { Home, BookOpen, Swords, User, type LucideIcon } from 'lucide-react';
import { TeachingIcon } from '@/components/ui/icons';
import { motion } from 'framer-motion';
import { ease, dur } from '@/lib/motion';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

const LEFT_TABS: { to: string; icon: LucideIcon; label: string }[] = [
  { to: '/home',     icon: Home,     label: 'Home'    },
  { to: '/learning', icon: BookOpen, label: 'Learn'   },
];

const RIGHT_TABS: { to: string; icon: LucideIcon; label: string }[] = [
  { to: '/battle',  icon: Swords, label: 'Battle'  },
  { to: '/profile', icon: User,   label: 'Profile' },
];

async function hapticLight() {
  try { await Haptics.impact({ style: ImpactStyle.Light }); } catch { /* web */ }
}

function TabButton({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <NavLink
      to={to}
      onClick={hapticLight}
      className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 relative min-w-0"
      style={{ minHeight: 44, minWidth: 44 }}
      aria-label={label}
    >
      {({ isActive }) => (
        <>
          {/* Liquid glass active bubble */}
          <motion.div
            style={{
              position: 'absolute',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -58%)',
              width: 46, height: 36,
              borderRadius: 14,
              pointerEvents: 'none',
            }}
            animate={isActive ? {
              opacity: 1,
              background: 'rgba(124,58,237,0.18)',
              border: '1px solid rgba(124,58,237,0.26)',
              boxShadow: 'inset 0 1px 0 var(--ink-140), 0 2px 10px rgba(124,58,237,0.28)',
            } : {
              opacity: 0,
              background: 'transparent',
              border: '1px solid transparent',
              boxShadow: 'none',
            }}
            transition={{ duration: dur.instant, ease: ease.ios }}
          />

          <motion.div
            className="flex items-center justify-center"
            style={{ width: 46, height: 36, borderRadius: 14, position: 'relative', zIndex: 1 }}
            animate={isActive ? { scale: 1.06 } : { scale: 1 }}
            transition={{ duration: dur.fast, ease: ease.ios }}
          >
            <Icon
              size={20}
              strokeWidth={isActive ? 2.5 : 1.75}
              style={isActive ? {
                color: '#A78BFA',
                filter: 'drop-shadow(0 0 6px rgba(167,139,250,0.65))',
              } : {
                color: 'var(--ink-500)',
              }}
            />
          </motion.div>

          <motion.span
            className="tab-label"
            animate={isActive
              ? { color: 'var(--ink-880)', opacity: 1 }
              : { color: 'var(--ink-500)', opacity: 1 }
            }
            transition={{ duration: dur.fast }}
            style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', lineHeight: 1 }}
          >
            {label}
          </motion.span>
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
      {/* Layered ambient glow — depth effect */}
      <motion.div
        style={{
          position: 'absolute',
          width: 80, height: 80,
          borderRadius: '50%',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -60%)',
          pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(139,92,246,0.28) 0%, transparent 68%)',
        }}
        animate={{ scale: [1, 1.14, 1], opacity: [0.5, 0.9, 0.5] }}
        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
      />
      <motion.div
        style={{
          position: 'absolute',
          width: 48, height: 48,
          borderRadius: '50%',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -60%)',
          pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(91,106,245,0.22) 0%, transparent 72%)',
          filter: 'blur(6px)',
        }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.8, 0.4] }}
        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut', delay: 0.4 }}
      />

      {/* Novo orb button — liquid glass with specular */}
      <motion.div
        className="novo-orb"
        style={{
          width: 54, height: 54,
          borderRadius: '50%',
          marginTop: -18,
          position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(145deg, #6B7BF7 0%, #7C3AED 55%, #9333EA 100%)',
        }}
        animate={isActive ? {
          scale: 1.1,
          boxShadow: '0 0 0 3px rgba(124,58,237,0.28), 0 8px 32px rgba(124,58,237,0.75), 0 0 60px rgba(139,92,246,0.35)',
        } : {
          scale: 1,
          boxShadow: '0 0 0 1.5px rgba(168,85,247,0.28), 0 4px 22px rgba(124,58,237,0.60), 0 0 40px rgba(139,92,246,0.20)',
        }}
        whileTap={{ scale: 0.90 }}
        transition={{ duration: dur.instant, ease: ease.ios }}
      >
        {/* Specular highlight — Vision Pro inner shine */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: 'radial-gradient(ellipse 70% 45% at 38% 28%, var(--ink-280), transparent 65%)',
          pointerEvents: 'none',
        }} />
        {/* Bottom depth shadow layer */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: 'radial-gradient(ellipse 80% 50% at 50% 90%, rgba(0,0,0,0.30), transparent 70%)',
          pointerEvents: 'none',
        }} />
        <TeachingIcon size={22} className="text-white relative z-10" />
      </motion.div>

      <motion.span
        className="tab-label"
        animate={isActive
          ? { color: 'var(--ink-920)', textShadow: '0 0 10px rgba(168,85,247,0.55)' }
          : { color: 'var(--ink-500)', textShadow: 'none' }
        }
        transition={{ duration: 0.2 }}
        style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', marginTop: 4 }}
      >
        Novo
      </motion.span>
    </NavLink>
  );
}

export function TabBar() {
  return (
    <nav
      className="nav-island"
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Inner prismatic top edge */}
      <div style={{
        position: 'absolute', top: 0, left: '8%', right: '8%',
        height: 1, borderRadius: '50%', pointerEvents: 'none', zIndex: 1,
        background: 'linear-gradient(90deg, transparent, var(--ink-220), rgba(167,139,250,0.3), var(--ink-220), transparent)',
      }} />

      {LEFT_TABS.map(tab  => <TabButton key={tab.to} {...tab} />)}
      <NovoCenterButton />
      {RIGHT_TABS.map(tab => <TabButton key={tab.to} {...tab} />)}
    </nav>
  );
}
