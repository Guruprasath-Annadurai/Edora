// ─────────────────────────────────────────────────────────────────────────────
// App Flags — client SDK for remote feature flags.
//
// Fast, cached, resilient.
// - Synchronous in-memory reads via getCachedAppFlag.
// - Asynchronous fetch with fallback to cached preferences and safe defaults.
// - Backed by server-authoritative public.get_app_flags() RPC.
//
// FAIL-CLOSED: Unknown / missing flags default to FALSE.
// Feature flags are rollback/containment controls — a missing config must NOT
// accidentally expose unfinished functionality.
// ─────────────────────────────────────────────────────────────────────────────

import { Preferences } from '@capacitor/preferences';
import { supabase } from '@/lib/supabase';

const CACHE_KEY = 'edora_app_flags_cache';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface AppFlags {
  novo_enabled: boolean;
  ai_generation_enabled: boolean;
  pyq_enabled: boolean;
  battle_enabled: boolean;
  new_home_enabled: boolean;
  pro_enabled: boolean;
  [key: string]: boolean;
}

/**
 * Canonical V5 defaults.
 *
 * battle_enabled = false  — V5 freeze: not yet re-enabled
 * new_home_enabled = false — V5 freeze: not yet re-enabled
 *
 * FAIL-CLOSED: any unknown flag not listed here returns false from
 * getCachedAppFlag / isFeatureEnabled. Do NOT use `?? true` for unknown flags.
 */
export const DEFAULT_APP_FLAGS: AppFlags = {
  novo_enabled: true,
  ai_generation_enabled: true,
  pyq_enabled: true,
  battle_enabled: false,
  new_home_enabled: false,
  pro_enabled: true,
};

interface CacheEnvelope {
  flags: AppFlags;
  cachedAt: number;
}

let inMemoryFlags: AppFlags = { ...DEFAULT_APP_FLAGS };
let lastFetchedAt = 0;

/**
 * Synchronous read of the current flag state from memory.
 *
 * FAIL-CLOSED: returns false for unknown flags — never true.
 * Only returns true if the flag is explicitly true in the live merged state.
 */
export function getCachedAppFlag(flag: keyof AppFlags): boolean {
  // Explicit false check: unknown flags are NOT in DEFAULT_APP_FLAGS and
  // are NOT in inMemoryFlags, so they return false (not true).
  return inMemoryFlags[flag] ?? DEFAULT_APP_FLAGS[flag] ?? false;
}

/**
 * Retrieve all feature flags.
 * Uses in-memory cache if fresh, then local storage, then queries Supabase RPC.
 * Falls back safely to defaults on any network or database failure.
 *
 * FAIL-CLOSED: safe defaults exclude battle and new_home.
 */
export async function getAppFlags(forceRefresh = false): Promise<AppFlags> {
  const now = Date.now();

  // 1. Check in-memory freshness
  if (!forceRefresh && lastFetchedAt > 0 && (now - lastFetchedAt) < CACHE_TTL_MS) {
    return { ...inMemoryFlags };
  }

  // 2. Try loading from storage if memory not populated
  if (!forceRefresh && lastFetchedAt === 0) {
    try {
      const { value } = await Preferences.get({ key: CACHE_KEY });
      if (value) {
        const envelope: CacheEnvelope = JSON.parse(value);
        if (envelope && envelope.flags && (now - envelope.cachedAt) < CACHE_TTL_MS) {
          inMemoryFlags = { ...DEFAULT_APP_FLAGS, ...envelope.flags };
          lastFetchedAt = envelope.cachedAt;
          return { ...inMemoryFlags };
        }
      }
    } catch {
      // Storage read failed, proceed to network
    }
  }

  // 3. Query the remote server RPC
  try {
    const { data, error } = await supabase.rpc('get_app_flags');
    if (!error && data && typeof data === 'object') {
      const remoteFlags = data as Record<string, boolean>;
      inMemoryFlags = { ...DEFAULT_APP_FLAGS, ...remoteFlags };
      lastFetchedAt = now;

      // Save to storage cache asynchronously
      const envelope: CacheEnvelope = { flags: inMemoryFlags, cachedAt: now };
      Preferences.set({ key: CACHE_KEY, value: JSON.stringify(envelope) }).catch(() => {});
      return { ...inMemoryFlags };
    }
  } catch {
    // Network / RPC error, keep current or fall back
  }

  return { ...inMemoryFlags };
}

/**
 * Check if a specific feature flag is enabled.
 *
 * FAIL-CLOSED: unknown flags return false, not true.
 */
export async function isFeatureEnabled(flag: keyof AppFlags, forceRefresh = false): Promise<boolean> {
  const flags = await getAppFlags(forceRefresh);
  // Explicit false fallback — unknown flags must not accidentally enable features
  return flags[flag] ?? DEFAULT_APP_FLAGS[flag] ?? false;
}

/**
 * Reset memory and stored cache (e.g. for testing or sign-out).
 */
export async function resetAppFlagsCache(): Promise<void> {
  inMemoryFlags = { ...DEFAULT_APP_FLAGS };
  lastFetchedAt = 0;
  try {
    await Preferences.remove({ key: CACHE_KEY });
  } catch {
    // Ignore
  }
}
