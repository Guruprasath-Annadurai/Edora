import { useState, useEffect } from 'react';
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types';
import { initRevenueCat } from '@/lib/iap';

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  /** true if the profile row could not be fetched (network/DB error) */
  profileError: boolean;
  /** true if the session expired and the user needs to re-login */
  sessionExpired: boolean;
}

// Only re-fetch the profile when the user identity actually changes.
// TOKEN_REFRESHED, PASSWORD_RECOVERY, MFA_CHALLENGE_VERIFIED, etc. must NOT
// reset profileLoading — that clobbers in-flight profile state during navigation.
const PROFILE_FETCH_EVENTS = new Set<AuthChangeEvent>([
  'SIGNED_IN',
  'INITIAL_SESSION',
  'USER_UPDATED',
]);

// Exponential back-off delays for transient DB/network errors (ms)
const RETRY_DELAYS_MS = [400, 800, 1600];

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null, session: null, profile: null,
    loading: true, profileLoading: false,
    profileError: false, sessionExpired: false,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState(prev => ({
        ...prev,
        user: session?.user ?? null,
        session,
        loading: false,
        profileLoading: !!session?.user,
      }));
      if (session?.user) {
        fetchProfile(session.user.id);
        initRevenueCat(session.user.id).catch(err =>
          console.error('[useAuth] RevenueCat init error:', (err as Error)?.message ?? err)
        );
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const isSignOut = event === 'SIGNED_OUT';
      const shouldFetch = PROFILE_FETCH_EVENTS.has(event) && !!session?.user;

      setState(prev => {
        // Use prev.user (not stale closure) to detect unexpected sign-outs
        const isUnexpectedSignOut = isSignOut && prev.user !== null && !session;
        return {
          ...prev,
          user: session?.user ?? null,
          session,
          loading: false,
          // Only flip profileLoading for events that actually trigger a fetch
          profileLoading: shouldFetch ? true : (isSignOut ? false : prev.profileLoading),
          profileError: isSignOut ? false : prev.profileError,
          profile: isSignOut ? null : prev.profile,
          sessionExpired: isUnexpectedSignOut,
        };
      });

      if (shouldFetch) {
        fetchProfile(session!.user!.id);
        initRevenueCat(session!.user!.id).catch(err =>
          console.error('[useAuth] RevenueCat init error:', (err as Error)?.message ?? err)
        );
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string, attempt = 0): Promise<Profile | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        // PGRST116 = row not found → user needs onboarding, not a hard error
        if (error.code === 'PGRST116') {
          setState(prev => ({ ...prev, profile: null, profileLoading: false, profileError: false }));
          return null;
        }
        // Transient DB/network error — retry with back-off before giving up
        if (attempt < RETRY_DELAYS_MS.length) {
          await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          return fetchProfile(userId, attempt + 1);
        }
        throw error;
      }

      setState(prev => ({ ...prev, profile: data as Profile, profileLoading: false, profileError: false }));
      return data as Profile;
    } catch (err) {
      console.error('[useAuth] fetchProfile error:', err);
      setState(prev => ({ ...prev, profile: null, profileLoading: false, profileError: true }));
      return null;
    }
  }

  async function refetchProfile(): Promise<Profile | null> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;
    setState(prev => ({ ...prev, profileLoading: true, profileError: false }));
    return fetchProfile(session.user.id);
  }

  // Directly inject a known-good profile into global state.
  // Call this after a successful upsert instead of a DB round-trip — eliminates
  // the read-after-write window and the React setState/navigation race condition.
  function setProfile(profile: Profile) {
    setState(prev => ({ ...prev, profile, profileLoading: false, profileError: false }));
  }

  async function signOut() {
    await supabase.auth.signOut();
    setState(prev => ({ ...prev, profile: null, profileLoading: false, profileError: false, sessionExpired: false }));
  }

  function clearSessionExpired() {
    setState(prev => ({ ...prev, sessionExpired: false }));
  }

  return { ...state, signOut, refetchProfile, setProfile, clearSessionExpired };
}
