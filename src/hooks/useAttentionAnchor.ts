import { useEffect, useRef } from 'react';

/**
 * After `idleMs` of no interaction on the page, adds the class
 * `attention-pulse` to the element referenced by the returned ref.
 * Stops pulsing the moment the user taps/clicks/scrolls anywhere.
 * Only activates on content-display pages (not during active input).
 */
export function useAttentionAnchor<T extends HTMLElement>(idleMs = 3000) {
  const ref = useRef<T>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    function startTimer() {
      clearTimer();
      timer = setTimeout(() => {
        ref.current?.classList.add('attention-pulse');
      }, idleMs);
    }

    function clearTimer() {
      if (timer) { clearTimeout(timer); timer = null; }
      ref.current?.classList.remove('attention-pulse');
    }

    const events = ['touchstart', 'mousedown', 'scroll', 'keydown'] as const;
    events.forEach(e => window.addEventListener(e, () => { clearTimer(); startTimer(); }, { passive: true }));
    startTimer();

    return () => {
      clearTimer();
      events.forEach(e => window.removeEventListener(e, startTimer));
    };
  }, [idleMs]);

  return ref;
}
