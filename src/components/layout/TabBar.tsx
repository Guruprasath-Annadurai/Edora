import { NavLink } from 'react-router-dom';
import { Home, Zap, BookOpen, Wrench, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { to: '/home',     icon: Home,     label: 'Home' },
  { to: '/sprint',   icon: Zap,      label: 'Sprint' },
  { to: '/learning', icon: BookOpen, label: 'Learn' },
  { to: '/tools',    icon: Wrench,   label: 'Tools' },
  { to: '/profile',  icon: User,     label: 'Profile' },
];

export function TabBar() {
  return (
    <nav
      className="glass-strong border-t border-border flex items-stretch"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {tabs.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => cn(
            'flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-all duration-200 touch-target',
            isActive ? 'text-primary' : 'text-muted-foreground'
          )}
        >
          {({ isActive }) => (
            <>
              <div className={cn(
                'p-1.5 rounded-xl transition-all duration-200',
                isActive && 'bg-primary/20'
              )}>
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.5 : 1.75}
                  className={cn(isActive && 'drop-shadow-[0_0_8px_rgba(124,58,237,0.8)]')}
                />
              </div>
              <span className={cn('text-[10px] font-semibold', isActive ? 'text-primary' : 'text-muted-foreground')}>
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
