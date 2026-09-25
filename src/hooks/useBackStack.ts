import { useEffect, useRef } from 'react';
import { registerBackHandler, type BackHandler } from '@/lib/backStack';

/** Register a Back handler while `active` is true (e.g. while a modal/sheet/step is open). */
export function useBackHandler(active: boolean, handler: BackHandler, priority = 50): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return;
    return registerBackHandler(() => ref.current(), priority);
  }, [active, priority]);
}
