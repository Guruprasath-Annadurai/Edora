import { useEffect, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { storage } from '@/lib/storage';

// ── Smart timing helpers ──────────────────────────────────────────────────────

const ACTIVITY_KEY = 'edora_activity_hours';
const PUSH_RATIONALE_SHOWN_KEY = 'edora_push_rationale_shown';

/** Record the current UTC hour each time the user opens the app. */
function recordActivityHour() {
  try {
    const hour = new Date().getUTCHours();
    const raw  = storage.getItem(ACTIVITY_KEY);
    const counts: number[] = raw ? JSON.parse(raw) : new Array(24).fill(0);
    counts[hour] = (counts[hour] ?? 0) + 1;
    // Keep array exactly 24 elements
    storage.setItem(ACTIVITY_KEY, JSON.stringify(counts.slice(0, 24)));
  } catch { /* silently skip */ }
}

/** Return the UTC hour (0-23) the user is most consistently active, fallback 18 (6 PM). */
function preferredStudyHourUTC(): number {
  try {
    const raw = storage.getItem(ACTIVITY_KEY);
    if (!raw) return 18;
    const counts: number[] = JSON.parse(raw);
    let best = 18, max = 0;
    counts.forEach((v, h) => { if (v > max) { max = v; best = h; } });
    return best;
  } catch {
    return 18;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

interface UsePushNotificationsResult {
  /** True when the pre-permission rationale sheet should be shown */
  showRationale: boolean;
  /** Call when user taps Allow on the rationale sheet */
  onRationaleAllow: () => void;
  /** Call when user taps Not Now / dismisses */
  onRationaleDeny: () => void;
}

export function usePushNotifications(): UsePushNotificationsResult {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showRationale, setShowRationale] = useState(false);
  const [userDecided, setUserDecided]     = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !user) return;

    recordActivityHour();

    // Show our rationale sheet first — only once, only on native
    const alreadyShown = storage.getItem(PUSH_RATIONALE_SHOWN_KEY) === 'true';
    if (!alreadyShown && !userDecided) {
      // Delay slightly so the home screen has time to settle
      const t = setTimeout(() => setShowRationale(true), 3_000);
      return () => clearTimeout(t);
    }
  }, [user, userDecided]);

  async function doRegister(mounted: { value: boolean }) {
    const { receive } = await PushNotifications.requestPermissions();
    if (receive !== 'granted' || !mounted.value) return;
    await PushNotifications.register();
  }

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !user) return;
    const alreadyShown = storage.getItem(PUSH_RATIONALE_SHOWN_KEY) === 'true';
    // If rationale was already shown in a prior session, register directly
    if (!alreadyShown) return;

    const mounted = { value: true };
    doRegister(mounted).catch(console.error);

    const listeners = [
      PushNotifications.addListener('registration', async ({ value: token }) => {
        const studyHourUTC = preferredStudyHourUTC();
        const payload = {
          push_token:            token,
          push_token_updated_at: new Date().toISOString(),
          preferred_study_hour:  studyHourUTC,
        };

        const { error } = await supabase.from('profiles').update(payload).eq('id', user.id);
        if (!error) return;

        console.error('[Push] token save failed (attempt 1) — retrying in 5 s:', error.message);
        await new Promise(r => setTimeout(r, 5_000));
        if (!mounted.value) return;

        const { error: retryErr } = await supabase.from('profiles').update(payload).eq('id', user.id);
        if (retryErr) {
          console.error('[Push] token save failed after retry — push notifications disabled this session:', retryErr.message);
        }
      }),

      PushNotifications.addListener('registrationError', ({ error }) => {
        console.error('[Push] registration error:', error);
      }),

      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('[Push] received in foreground:', notification.title);
      }),

      PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
        const data = notification.data as Record<string, string> | undefined;
        const route = data?.route;
        if (route) navigate(route, { replace: false });
      }),
    ];

    return () => {
      mounted.value = false;
      listeners.forEach(p => p.then(l => l.remove()).catch(() => {}));
    };
  }, [user, navigate, userDecided]);

  const onRationaleAllow = useCallback(() => {
    storage.setItem(PUSH_RATIONALE_SHOWN_KEY, 'true');
    setShowRationale(false);
    setUserDecided(true);
    // doRegister is now triggered by the userDecided effect above re-evaluating
    const mounted = { value: true };
    PushNotifications.requestPermissions().then(({ receive }) => {
      if (receive !== 'granted' || !mounted.value) return;
      return PushNotifications.register();
    }).catch(console.error);
  }, []);

  const onRationaleDeny = useCallback(() => {
    storage.setItem(PUSH_RATIONALE_SHOWN_KEY, 'true'); // don't ask again
    setShowRationale(false);
    setUserDecided(true);
  }, []);

  return { showRationale, onRationaleAllow, onRationaleDeny };
}
