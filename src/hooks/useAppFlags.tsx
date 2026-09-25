import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { App as CapApp } from '@capacitor/app';
import { DEFAULT_APP_FLAGS, getAppFlags, type AppFlags } from '@/lib/appFlags';
import { setAiGenerationEnabled } from '@/lib/aiGeneration';

// Feeds the (frozen) backend flag SDK into React. One fetch at app start, refreshed when the app is
// resumed (the SDK itself caches for 5 min, so this is cheap). FAIL-CLOSED: until/unless flags load,
// the SDK defaults apply (battle_enabled=false, new_home_enabled=false) and unknown flags are false.

const FlagsContext = createContext<AppFlags>({ ...DEFAULT_APP_FLAGS });

export function AppFlagsProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<AppFlags>({ ...DEFAULT_APP_FLAGS });

  useEffect(() => {
    let alive = true;
    const refresh = () => { void getAppFlags().then(f => { if (alive) { setFlags(f); setAiGenerationEnabled(f.ai_generation_enabled === true); } }).catch(() => { /* keep current (fail-closed) */ }); };
    refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    let handle: Promise<{ remove: () => void }> | null = null;
    try { handle = CapApp.addListener('appStateChange', ({ isActive }) => { if (isActive) refresh(); }); } catch { /* web */ }
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      void handle?.then(h => h.remove()).catch(() => {});
    };
  }, []);

  return <FlagsContext.Provider value={flags}>{children}</FlagsContext.Provider>;
}

export function useAppFlags(): AppFlags {
  return useContext(FlagsContext);
}

/** true only when the flag is explicitly true (unknown flags are false). */
export function useAppFlag(name: keyof AppFlags): boolean {
  return useContext(FlagsContext)[name] === true;
}
