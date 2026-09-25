import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: store.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => { store.set(key, value); }),
    remove: vi.fn(async ({ key }: { key: string }) => { store.delete(key); }),
  },
}));

const rpcMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

import {
  DEFAULT_APP_FLAGS,
  getAppFlags,
  isFeatureEnabled,
  getCachedAppFlag,
  resetAppFlagsCache,
} from './appFlags';

describe('appFlags client SDK', () => {
  beforeEach(async () => {
    store.clear();
    rpcMock.mockReset();
    await resetAppFlagsCache();
  });

  // ── Default values ────────────────────────────────────────────────────────

  it('battle_enabled defaults to false (V5 freeze)', () => {
    expect(DEFAULT_APP_FLAGS.battle_enabled).toBe(false);
    expect(getCachedAppFlag('battle_enabled')).toBe(false);
  });

  it('new_home_enabled defaults to false (V5 freeze)', () => {
    expect(DEFAULT_APP_FLAGS.new_home_enabled).toBe(false);
    expect(getCachedAppFlag('new_home_enabled')).toBe(false);
  });

  it('unknown flag defaults to false (fail-closed)', () => {
    expect(getCachedAppFlag('nonexistent_feature_flag')).toBe(false);
  });

  it('known enabled flags default to true (novo, ai_generation, pyq, pro)', () => {
    expect(DEFAULT_APP_FLAGS.novo_enabled).toBe(true);
    expect(DEFAULT_APP_FLAGS.ai_generation_enabled).toBe(true);
    expect(DEFAULT_APP_FLAGS.pyq_enabled).toBe(true);
    expect(DEFAULT_APP_FLAGS.pro_enabled).toBe(true);
  });

  // ── Remote override behavior ──────────────────────────────────────────────

  it('remote true can explicitly enable a feature that defaults false (battle_enabled)', async () => {
    rpcMock.mockResolvedValue({
      data: { battle_enabled: true },
      error: null,
    });

    const flags = await getAppFlags();
    expect(flags.battle_enabled).toBe(true);
    expect(getCachedAppFlag('battle_enabled')).toBe(true);
  });

  it('remote false disables a feature that defaults true (novo_enabled kill-switch)', async () => {
    rpcMock.mockResolvedValue({
      data: { novo_enabled: false },
      error: null,
    });

    const flags = await getAppFlags();
    expect(flags.novo_enabled).toBe(false);
    expect(getCachedAppFlag('novo_enabled')).toBe(false);
  });

  // ── Network failure behavior ──────────────────────────────────────────────

  it('network failure preserves safe defaults — battle and new_home remain false', async () => {
    rpcMock.mockRejectedValue(new Error('Network offline'));

    const flags = await getAppFlags();
    expect(flags.novo_enabled).toBe(true);       // enabled by default — preserved
    expect(flags.battle_enabled).toBe(false);    // disabled by default — preserved safe
    expect(flags.new_home_enabled).toBe(false);  // disabled by default — preserved safe
    expect(flags.pyq_enabled).toBe(true);
  });

  it('RPC error response preserves safe defaults', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const flags = await getAppFlags();
    expect(flags.battle_enabled).toBe(false);
    expect(flags.new_home_enabled).toBe(false);
    expect(flags.novo_enabled).toBe(true);
  });

  // ── Cache behavior ────────────────────────────────────────────────────────

  it('caches flags in memory and does not hit RPC on subsequent reads within TTL', async () => {
    rpcMock.mockResolvedValue({
      data: { pyq_enabled: false },
      error: null,
    });

    const first = await isFeatureEnabled('pyq_enabled');
    expect(first).toBe(false);
    expect(rpcMock).toHaveBeenCalledTimes(1);

    // Second call should use cache
    const second = await isFeatureEnabled('pyq_enabled');
    expect(second).toBe(false);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('forces refresh when forceRefresh is true', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { battle_enabled: false },
      error: null,
    });

    await getAppFlags();
    expect(rpcMock).toHaveBeenCalledTimes(1);

    rpcMock.mockResolvedValueOnce({
      data: { battle_enabled: true },
      error: null,
    });

    const refreshed = await getAppFlags(true);
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(refreshed.battle_enabled).toBe(true);
  });

  it('synchronously reads from cache with getCachedAppFlag after fetch', async () => {
    expect(getCachedAppFlag('novo_enabled')).toBe(true);

    rpcMock.mockResolvedValue({
      data: { novo_enabled: false },
      error: null,
    });

    await getAppFlags();
    expect(getCachedAppFlag('novo_enabled')).toBe(false);
  });

  it('merges remote flags correctly — unspecified flags retain defaults', async () => {
    rpcMock.mockResolvedValue({
      data: {
        novo_enabled: false, // Kill-switch active
        battle_enabled: true, // Explicitly re-enabled remotely
      },
      error: null,
    });

    const flags = await getAppFlags();
    expect(flags.novo_enabled).toBe(false);
    expect(flags.battle_enabled).toBe(true);
    expect(flags.ai_generation_enabled).toBe(true); // Default retained
    expect(flags.new_home_enabled).toBe(false);     // Default retained (false)
  });
});
