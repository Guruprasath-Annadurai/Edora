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

  it('returns safe defaults if remote call fails', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'Network offline' } });

    const flags = await getAppFlags();
    expect(flags.novo_enabled).toBe(true);
    expect(flags.battle_enabled).toBe(true);
    expect(flags.pyq_enabled).toBe(true);
  });

  it('merges remote flags correctly when RPC succeeds', async () => {
    rpcMock.mockResolvedValue({
      data: {
        novo_enabled: false, // Kill-switch active
        battle_enabled: true,
      },
      error: null,
    });

    const flags = await getAppFlags();
    expect(flags.novo_enabled).toBe(false);
    expect(flags.battle_enabled).toBe(true);
    expect(flags.ai_generation_enabled).toBe(true); // Default retained
  });

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

  it('synchronously reads from cache with getCachedAppFlag', async () => {
    // Before fetch: default is true
    expect(getCachedAppFlag('novo_enabled')).toBe(true);

    rpcMock.mockResolvedValue({
      data: { novo_enabled: false },
      error: null,
    });

    await getAppFlags();
    expect(getCachedAppFlag('novo_enabled')).toBe(false);
  });
});
