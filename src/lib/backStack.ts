// Centralised Android/system Back handling (V5 Day 5).
//
// Overlays (modals, sheets, in-page steps) register a handler while they are open. The hardware Back
// button asks this registry first: the highest-priority (then most recently registered) handler that
// accepts the event consumes it. Only when nothing consumes it does route-level navigation run
// (decideBackAction). This removes competing `backButton` listeners and double-firing.

export type BackHandler = () => boolean | void;

interface Entry { id: number; priority: number; fn: BackHandler }
let entries: Entry[] = [];
let nextId = 1;

/** Priorities: overlay/viewer 90 · modal 80 · sheet 70 · in-page step 60 · default 50. */
export function registerBackHandler(fn: BackHandler, priority = 50): () => void {
  const id = nextId++;
  entries.push({ id, priority, fn });
  return () => { entries = entries.filter(e => e.id !== id); };
}

/** Returns true if a registered handler consumed the Back event. A handler returning `false` declines it. */
export function handleBack(): boolean {
  const ordered = [...entries].sort((a, b) => b.priority - a.priority || b.id - a.id);
  for (const e of ordered) {
    if (e.fn() !== false) return true;
  }
  return false;
}

export const backHandlerCount = (): number => entries.length;
export function resetBackStack(): void { entries = []; nextId = 1; }

// ── Route-level decision (used when no overlay consumed Back) ────────────────
export type BackAction = 'minimise' | 'home' | 'back';

/** Routes where Back leaves the app (Android normal behaviour). */
export const EXIT_ROUTES = new Set(['/', '/home', '/login']);
/** Primary tab roots: Back returns to Home instead of walking tab history. */
export const TAB_ROOTS = new Set(['/chat', '/practice', '/progress', '/profile']);

export function decideBackAction(pathname: string, canGoBack: boolean): BackAction {
  if (EXIT_ROUTES.has(pathname)) return 'minimise';
  // /onboarding: its own step handler runs first; at step 0 there is nowhere meaningful to go back to.
  if (pathname === '/onboarding') return 'minimise';
  if (TAB_ROOTS.has(pathname)) return 'home';
  return canGoBack ? 'back' : 'home';   // never strand the learner on a blank/legacy screen
}
