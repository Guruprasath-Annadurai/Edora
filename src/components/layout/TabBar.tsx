import { NavLink } from 'react-router-dom';
import { Home, Zap, BookOpen, Wrench, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { to: '/home',     icon: Home,     label: 'Home'    },
  { to: '/sprint',   icon: Zap,      label: 'Sprint'  },
  { to: '/learning', icon: BookOpen, label: 'Learn'   },
  { to: '/tools',    icon: Wrench,   label: 'Tools'   },
  { to: '/profile',  icon: User,     label: 'Profile' },
];

export function TabBar() {
  return (
    <nav
      className="bg-white border-t border-border flex items-stretch"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        boxShadow: '0 -4px 24px rgba(91,106,245,0.08)',
      }}
    >
      {tabs.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => cn(
            'flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-all duration-200 touch-target relative',
            isActive ? 'text-primary' : 'text-muted-foreground'
          )}
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                  style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
                />
              )}
              <div className={cn(
                'p-1.5 rounded-xl transition-all duration-200',
                isActive && 'bg-primary/10'
              )}>
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.25 : 1.75}
                  style={isActive ? { color: '#5B6AF5' } : {}}
                />
              </div>
              <span className={cn(
                'text-[10px] font-semibold',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}>
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
