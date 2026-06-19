import posthog from 'posthog-js';
import { supabase } from '@/lib/supabase';
import { Capacitor } from '@capacitor/core';

let ready = false;
let sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// ── App version from env (set in vite.config / .env) ─────────────────────────
const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '1.0.0';
const PLATFORM    = Capacitor.isNativePlatform()
  ? (Capacitor.getPlatform() === 'ios' ? 'ios' : 'android')
  : 'web';

export function initAnalytics() {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!key) return;

  posthog.init(key, {
    api_host:              import.meta.env.VITE_POSTHOG_HOST ?? 'https://app.posthog.com',
    capture_pageview:      false,
    capture_pageleave:     false,
    autocapture:           false,
    persistence:           'localStorage',
    loaded:                () => { ready = true; },
  });
}

export function identify(userId: string, traits?: Record<string, unknown>) {
  if (ready) posthog.identify(userId, traits);
}

export function screenView(name: string) {
  if (ready) posthog.capture('$screen', { $screen_name: name });
  // Don't track every screen view to BQ — would be too noisy
}

export function resetAnalytics() {
  if (ready) posthog.reset();
  sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Core event tracker ────────────────────────────────────────────────────────
// Sends to PostHog (if configured) AND to BigQuery via novo-events edge function.
// BigQuery is buffered in Postgres — zero data loss even if the edge function fails.
export async function track(
  event: string,
  props?: Record<string, unknown>,
): Promise<void> {
  // PostHog (optional — only if key is configured)
  if (ready) posthog.capture(event, props);

  // BigQuery via Supabase Edge Function (async, fire-and-forget)
  try {
    const { data: { session } } = await supabase.auth.getSession();
    supabase.functions.invoke('novo-events', {
      body: {
        action:      'track',
        event_name:  event,
        user_id:     session?.user?.id ?? null,
        session_id:  sessionId,
        platform:    PLATFORM,
        app_version: APP_VERSION,
        properties:  props ?? {},
      },
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {},
    }).catch(() => {}); // non-fatal
  } catch {
    // analytics must never break the app
  }
}

// ── Typed event helpers ───────────────────────────────────────────────────────
// Each function documents exactly what we track and why.

export const Events = {
  // Chat
  chatMessageSent:   (props: { personality: string; language: string; hasNcertContext: boolean }) =>
    track('chat_message_sent', props),

  // Quiz
  quizStarted:       (props: { subject: string; class_num: number; difficulty: string }) =>
    track('quiz_started', props),
  quizCompleted:     (props: { subject: string; score: number; total: number; time_secs: number }) =>
    track('quiz_completed', props),

  // Voice
  voiceSessionStart: (props: { language: string; mode: string }) =>
    track('voice_session_start', props),
  voiceSessionEnd:   (props: { language: string; duration_secs: number; turns: number }) =>
    track('voice_session_end', props),

  // Flashcards
  flashcardStudied:  (props: { subject: string; cards_reviewed: number; recall_rate: number }) =>
    track('flashcard_studied', props),

  // NCERT RAG
  ncertContextUsed:  (props: { query_words: number; results: number; mode: 'vector' | 'fts' | 'none' }) =>
    track('ncert_context_used', props),

  // Language
  languageChanged:   (props: { from: string; to: string }) =>
    track('language_changed', props),

  // Subscription
  proPageViewed:     () => track('pro_page_viewed'),
  proCheckout:       (props: { plan: string; price: number }) =>
    track('pro_checkout_started', props),
  proSubscribed:     (props: { plan: string; price: number }) =>
    track('pro_subscribed', props),

  // Engagement
  streakMaintained:  (props: { streak_days: number }) =>
    track('streak_maintained', props),
  streakBroken:      (props: { was_days: number }) =>
    track('streak_broken', props),

  // Offline / connectivity
  offlineFallback:   () => track('offline_fallback'),
  appInstalled:      () => track('app_installed'),
  offlineSyncFlushed: (props: { flushed_count: number }) =>
    track('offline_sync_flushed', props),

  // Install → Signup → Onboard → D7 funnel
  appOpened:          (props: { source: 'cold_start' | 'notification' | 'deeplink' }) =>
    track('app_opened', props),
  signupStarted:      (props: { method: 'email' | 'google' | 'apple' }) =>
    track('signup_started', props),
  signupCompleted:    (props: { method: 'email' | 'google' | 'apple' }) =>
    track('signup_completed', props),
  onboardingStarted:  () => track('onboarding_started'),
  onboardingCompleted:(props: { class_num: number; subjects: string[]; study_goal_mins: number }) =>
    track('onboarding_completed', props),
  d7RetentionCheck:   (props: { days_active: number; features_used: string[] }) =>
    track('d7_retention_check', props),

  // Feature adoption (call when user first uses a feature)
  featureAdopted:     (props: { feature: string; session_num: number }) =>
    track('feature_adopted', props),

  // Weakness Radar
  weaknessRadarViewed:(props: { subjects: string[]; weakest_topic: string }) =>
    track('weakness_radar_viewed', props),
  weaknessSprintLaunched: (props: { topic_count: number }) =>
    track('weakness_sprint_launched', props),

  // IRT / adaptive quiz
  confidenceRated:    (props: { topic: string; confidence: 'sure' | 'guessing'; correct: boolean }) =>
    track('confidence_rated', props),
  conceptExplained:   (props: { topic: string; trigger: 'three_wrong' }) =>
    track('concept_explained', props),

  // Scan to flashcard
  textbookScanned:    (props: { subject: string; card_created: boolean }) =>
    track('textbook_scanned', props),

  // Voice quiz
  voiceQuizStarted:   (props: { topic: string }) =>
    track('voice_quiz_started', props),

  // Real-time
  leaderboardViewed:  (props: { classroom_id: string; rank: number }) =>
    track('leaderboard_viewed', props),
  battleStarted:      (props: { opponent_id: string; topic: string }) =>
    track('battle_started', props),
  battleCompleted:    (props: { won: boolean; score: number; opponent_score: number }) =>
    track('battle_completed', props),

  // DPDP consent
  dpdpConsentGiven:   (props: { version: string }) =>
    track('dpdp_consent_given', props),
};
