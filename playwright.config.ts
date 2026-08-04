import { defineConfig, devices } from '@playwright/test';

// E2E tests run against a local Vite dev server against this project's REAL
// Supabase backend — there is no dedicated test/staging Supabase project
// (see docs/e2e-testing.md). Tests must therefore stick to client-side-only
// behavior (rendering, navigation, form validation, UI state) and never
// submit real credentials or trigger a real auth/network call, so nothing
// here can write to production data or count against production rate limits.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8100',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8100',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
