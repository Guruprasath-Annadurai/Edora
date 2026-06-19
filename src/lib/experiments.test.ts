import { describe, it, expect, vi } from 'vitest';

vi.mock('posthog-js', () => ({
  default: {
    getFeatureFlag: vi.fn(() => undefined),
    get_distinct_id: vi.fn(() => 'test-id'),
  },
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

import { getVariant, getPricingConfig, getDailyChallengeConfig } from './experiments';

describe('getVariant', () => {
  it('falls back to the control variant when PostHog has no flag set', () => {
    expect(getVariant('home_screen_layout')).toBe('control');
    expect(getVariant('pricing_variant')).toBe('ninety_nine');
    expect(getVariant('daily_challenge_count')).toBe('five');
  });
});

describe('getPricingConfig', () => {
  it('defaults to the ₹99/month control price', () => {
    const config = getPricingConfig();
    expect(config.monthly).toBe(99);
    expect(config.label).toBe('₹99/month');
  });
});

describe('getDailyChallengeConfig', () => {
  it('defaults to the 5-question control mode', () => {
    const config = getDailyChallengeConfig();
    expect(config.mode).toBe('questions');
    expect(config.count).toBe(5);
  });
});
