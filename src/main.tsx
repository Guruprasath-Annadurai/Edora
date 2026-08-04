import './styles/globals.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
// @sentry/capacitor wraps @sentry/react and adds the native bridge (Android/
// iOS crash + ANR/OOM capture) — previously only @sentry/react was used, so
// WebView crashes and OOM kills happened below the JS layer and were
// invisible; they only ever surfaced to you as an unexplained app restart.
// Sentry.init() below comes from @sentry/capacitor; the integrations
// (browserTracingIntegration etc.) still come from @sentry/react — the
// capacitor init call takes sentryReactInit as its second argument and
// calls it internally, which is what actually wires those integrations up.
import * as Sentry from '@sentry/capacitor';
import { init as sentryReactInit, browserTracingIntegration, replayIntegration, extraErrorDataIntegration } from '@sentry/react';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { initAnalytics } from '@/lib/analytics';
import { runOfflinePrefetch, startConnectivityListener } from '@/lib/offlineStudy';
import { initStorage } from '@/lib/storage';
import { seedRagCache } from '@/lib/ragCache';
import { supabase } from '@/lib/supabase';
import App from './App';

// ── Sentry — only initialises when DSN is present (skipped in dev without key) ──
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    release: import.meta.env.VITE_APP_VERSION as string | undefined,
    environment: import.meta.env.MODE,
    integrations: [
      browserTracingIntegration(),
      // @sentry/capacitor doesn't re-export replayIntegration itself and its
      // bundled (nested) @sentry/replay type declaration is a version behind
      // the hoisted @sentry/react one this repo otherwise uses — sessionSampleRate/
      // errorSampleRate are valid, documented replayIntegration options at
      // runtime (this is exactly the same feature @sentry/react's replay
      // integration provides), but the type checker resolves two different
      // declaration files for the "same" package here. The cast is a type-
      // level workaround for that duplicate-install mismatch, not a runtime one.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (replayIntegration as (opts: any) => ReturnType<typeof replayIntegration>)({ maskAllText: false, blockAllMedia: false, sessionSampleRate: 0.05, errorSampleRate: 1.0 }),
      // Capture unhandled promise rejections (edge function failures, etc.)
      extraErrorDataIntegration({ depth: 5 }),
    ],
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    // Tag every event with platform + version for filtering in Sentry dashboard
    initialScope: {
      tags: {
        platform:    Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web',
        app_version: import.meta.env.VITE_APP_VERSION ?? 'unknown',
      },
    },
    // Alert on new errors — configure in Sentry dashboard → Alerts → Error rate > 1%
    beforeSend(event) {
      // Don't send errors from Safari private browsing (IDB access denied noise)
      if (event.exception?.values?.[0]?.value?.includes('IDBDatabase')) return null;
      return event;
    },
  }, sentryReactInit);
}

// ── Production console suppression ───────────────────────────────────────────
// All [Tag] console.error/warn/log calls across the codebase are dev diagnostics.
// In production, errors are captured by Sentry above; warn/log are pure noise.
// ErrorBoundary uses Sentry.captureException directly so this override is safe.
if (import.meta.env.PROD) {
  const _noop = () => {};
  console.warn  = _noop;
  console.log   = _noop;
  console.info  = _noop;
  console.debug = _noop;
  // console.error intentionally kept — Sentry's SDK instruments it to capture
  // any errors that slip through un-caught (belt-and-suspenders).
}

// ── PostHog ──────────────────────────────────────────────────────────────────
initAnalytics();

// Safety net: capacitor.config.ts sets launchAutoHide:false so the native
// splash (with the real logo) stays up until bootstrap() explicitly hides it
// — that fixed a bug where a fixed-duration auto-hide revealed a blank WebView
// mid-boot. The tradeoff is that if bootstrap() ever throws before reaching
// its own hide() call, the splash would now hang forever instead of clearing.
// This timeout guarantees it always clears eventually even in that case.
let splashHidden = false;
function hideSplashOnce() {
  if (splashHidden) return;
  splashHidden = true;
  SplashScreen.hide({ fadeOutDuration: 500 }).catch(() => {});
}
if (Capacitor.isNativePlatform()) {
  setTimeout(hideSplashOnce, 8000);
}

async function bootstrap() {
  if (document.fonts) await document.fonts.ready;
  await initStorage(); // restore Capacitor Preferences → localStorage on native

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  if (Capacitor.isNativePlatform()) {
    requestAnimationFrame(() => {
      requestAnimationFrame(hideSplashOnce);
    });
  }

  // Start connectivity listener — flushes sync queue when back online
  startConnectivityListener();

  // Run offline prefetch on startup (WiFi + 6h throttle)
  setTimeout(() => { runOfflinePrefetch().catch(() => {}); }, 3000);

  // Seed RAG offline cache with popular cached Q&A (delayed — non-blocking)
  setTimeout(() => {
    seedRagCache(async () => {
      const { data } = await supabase
        .from('rag_query_cache')
        .select('query_text, response_text')
        .gt('hit_count', 3)            // only well-hit entries worth caching offline
        .order('hit_count', { ascending: false })
        .limit(300);
      return (data ?? []) as Array<{ query_text: string; response_text: string }>;
    }).catch(() => {});
  }, 8000);
}

bootstrap();

// ── Global unhandled rejection safety net ────────────────────────────────────
// Supabase calls outside try/catch can throw on complete network failure.
// Sentry's browserTracingIntegration captures these automatically when configured,
// but we add an explicit handler so they're never silently swallowed in dev.
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason as unknown;
  if (!sentryDsn) return;
  // Supabase-js commonly rejects with plain PostgrestError/AuthError-shaped
  // objects that are NOT `instanceof Error` — the old `instanceof Error`
  // check silently dropped most Supabase-originated rejections here.
  if (reason instanceof Error) {
    Sentry.captureException(reason, { extra: { source: 'unhandledrejection' } });
  } else if (reason && typeof reason === 'object') {
    Sentry.captureException(new Error(`Unhandled rejection: ${JSON.stringify(reason).slice(0, 500)}`), {
      extra: { source: 'unhandledrejection', original: reason },
    });
  }
});

// ── Service worker — web only (skipped inside Capacitor native shell) ─────────
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // SW registration failure is non-fatal
    });
  });
}
