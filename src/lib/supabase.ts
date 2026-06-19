import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const capacitorStorage = {
  getItem: async (key: string) => {
    const { value } = await Preferences.get({ key });
    return value;
  },
  setItem: async (key: string, value: string) => {
    await Preferences.set({ key, value });
  },
  removeItem: async (key: string) => {
    await Preferences.remove({ key });
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: Capacitor.isNativePlatform() ? (capacitorStorage as any) : window.localStorage,
    autoRefreshToken: true,
    persistSession: true,
    // On web: detect session tokens passed in URL fragment (used by native→web payment redirect)
    // On native: false to avoid interference with deep links
    detectSessionInUrl: !Capacitor.isNativePlatform(),
    flowType: 'pkce',
  },
});
