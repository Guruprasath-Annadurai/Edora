// ── Centralised logger ────────────────────────────────────────────────────────
//
// In development  : logs to the browser console as normal.
// In production   : error() routes to Sentry (if configured); warn/log are
//                   no-ops to keep the DevTools console clean for end-users.
//
// Usage:
//   import { logger } from '@/lib/logger';
//   logger.error('[ChatPage] history load failed', error);
//   logger.warn('[ChatPage] slow response', ms);
//
// Do NOT import this in ErrorBoundary — those calls must go directly to Sentry
// because the React error cycle may prevent module imports from running.

import * as Sentry from '@sentry/react';

const isDev  = import.meta.env.DEV;
const isProd = import.meta.env.PROD;

function captureToSentry(args: unknown[]) {
  if (!isProd) return;
  const first = args[0];
  if (first instanceof Error) {
    Sentry.captureException(first, { extra: { args: args.slice(1) } });
  } else if (typeof first === 'string') {
    Sentry.captureMessage(first, { level: 'error', extra: { args: args.slice(1) } });
  }
}

export const logger = {
  // Errors: always send to Sentry in prod; console.error in dev.
  error: (...args: unknown[]): void => {
    if (isDev) {
      console.error(...args);
    } else {
      captureToSentry(args);
    }
  },

  // Warnings: console.warn in dev only.
  warn: (...args: unknown[]): void => {
    if (isDev) console.warn(...args);
  },

  // Info/debug: console.log in dev only.
  log: (...args: unknown[]): void => {
    if (isDev) console.log(...args);
  },
};
