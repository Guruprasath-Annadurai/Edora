import { describe, it, expect, vi, afterEach } from 'vitest';
import { isInFreeTrial, trialDaysRemaining, TRIAL_DAYS } from './trial';

describe('trial', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is in trial the day the account was created', () => {
    expect(isInFreeTrial(new Date().toISOString())).toBe(true);
  });

  it('is in trial one day before the 30-day window closes', () => {
    vi.useFakeTimers();
    const created = new Date('2026-01-01T00:00:00Z');
    vi.setSystemTime(new Date('2026-01-29T00:00:00Z'));
    expect(isInFreeTrial(created.toISOString())).toBe(true);
  });

  it('is not in trial exactly at the 30-day boundary', () => {
    vi.useFakeTimers();
    const created = new Date('2026-01-01T00:00:00Z');
    vi.setSystemTime(new Date('2026-01-31T00:00:00Z'));
    expect(isInFreeTrial(created.toISOString())).toBe(false);
  });

  it('is not in trial well after the window closes', () => {
    vi.useFakeTimers();
    const created = new Date('2026-01-01T00:00:00Z');
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    expect(isInFreeTrial(created.toISOString())).toBe(false);
  });

  it('trialDaysRemaining counts down toward zero and never goes negative', () => {
    vi.useFakeTimers();
    const created = new Date('2026-01-01T00:00:00Z');
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    expect(trialDaysRemaining(created.toISOString())).toBe(TRIAL_DAYS);

    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    expect(trialDaysRemaining(created.toISOString())).toBe(0);
  });
});
