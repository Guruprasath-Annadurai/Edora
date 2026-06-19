// ─────────────────────────────────────────────────────────────────────────────
// experiments — PostHog A/B testing framework
//
// Each experiment has:
//   key      — PostHog feature flag name
//   variants — possible values (first = control)
//   fallback — value to use if PostHog is not loaded
//
// Usage:
//   const variant = useExperiment('home_screen_layout');
//   if (variant === 'action_first') { ... }
// ─────────────────────────────────────────────────────────────────────────────

import posthog from 'posthog-js';
import { track } from '@/lib/analytics';

// ── Experiment registry ───────────────────────────────────────────────────────

export const EXPERIMENTS = {
  // Home screen layout: current feed vs. action-first (big CTA buttons)
  home_screen_layout: {
    key:      'home_screen_layout',
    variants: ['control', 'action_first'] as const,
    fallback: 'control' as const,
  },

  // Daily challenge count: 5 questions vs 10-min power session
  daily_challenge_count: {
    key:      'daily_challenge_count',
    variants: ['five', 'ten_min'] as const,
    fallback: 'five' as const,
  },

  // Pro pricing: ₹99/month vs ₹149/month
  pricing_variant: {
    key:      'pricing_variant',
    variants: ['ninety_nine', 'one_forty_nine'] as const,
    fallback: 'ninety_nine' as const,
  },

  // Onboarding flow: current vs. subject-select-first
  onboarding_flow: {
    key:      'onboarding_flow',
    variants: ['control', 'subject_first'] as const,
    fallback: 'control' as const,
  },

  // Sprint timer: no timer vs. 25-min pomodoro
  sprint_timer: {
    key:      'sprint_timer',
    variants: ['no_timer', 'pomodoro'] as const,
    fallback: 'no_timer' as const,
  },
} as const;

export type ExperimentKey = keyof typeof EXPERIMENTS;
export type VariantFor<K extends ExperimentKey> = typeof EXPERIMENTS[K]['variants'][number];

// ── Core getter ───────────────────────────────────────────────────────────────

export function getVariant<K extends ExperimentKey>(key: K): VariantFor<K> {
  try {
    const flag = posthog.getFeatureFlag(EXPERIMENTS[key].key);
    if (typeof flag === 'string') {
      const exp = EXPERIMENTS[key];
      if ((exp.variants as readonly string[]).includes(flag)) {
        return flag as VariantFor<K>;
      }
    }
  } catch { /* PostHog not loaded */ }
  return EXPERIMENTS[key].fallback as VariantFor<K>;
}

// ── Experiment tracking ───────────────────────────────────────────────────────

export function trackExposure(key: ExperimentKey, variant: string): void {
  track('experiment_exposure', {
    experiment: key,
    variant,
    posthog_distinct_id: posthog.get_distinct_id?.() ?? null,
  });
  // PostHog auto-captures feature flag calls, but we also send to BigQuery
}

export function trackConversion(
  key:       ExperimentKey,
  variant:   string,
  goalEvent: string,
  props?:    Record<string, unknown>,
): void {
  track('experiment_conversion', {
    experiment: key,
    variant,
    goal:       goalEvent,
    ...props,
  });
}

// ── Pricing helper ────────────────────────────────────────────────────────────

export function getPricingConfig(): { monthly: number; annual: number; label: string } {
  const variant = getVariant('pricing_variant');
  if (variant === 'one_forty_nine') {
    return { monthly: 149, annual: 1199, label: '₹149/month' };
  }
  return { monthly: 99, annual: 799, label: '₹99/month' };
}

// ── Daily challenge config ────────────────────────────────────────────────────

export function getDailyChallengeConfig(): { mode: 'questions' | 'timed'; count: number; minutes: number } {
  const variant = getVariant('daily_challenge_count');
  if (variant === 'ten_min') {
    return { mode: 'timed', count: 20, minutes: 10 };
  }
  return { mode: 'questions', count: 5, minutes: 0 };
}
