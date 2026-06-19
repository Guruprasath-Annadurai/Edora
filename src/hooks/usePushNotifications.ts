import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { storage } from '@/lib/storage';

// ── Smart timing helpers ──────────────────────────────────────────────────────

const ACTIVITY_KEY = 'edora_activity_hours';

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

export function usePushNotifications() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !user) return;

    // Track when the user opens the app to infer study times
    recordActivityHour();

    let mounted = true;

    async function register() {
      const { receive } = await PushNotifications.requestPermissions();
      if (receive !== 'granted' || !mounted) return;
      await PushNotifications.register();
    }

    register().catch(console.error);

    const listeners = [
      PushNotifications.addListener('registration', async ({ value: token }) => {
        const studyHourUTC = preferredStudyHourUTC();
        // Store token + preferred study hour so the server can schedule
        // push notifications at the right time rather than a fixed hour
        const payload = {
          push_token:            token,
          push_token_updated_at: new Date().toISOString(),
          preferred_study_hour:  studyHourUTC,
        };

        const { error } = await supabase.from('profiles').update(payload).eq('id', user.id);
        if (!error) return;

        // First attempt failed — retry once after 5 s (handles transient network hiccup on launch)
        console.error('[Push] token save failed (attempt 1) — retrying in 5 s:', error.message);
        await new Promise(r => setTimeout(r, 5_000));
        if (!mounted) return;

        const { error: retryErr } = await supabase.from('profiles').update(payload).eq('id', user.id);
        if (retryErr) {
          // Both attempts failed — student won't receive push notifications this session.
          // DB write failure at this point is a backend problem, not a user error.
          console.error('[Push] token save failed after retry — push notifications disabled this session:', retryErr.message);
        }
      }),

      PushNotifications.addListener('registrationError', ({ error }) => {
        console.error('[Push] registration error:', error);
      }),

      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        // Notification received while app is in foreground — no action needed,
        // iOS/Android shows it via presentationOptions in capacitor.config.ts
        console.log('[Push] received in foreground:', notification.title);
      }),

      PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
        // User tapped the notification — route to the right screen
        const data = notification.data as Record<string, string> | undefined;
        const route = data?.route;
        if (route) navigate(route, { replace: false });
      }),
    ];

    return () => {
      mounted = false;
      listeners.forEach(p => p.then(l => l.remove()).catch(() => {}));
    };
  }, [user, navigate]);
}
