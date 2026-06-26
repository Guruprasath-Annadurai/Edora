// ─────────────────────────────────────────────────────────────────────────────
// useAppRating — fires in-app rating prompts at optimal moments
// Import and call triggerRating() at milestone moments; hook handles rate-limiting.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback } from 'react';
import { maybePromptRating, type RatingTrigger } from '@/lib/appRating';

export function useAppRating() {
  const triggerRating = useCallback(async (trigger: RatingTrigger) => {
    await maybePromptRating(trigger);
  }, []);

  return { triggerRating };
}
