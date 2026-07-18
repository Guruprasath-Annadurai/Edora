// ═══════════════════════════════════════════════════════════════════════════
// useModalA11y — minimal WAI-ARIA dialog pattern primitive
//
// Handles the three things every modal/overlay in the app was missing:
// initial focus on open, Tab/Shift+Tab focus trapping while open, and focus
// restoration to the triggering element on close. Pair with role="dialog"
// aria-modal="true" on the container this ref is attached to.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalA11y<T extends HTMLElement>(active: boolean, onClose?: () => void) {
  const containerRef = useRef<T | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // Latest onClose in a ref so the effect below doesn't need it in its deps —
  // onClose is a fresh function identity on every parent render, and re-running
  // the effect on every render would steal focus back to the trigger element
  // mid-conversation (see VoiceStudyOverlay, which re-renders on every phase change).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const container = containerRef.current;
    const focusables = container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusables && focusables.length > 0 ? focusables[0] : container)?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && onCloseRef.current) {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !container) return;

      const nodes = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [active]);

  return containerRef;
}
