import { useState, useEffect, useRef, useContext, createContext, type ReactNode } from 'react';
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

// `useAuth()` used to be a plain hook: every one of its ~90 call sites across
// the app ran its OWN independent copy of this state machine — its own
// getSession() call, its own onAuthStateChange subscription, its own
// fetchProfile(). Nothing was actually shared. That meant e.g. AuthGuard's
// "profile is ready" could resolve on ITS copy while a page component
// mounted moments later (AccountSettingsPage, the /login route, etc.) was
// still sitting on ITS OWN copy's initial profile:null, because that
// instance's fetch hadn't resolved yet — every consumer raced independently.
// Root-caused via the authenticated E2E suite: AccountSettingsPage's
// "Save Changes" silently no-opped (profile was null in its closure) even
// though the page visibly showed the user's real data, sourced from a
// DIFFERENT useAuth() instance's state. Fixed by hoisting the state machine
// into a single Context Provider (mounted once in App.tsx) so every
// consumer reads the SAME resolved state instead of racing its own copy.
const AuthContext = createContext<ReturnType<typeof useAuthState> | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuthState();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() must be used within <AuthProvider>');
  return ctx;
}

function useAuthState() {
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
        if (error) {
          console.warn('[useAuth] proactive refresh failed:', error.message);
          // Previously silent otherwise — a genuinely dead refresh token (the
          // server explicitly rejecting it, status 400/401) left the user
          // sitting on a session that would only fail on their *next* real
          // action, with no SessionExpiredModal shown until then. A network-
          // level failure (no status — e.g. offline) is left alone; it'll
          // just retry on the next 4-minute tick.
          const status = (error as { status?: number }).status;
          if (status === 400 || status === 401) {
            setState(prev => ({ ...prev, sessionExpired: true }));
          }
        }
      }
    }, TOKEN_REFRESH_INTERVAL_MS);

    return () => {
      subscription.unsubscribe();
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dedupe concurrent fetchProfile calls for the same user. On every page
  // load, supabase.auth.getSession().then(...) below AND onAuthStateChange's
  // INITIAL_SESSION event (which supabase-js fires on subscribe, independent
  // of getSession()) both trigger a fetchProfile for the same userId within
  // the same tick. Without this guard, two concurrent requests race, and
  // whichever resolves *last* wins the setState — if that one hits a
  // transient PGRST116 (e.g. a cold connection under CI load), it silently
  // nulls out a profile the other, correct, response had just set. Found via
  // the account-settings E2E round-trip test: a hard page.reload() reliably
  // reproduced a blank profile despite the DB row being fully populated.
  const profileFetchInFlightRef = useRef<{ userId: string; promise: Promise<Profile | null> } | null>(null);

  async function fetchProfile(userId: string, attempt = 0): Promise<Profile | null> {
    if (attempt === 0 && profileFetchInFlightRef.current?.userId === userId) {
      return profileFetchInFlightRef.current.promise;
    }
    const promise = fetchProfileImpl(userId, attempt);
    if (attempt === 0) {
      profileFetchInFlightRef.current = { userId, promise };
      void promise.finally(() => {
        if (profileFetchInFlightRef.current?.promise === promise) profileFetchInFlightRef.current = null;
      });
    }
    return promise;
  }

  async function fetchProfileImpl(userId: string, attempt: number): Promise<Profile | null> {
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
      // scope: 'local' — supabase-js defaults to 'global', which revokes the
      // refresh token for EVERY session the user has (all devices/tabs), not
      // just this one. Surfaced by the authenticated E2E suite: signing out
      // one throwaway test session silently killed every other test's
      // already-authenticated session mid-run. A real user tapping "Sign
      // Out" on their phone would have the same surprise: it would also log
      // them out of their web session elsewhere. Consumer apps expect
      // "sign out" to end only the current session.
      await supabase.auth.signOut({ scope: 'local' });
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
