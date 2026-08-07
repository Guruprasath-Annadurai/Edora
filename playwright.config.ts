import { defineConfig, devices } from '@playwright/test';

// E2E tests run against a local Vite dev server against this project's REAL
// Supabase backend — there is no dedicated test/staging Supabase project
// (see docs/e2e-testing.md). Tests must therefore stick to client-side-only
// behavior (rendering, navigation, form validation, UI state) and never
// submit real credentials or trigger a real auth/network call, so nothing
// here can write to production data or count against production rate limits.
export default defineConfig({
  testDir: './e2e',
  // e2e/authenticated/** requires a staging Supabase login (storageState from
  // auth.setup.ts) and runs only via playwright.staging.config.ts / npm run
  // test:e2e:staging. Without this exclusion, this config's own testDir glob
  // picks those specs up too and runs them against an unauthenticated local
  // dev server, where every one of them fails/times out waiting for
  // authenticated UI that never renders (confirmed live in CI run 31204012174).
  testIgnore: ['**/authenticated/**'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  // 'list' alone produces no artifact on disk — a CI failure had nothing to
  // upload beyond raw log text. Adding the 'html' reporter so a real,
  // inspectable report (with screenshots/traces) exists for the "upload on
  // failure" CI step to actually capture.
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://localhost:8100',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8100',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // Surface the dev server's own boot output (e.g. a crash on startup) in
    // CI logs instead of swallowing it — this would have made the missing-
    // secrets failure below obvious immediately instead of needing a log dig.
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
