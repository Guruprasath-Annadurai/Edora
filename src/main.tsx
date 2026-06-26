import './styles/globals.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { initAnalytics } from '@/lib/analytics';
import { runOfflinePrefetch, startConnectivityListener } from '@/lib/offlineStudy';
import { initStorage } from '@/lib/storage';
import App from './App';

// ── Sentry — only initialises when DSN is present (skipped in dev without key) ──
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    release: import.meta.env.VITE_APP_VERSION as string | undefined,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
      // Capture unhandled promise rejections (edge function failures, etc.)
      Sentry.extraErrorDataIntegration({ depth: 5 }),
    ],
    tracesSampleRate:           import.meta.env.PROD ? 0.1 : 1.0,
    replaysSessionSampleRate:   0.05,
    replaysOnErrorSampleRate:   1.0,
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
  });
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
      requestAnimationFrame(() => {
        SplashScreen.hide({ fadeOutDuration: 500 });
      });
    });
  }

  // Start connectivity listener — flushes sync queue when back online
  startConnectivityListener();

  // Run offline prefetch on startup (WiFi + 6h throttle)
  setTimeout(() => { runOfflinePrefetch().catch(() => {}); }, 3000);
}

bootstrap();

// ── Global unhandled rejection safety net ────────────────────────────────────
// Supabase calls outside try/catch can throw on complete network failure.
// Sentry's browserTracingIntegration captures these automatically when configured,
// but we add an explicit handler so they're never silently swallowed in dev.
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason as unknown;
  if (sentryDsn && reason instanceof Error) {
    Sentry.captureException(reason, { extra: { source: 'unhandledrejection' } });
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
