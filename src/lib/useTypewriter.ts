// ─────────────────────────────────────────────────────────────────────────────
// useTypewriter — animates AI text word-by-word after it arrives from the server
//
// Gives the same perceived feel as real token streaming even when the response
// comes back all at once (e.g. tutoring-engine, debate-mode edge functions).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useCallback, useEffect } from 'react';

// ~200 chars/sec — fast enough to feel alive, slow enough to read
const CHARS_PER_TICK = 5;
const TICK_MS        = 16; // ~60fps

export function useTypewriter() {
  const [animatingId,  setAnimatingId]  = useState<string | null>(null);
  const [displayedLen, setDisplayedLen] = useState(0);

  const fullTextRef  = useRef('');
  const timerRef     = useRef<ReturnType<typeof setInterval>>();

  // Cleanup on unmount
  useEffect(() => () => clearInterval(timerRef.current), []);

  const startTyping = useCallback((id: string, text: string) => {
    clearInterval(timerRef.current);
    fullTextRef.current = text;
    setAnimatingId(id);
    setDisplayedLen(0);

    timerRef.current = setInterval(() => {
      setDisplayedLen(prev => {
        const next = Math.min(prev + CHARS_PER_TICK, text.length);
        if (next >= text.length) clearInterval(timerRef.current);
        return next;
      });
    }, TICK_MS);
  }, []);

  /** Returns the portion of `content` to display right now, plus a typing flag. */
  const getDisplay = useCallback(
    (id: string, content: string): { text: string; typing: boolean } => {
      if (id !== animatingId) return { text: content, typing: false };
      return {
        text:   content.slice(0, displayedLen),
        typing: displayedLen < content.length,
      };
    },
    [animatingId, displayedLen],
  );

  return { startTyping, getDisplay };
}
