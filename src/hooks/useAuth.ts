import { useState, useEffect, useRef } from 'react';
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types';
import { initRevenueCat } from '@/lib/iap';
import { clearUserQueue } from '@/lib/syncQueue';

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

// Refresh the access token when < 10 minutes remain, checked every 4 minutes.
// This prevents the "Session Expired" modal from appearing mid-quiz when the
// 60-minute access token silently expires while the student is working.
const TOKEN_REFRESH_INTERVAL_MS = 4 * 60 * 1000;  // 4 min
const TOKEN_REFRESH_THRESHOLD_MS = 10 * 60 * 1000; // refresh if < 10 min left

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null, session: null, profile: null,
    loading: true, profileLoading: false,
    profileError: false, sessionExpired: false,
  });
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    // ── Proactive token refresh ────────────────────────────────────────────
    // Poll every 4 minutes; if the access token expires in < 10 minutes,
    // refresh it immediately so in-progress quizzes/lessons are never blocked.
    refreshTimerRef.current = setInterval(async () => {
      const { data: { session: current } } = await supabase.auth.getSession();
      if (!current?.expires_at) return;
      const msLeft = current.expires_at * 1000 - Date.now();
      if (msLeft < TOKEN_REFRESH_THRESHOLD_MS) {
        const { error } = await supabase.auth.refreshSession();
        if (error) console.warn('[useAuth] proactive refresh failed:', error.message);
      }
    }, TOKEN_REFRESH_INTERVAL_MS);

    return () => {
      subscription.unsubscribe();
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const userId = state.user?.id;
    try {
      await supabase.auth.signOut();
    } catch (err) {
      // Sign-out failed (network error) — still clear local state so the user
      // isn't stuck on a shared device. The session will expire server-side.
      console.warn('[useAuth] signOut network error (continuing local clear):', (err as Error)?.message);
    } finally {
      // Clear all per-user and app-level data from localStorage
      const keysToRemove = Object.keys(localStorage).filter(k => k.startsWith('edora_'));
      keysToRemove.forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
      // Clear offline sync queue for this user (don't leak it to next session)
      if (userId) clearUserQueue(userId);
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      setState({ user: null, session: null, profile: null, loading: false, profileLoading: false, profileError: false, sessionExpired: false });
    }
  }

  function clearSessionExpired() {
    setState(prev => ({ ...prev, sessionExpired: false }));
  }

  return { ...state, signOut, refetchProfile, setProfile, clearSessionExpired };
}
