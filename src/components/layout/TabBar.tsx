import { NavLink } from 'react-router-dom';
import { Home, MessageCircle, ClipboardCheck, TrendingUp, User, type LucideIcon } from 'lucide-react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useT } from '@/hooks/useT';
import type { UIStringKey } from '@/lib/i18n/uiStrings';

// V5 primary navigation — exactly five tabs, in this order. Battle is NOT a primary tab
// (it is a flagged, off-by-default feature; see lib/routeVisibility.ts). Calm, solid styling:
// no glow, no gradients (founder decision D-5).
export const PRIMARY_TABS: readonly { to: string; icon: LucideIcon; labelKey: UIStringKey }[] = [
  { to: '/home',     icon: Home,           labelKey: 'nav.home'     },
  { to: '/chat',     icon: MessageCircle,  labelKey: 'nav.novo'     },
  { to: '/practice', icon: ClipboardCheck, labelKey: 'nav.practice' },
  { to: '/progress', icon: TrendingUp,     labelKey: 'nav.progress' },
  { to: '/profile',  icon: User,           labelKey: 'nav.profile'  },
] as const;

async function hapticLight() {
  try { await Haptics.impact({ style: ImpactStyle.Light }); } catch { /* web */ }
}

function TabButton({ to, icon: Icon, labelKey }: { to: string; icon: LucideIcon; labelKey: UIStringKey }) {
  const t = useT();
  const label = t(labelKey);
  return (
    <NavLink
      to={to}
      onClick={hapticLight}
      aria-label={label}
      className="flex-1 flex flex-col items-center justify-center gap-1 py-2 min-w-0"
      style={{ minHeight: 56, minWidth: 44 }}
    >
      {({ isActive }) => (
        <>
          <span
            style={{
              width: 48, height: 30, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isActive ? 'rgba(79,70,229,0.16)' : 'transparent',
            }}
          >
            <Icon size={22} strokeWidth={isActive ? 2.4 : 1.8} style={{ color: isActive ? '#6366F1' : 'var(--ink-500)' }} />
          </span>
          <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 600, lineHeight: 1, color: isActive ? 'var(--ink-880)' : 'var(--ink-500)' }}>
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}

export function TabBar() {
  return (
    <nav className="nav-island nav-solid" role="navigation" aria-label="Main navigation">
      {PRIMARY_TABS.map(tab => <TabButton key={tab.to} {...tab} />)}
    </nav>
  );
}
