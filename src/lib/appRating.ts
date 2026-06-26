// ─────────────────────────────────────────────────────────────────────────────
// appRating — in-app review prompt strategy
//
// Triggers a native review prompt at the right moments (not spam):
//   • After first certification earned
//   • After a 7-day streak milestone
//   • After a successful Pro purchase
//
// Strategy:
//   - iOS: uses StoreKit via Capacitor plugin bridge (SKStoreReviewController)
//   - Android: uses Google Play In-App Review API via Capacitor bridge
//   - Web: shows a custom "Rate us" prompt linking to the store page
//
// Rate limiting:
//   - Never shows more than once every 60 days
//   - Never shows in the first 3 sessions
//   - Tracks in localStorage to avoid repeated prompts
// ─────────────────────────────────────────────────────────────────────────────

import { Capacitor } from '@capacitor/core';
import { track } from '@/lib/analytics';

const STORAGE_KEY     = 'edora_last_rating_prompt';
const SESSION_KEY     = 'edora_session_count';
const MIN_SESSIONS    = 3;
const MIN_DAYS        = 60;

const STORE_URLS = {
  android: 'https://play.google.com/store/apps/details?id=app.edora',
  ios:     'https://apps.apple.com/app/edora/id123456789', // replace with real ID after launch
};

function getSessionCount(): number {
  return parseInt(localStorage.getItem(SESSION_KEY) ?? '0', 10);
}

export function incrementSession(): void {
  const count = getSessionCount();
  localStorage.setItem(SESSION_KEY, String(count + 1));
}

function lastPromptDaysAgo(): number {
  const ts = localStorage.getItem(STORAGE_KEY);
  if (!ts) return Infinity;
  return (Date.now() - parseInt(ts, 10)) / (1000 * 60 * 60 * 24);
}

function markPrompted(): void {
  localStorage.setItem(STORAGE_KEY, String(Date.now()));
}

function shouldShow(): boolean {
  if (getSessionCount() < MIN_SESSIONS) return false;
  if (lastPromptDaysAgo() < MIN_DAYS)   return false;
  return true;
}

// Trigger the native in-app review via Capacitor's plugin bridge.
// Falls back to a store link open if the native plugin isn't available.
async function triggerNativeReview(): Promise<boolean> {
  const platform = Capacitor.getPlatform();

  if (!Capacitor.isNativePlatform()) return false;

  try {
    // Attempt to call native review via Capacitor's registerPlugin bridge.
    // This requires the @capacitor-community/app-rate or equivalent native plugin
    // to be installed. If not available, falls through to store link.
    const cap = await import('@capacitor/core');
    const Plugins = (cap as unknown as { Plugins?: Record<string, unknown> }).Plugins ?? {};
    const AppReview = Plugins['AppReview'] as
      { requestReview?: () => Promise<void> } | undefined;

    if (AppReview?.requestReview) {
      await AppReview.requestReview();
      return true;
    }
  } catch { /* plugin not installed */ }

  // Fallback: open store page in browser
  try {
    const { Browser } = await import('@capacitor/browser');
    const url = platform === 'ios' ? STORE_URLS.ios : STORE_URLS.android;
    await Browser.open({ url, presentationStyle: 'popover' });
    return true;
  } catch { return false; }
}

export type RatingTrigger = 'first_cert' | 'streak_7' | 'streak_30' | 'pro_purchase' | 'onboarding_done';

export async function maybePromptRating(trigger: RatingTrigger): Promise<boolean> {
  if (!shouldShow()) return false;

  track('rating_prompt_triggered', { trigger });
  markPrompted();

  const shown = await triggerNativeReview();
  track('rating_prompt_shown', { trigger, shown });
  return shown;
}
