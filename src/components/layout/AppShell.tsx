import { useRef, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
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
import { OfflineBanner } from '@/components/ui/OfflineBanner';

export function AppShell() {
  useAndroidBack();
  useEyeStrainMode();
  const celebRef = useRef<CelebrationHandle>(null);
  const { profile } = useAuth();
  const location = useLocation();
  // Hidden on /chat: Novo's own composer already offers an equivalent
  // "quiz me on a topic" affordance there, and this FAB's fixed bottom-right
  // position visually collides with the chat input's send button.
  // On-device testing found the FAB overlapping the "Save Changes" button on
  // Account Settings — a floating "start a quiz" shortcut has no contextual
  // relevance on settings/profile-editing screens anyway, so hide it there
  // the same way it's already hidden on /chat.
  const showQuickStartFAB = !location.pathname.startsWith('/chat')
    && !location.pathname.startsWith('/account')
    && !location.pathname.startsWith('/settings');
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

      {/* Offline banner — was a fully built, wired-up-nowhere component.
          Every one of the ~87 protected routes renders through AppShell, so
          this single line gives every page a clear "you're offline" signal
          instead of a silent hang/spinner on a dropped connection, without
          needing per-page wiring. Individual pages can still layer richer
          offline-specific UI (cached data, retry banners) on top of this —
          see OfflineCache/offlineStudy for the handful of pages that already do. */}
      <div style={{ position: 'relative', zIndex: 2 }}><OfflineBanner /></div>

      {/* Page content
          NOTE: deliberately no explicit z-index here. `position: relative` +
          an explicit z-index would make `main` a new CSS stacking context,
          capping every fixed-position modal a page renders inside it (e.g.
          the sign-out confirm sheet's z-[600]) at that context's level —
          so no z-index a page modal declares could ever out-rank a sibling
          like TabBar's floating pill (z-index: 50), even though 600 > 50.
          Found via the profile-signout E2E spec: the confirm button's tap
          target overlapped the nav pill and was silently unclickable there.
          Leaving z-index unset here lets modal z-indices resolve against
          the true root stacking context instead. DOM order still keeps
          this above the z-index:0 ambient background layer. */}
      <main className="flex-1 overflow-hidden relative" role="main">
        <Outlet />
      </main>

      {/* Floating Quick Start button — hidden on /chat, see showQuickStartFAB above */}
      {showQuickStartFAB && <QuickStartFAB />}

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
