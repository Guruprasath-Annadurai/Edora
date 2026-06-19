import { useRef, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { TabBar } from './TabBar';
import { useAndroidBack } from '@/hooks/useMobileHardware';
import { CelebrationOverlay, CelebrationHandle, setCelebrationRef } from '@/components/celebrations/CelebrationOverlay';
import { QuickStartFAB } from '@/components/ui/QuickStartFAB';
import { useEyeStrainMode } from '@/hooks/useEyeStrainMode';
import { SpacedReviewInterrupt } from '@/components/study/SpacedReviewInterrupt';
import { SessionEndRitual } from '@/components/study/SessionEndRitual';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { useAuth } from '@/hooks/useAuth';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export function AppShell() {
  useAndroidBack();
  useEyeStrainMode();
  const celebRef = useRef<CelebrationHandle>(null);
  const { profile } = useAuth();
  const [sessionEndOpen,      setSessionEndOpen]      = useState(false);
  const [commandPaletteOpen,  setCommandPaletteOpen]  = useState(false);

  useEffect(() => {
    setCelebrationRef(celebRef.current);
    return () => setCelebrationRef(null);
  }, []);

  // Open session ritual when the app is backgrounded (native) or via custom event (from HomePage streak tap)
  useEffect(() => {
    const onRitualEvent  = () => setSessionEndOpen(true);
    const onPaletteEvent = () => setCommandPaletteOpen(true);
    window.addEventListener('edora:open-session-ritual',    onRitualEvent);
    window.addEventListener('edora:open-command-palette',   onPaletteEvent);

    let appListener: Promise<{ remove: () => void }> | null = null;
    if (Capacitor.isNativePlatform()) {
      appListener = App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) setSessionEndOpen(true);
      });
    }

    return () => {
      window.removeEventListener('edora:open-session-ritual',  onRitualEvent);
      window.removeEventListener('edora:open-command-palette', onPaletteEvent);
      appListener?.then(h => h.remove()).catch(() => {});
    };
  }, []);

  return (
    <div
      className="flex flex-col h-screen overflow-hidden relative"
      style={{ background: 'var(--page-gradient, linear-gradient(180deg, #0A0F25 0%, #080C1A 100%))' }}
    >
      {/* Ambient background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
        <div className="orb-purple" style={{ width: 340, height: 340, top: -100, left: -80, opacity: 0.6 }} />
        <div className="orb-blue"   style={{ width: 280, height: 280, bottom: 120, right: -60, opacity: 0.5 }} />
        <div className="orb-cyan"   style={{ width: 200, height: 200, top: '45%', left: '40%', opacity: 0.3 }} />
      </div>

      {/* Status bar safe area */}
      <div style={{ height: 'env(safe-area-inset-top)', backgroundColor: 'transparent', flexShrink: 0, position: 'relative', zIndex: 1 }} />

      {/* Page content */}
      <main className="flex-1 overflow-hidden relative" style={{ zIndex: 1 }} role="main">
        <Outlet />
      </main>

      {/* Floating Quick Start button */}
      <QuickStartFAB />

      {/* Floating pill navigation */}
      <TabBar />

      {/* Celebration overlay — renders above everything */}
      <CelebrationOverlay ref={celebRef} />

      {/* Passive spaced review card — slides up every 20 min from weak topics */}
      <SpacedReviewInterrupt />

      {/* Session End Ritual — fires on app background or streak-flame tap */}
      <SessionEndRitual
        open={sessionEndOpen}
        onClose={() => setSessionEndOpen(false)}
        streak={profile?.streak_count ?? 0}
      />

      {/* Global command palette — ⌘K / search icon anywhere in the app */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
    </div>
  );
}
