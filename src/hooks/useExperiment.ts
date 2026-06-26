// ─────────────────────────────────────────────────────────────────────────────
// useExperiment — React hook for A/B testing
//
// Automatically:
//   1. Reads the variant from PostHog feature flags
//   2. Tracks experiment exposure on first render
//   3. Re-evaluates when PostHog loads (async flag resolution)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react';

import posthog from 'posthog-js';
import {
  type ExperimentKey,
  type VariantFor,
  EXPERIMENTS,
  getVariant,
  trackExposure,
} from '@/lib/experiments';

export function useExperiment<K extends ExperimentKey>(key: K): VariantFor<K> {
  const [variant, setVariant] = useState<VariantFor<K>>(() => getVariant(key));
  const exposureTracked = useRef(false);

  useEffect(() => {
    // PostHog may not have loaded flags yet — re-check after it loads
    const onFlagsLoaded = () => {
      setVariant(getVariant(key));
    };

    posthog.onFeatureFlags(onFlagsLoaded);

    // Also poll once in case the event already fired
    const current = getVariant(key);
    setVariant(current);

    let timer: ReturnType<typeof setTimeout> | null = null;
    if (!exposureTracked.current) {
      exposureTracked.current = true;
      timer = setTimeout(() => {
        const v = getVariant(key);
        setVariant(v);
        trackExposure(key, v);
      }, 500);
    }

    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, [key]);

  return variant;
}

// ── Convenience hooks for specific experiments ────────────────────────────────

export function useHomeScreenVariant() {
  return useExperiment('home_screen_layout');
}

export function usePricingVariant() {
  return useExperiment('pricing_variant');
}

export function useDailyChallengeVariant() {
  return useExperiment('daily_challenge_count');
}

export function usePaywallCTAVariant() {
  return useExperiment('paywall_cta');
}

export function useD30RetentionVariant() {
  return useExperiment('d30_retention');
}
