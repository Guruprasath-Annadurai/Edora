import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerBackHandler, handleBack, backHandlerCount, resetBackStack, decideBackAction } from '@/lib/backStack';

beforeEach(() => resetBackStack());

describe('back stack priority', () => {
  it('consumes nothing when no handler is registered', () => expect(handleBack()).toBe(false));

  it('the highest priority handler runs, and ONLY that one (no double firing)', () => {
    const step = vi.fn(); const modal = vi.fn(); const overlay = vi.fn();
    registerBackHandler(step, 60); registerBackHandler(modal, 80); registerBackHandler(overlay, 90);
    expect(handleBack()).toBe(true);
    expect(overlay).toHaveBeenCalledTimes(1);
    expect(modal).not.toHaveBeenCalled();
    expect(step).not.toHaveBeenCalled();
  });

  it('order of closing: overlay -> modal -> sheet -> step, then nothing left', () => {
    const calls: string[] = [];
    const un: Record<string, () => void> = {};
    for (const [n, p] of [['step', 60], ['sheet', 70], ['modal', 80], ['overlay', 90]] as const) {
      un[n] = registerBackHandler(() => { calls.push(n); un[n](); return true; }, p);
    }
    while (handleBack()) { /* drain */ }
    expect(calls).toEqual(['overlay', 'modal', 'sheet', 'step']);
    expect(backHandlerCount()).toBe(0);
    expect(handleBack()).toBe(false);
  });

  it('equal priority: the most recently opened wins', () => {
    const a = vi.fn(); const b = vi.fn();
    registerBackHandler(a, 70); registerBackHandler(b, 70);
    handleBack();
    expect(b).toHaveBeenCalledTimes(1); expect(a).not.toHaveBeenCalled();
  });

  it('a handler that returns false declines, so the next one (or navigation) gets it', () => {
    const decline = vi.fn(() => false); const take = vi.fn(() => true);
    registerBackHandler(take, 50); registerBackHandler(decline, 80);
    expect(handleBack()).toBe(true);
    expect(decline).toHaveBeenCalled(); expect(take).toHaveBeenCalled();
    resetBackStack(); registerBackHandler(decline, 80);
    expect(handleBack()).toBe(false);
  });

  it('unregister removes only that handler', () => {
    const a = vi.fn(); const b = vi.fn();
    registerBackHandler(a, 50); const off = registerBackHandler(b, 80);
    off();
    handleBack();
    expect(b).not.toHaveBeenCalled(); expect(a).toHaveBeenCalled();
  });
});

describe('route-level back decision (when no overlay consumed Back)', () => {
  it('Home / login exit the app (minimise)', () => {
    expect(decideBackAction('/home', true)).toBe('minimise');
    expect(decideBackAction('/', false)).toBe('minimise');
    expect(decideBackAction('/login', true)).toBe('minimise');
  });
  it('onboarding never walks back into login', () => expect(decideBackAction('/onboarding', true)).toBe('minimise'));
  it('the other primary tabs return to Home instead of walking tab history', () => {
    for (const p of ['/chat', '/practice', '/progress', '/profile']) expect(decideBackAction(p, true)).toBe('home');
  });
  it('nested routes go back when there is history, otherwise to Home (never a dead end)', () => {
    expect(decideBackAction('/quiz', true)).toBe('back');
    expect(decideBackAction('/pyq-bank', false)).toBe('home');
    expect(decideBackAction('/weakness-radar', false)).toBe('home');
  });
});
