/**
 * Drop-in localStorage replacement with Capacitor Preferences persistence on native.
 *
 * Reads are synchronous (from localStorage cache).
 * Writes go to localStorage immediately AND async to Capacitor Preferences,
 * so data survives app data clears on Android.
 *
 * Call initStorage() once at app startup on native to restore
 * any Preferences values that localStorage may have lost.
 */
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const isNative = () => Capacitor.isNativePlatform();

export const storage = {
  getItem(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },

  setItem(key: string, value: string): void {
    try { localStorage.setItem(key, value); } catch { /* quota exceeded — skip */ }
    if (isNative()) Preferences.set({ key, value }).catch(() => {});
  },

  removeItem(key: string): void {
    try { localStorage.removeItem(key); } catch { /* ok */ }
    if (isNative()) Preferences.remove({ key }).catch(() => {});
  },

  key(index: number): string | null {
    try { return localStorage.key(index); } catch { return null; }
  },

  get length(): number {
    try { return localStorage.length; } catch { return 0; }
  },
};

/**
 * Call once at app startup on native — copies Capacitor Preferences back
 * into localStorage so synchronous reads see persisted values even after
 * the user clears app storage.
 */
export async function initStorage(): Promise<void> {
  if (!isNative()) return;
  try {
    const { keys } = await Preferences.keys();
    await Promise.all(
      keys.map(async key => {
        const { value } = await Preferences.get({ key });
        if (value !== null) {
          try { localStorage.setItem(key, value); } catch { /* ok */ }
        }
      })
    );
  } catch { /* best-effort — don't block startup */ }
}
