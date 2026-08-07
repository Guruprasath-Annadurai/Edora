import { defineConfig, devices } from '@playwright/test';

// Phase 4 (authenticated E2E test foundation) — a SEPARATE config from
// playwright.config.ts, deliberately. The original config's whole design
// (see its own header comment and docs/e2e-testing.md) is scoped to
// client-side-only behavior specifically BECAUSE no staging project existed
// yet and every test ran against production's real Supabase project. Gate 2
// (4.1.0 staging environment) changed that: edora-staging now exists,
// fully schema-bootstrapped (178/178 migrations verified), isolated from
// production, with a dedicated disposable E2E test account seeded directly
// in its database (never production — see e2e/authenticated/auth.setup.ts).
// This config points the dev server and every spec under e2e/authenticated/
// at that staging project via `vite --mode staging`, so real login, real
// authenticated navigation, and real data mutation are finally safe to test.
//
// Run via: npm run test:e2e:staging (see package.json)
export default defineConfig({
  testDir: './e2e/authenticated',
  fullyParallel: false, // shared staging data + a single seeded account — avoid cross-test races
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-staging', open: 'never' }]],
  use: {
    baseURL: 'http://localhost:8101',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/authenticated/.auth/e2e-test-user.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'npm run dev:staging',
    url: 'http://localhost:8101',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
