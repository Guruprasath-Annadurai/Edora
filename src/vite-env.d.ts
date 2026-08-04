/// <reference types="vite/client" />

interface ImportMetaEnv {
  // ── Supabase (public — safe to expose in client bundle) ──────
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;

  // ── Google OAuth (public client ID) ──────────────────────────
  readonly VITE_GOOGLE_CLIENT_ID: string;

  // ── Observability ─────────────────────────────────────────────
  readonly VITE_APP_VERSION: string;
  // Injected by vite.config.ts's `define` block, not a real env var — see
  // src/pages/settings/DiagnosticsPage.tsx for where this is surfaced.
  readonly VITE_BUILD_SHA: string;
  readonly VITE_BUILD_TIME: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;

  // ── DO NOT ADD API KEYS HERE ──────────────────────────────────
  // Gemini and ElevenLabs keys live server-side only.
  // They are set via: supabase secrets set KEY=value
  // and accessed exclusively inside Supabase Edge Functions.
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
