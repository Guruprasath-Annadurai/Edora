import { Navigate, Link, Outlet, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { AppFlags } from '@/lib/appFlags';
import { useAppFlag, useAppFlags } from '@/hooks/useAppFlags';
import { ruleForPath, type GateMode } from '@/lib/routeVisibility';

interface Props {
  flag: keyof AppFlags;
  mode?: GateMode;              // 'redirect' (default): hidden feature -> /home · 'unavailable': calm message, route stays
  title?: string;
  message?: string;
  children: ReactNode;
}

const COPY: Record<string, { title: string; message: string }> = {
  novo_enabled: { title: 'Novo is taking a short break', message: 'Practice and review still work while Novo is unavailable. Please check back soon.' },
  ai_generation_enabled: { title: 'Question generation is paused', message: 'New AI-made questions are unavailable right now. You can still review flashcards and practise saved questions.' },
};

export function FeatureGate({ flag, mode = 'redirect', title, message, children }: Props) {
  const enabled = useAppFlag(flag);
  if (enabled) return <>{children}</>;
  if (mode === 'redirect') return <Navigate to="/home" replace />;
  const c = COPY[flag] ?? { title: 'Not available right now', message: 'This feature is temporarily unavailable.' };
  return <UnavailableCard title={title ?? c.title} message={message ?? c.message} />;
}

export function UnavailableCard({ title, message }: { title: string; message: string }) {
  return (
    <div role="status" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 360, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: 20, fontWeight: 800, color: 'var(--ink-950)' }}>{title}</h1>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--ink-650)' }}>{message}</p>
        <Link to="/practice" style={{ minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, fontWeight: 700, color: '#fff', background: '#4F46E5' }}>
          Go to Practice
        </Link>
        <Link to="/home" style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: 'var(--ink-650)' }}>
          Back to Home
        </Link>
      </div>
    </div>
  );
}

/**
 * Single choke point for flag-controlled routes: replaces <Outlet/> in the app shell so every flagged
 * route (Battle, PYQ, Pro, Novo, AI-generation screens) is enforced in one place, including deep links.
 */
export function GatedOutlet() {
  const { pathname } = useLocation();
  const flags = useAppFlags();
  const rule = ruleForPath(pathname);
  if (rule && flags[rule.flag] !== true) {
    if (rule.mode === 'redirect') return <Navigate to="/home" replace />;
    const c = COPY[rule.flag] ?? { title: 'Not available right now', message: 'This feature is temporarily unavailable.' };
    return <UnavailableCard title={c.title} message={c.message} />;
  }
  return <Outlet />;
}
