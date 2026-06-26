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
    <div className="flex flex-col h-full overflow-hidden relative bg-deep-space">
      {/* 5-layer ambient orb system — fluid vw sizing scales on all phone widths */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{ position:'absolute', width:'115vw', height:'115vw', maxWidth:440, maxHeight:440, top:'-18vw', left:'-22vw', borderRadius:'50%', background:'radial-gradient(circle, rgba(124,58,237,0.22), transparent 68%)', filter:'blur(50px)' }} />
        <div style={{ position:'absolute', width:'92vw',  height:'92vw',  maxWidth:360, maxHeight:360, bottom:'10vw', right:'-18vw', borderRadius:'50%', background:'radial-gradient(circle, rgba(91,106,245,0.18), transparent 68%)', filter:'blur(46px)' }} />
        <div style={{ position:'absolute', width:'64vw',  height:'64vw',  maxWidth:250, maxHeight:250, top:'38%', left:'36%',  borderRadius:'50%', background:'radial-gradient(circle, rgba(6,182,212,0.11), transparent 70%)',  filter:'blur(38px)' }} />
        <div style={{ position:'absolute', width:'54vw',  height:'54vw',  maxWidth:210, maxHeight:210, top:'-10vw', right:'-10vw', borderRadius:'50%', background:'radial-gradient(circle, rgba(236,72,153,0.09), transparent 70%)', filter:'blur(42px)' }} />
        <div style={{ position:'absolute', width:'82vw',  height:'46vw',  maxWidth:320, maxHeight:180, bottom:0, left:'15%',  borderRadius:'50%', background:'radial-gradient(ellipse, rgba(91,106,245,0.10), transparent 70%)', filter:'blur(34px)' }} />
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
