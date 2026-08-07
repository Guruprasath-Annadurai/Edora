import { test as setup, expect } from '@playwright/test';

// Phase 4 (authenticated E2E test foundation) — logs in once as the dedicated
// staging-only E2E test account (created directly in edora-staging's
// auth.users/profiles, never production — see docs/e2e-testing.md) and saves
// the resulting session to disk. Every authenticated spec in this directory
// reuses that saved storageState instead of re-logging-in per test, per
// Playwright's own recommended pattern for auth-gated suites.
//
// This runs as its own Playwright "project" with dependents (see
// playwright.staging.config.ts), guaranteeing it always executes first.

const STORAGE_STATE_PATH = 'e2e/authenticated/.auth/e2e-test-user.json';

const E2E_EMAIL = 'e2e-test@edora-staging.internal';
const E2E_PASSWORD = 'E2eTestPassw0rd!2026';

setup('authenticate as the staging E2E test user', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('Email address').fill(E2E_EMAIL);
  await page.getByPlaceholder('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).last().click();

  // Real login hits the network; wait for the redirect off /login rather
  // than a fixed timeout, so this fails loudly (not flakily) if auth breaks.
  await page.waitForURL(/\/(home|onboarding)/, { timeout: 15_000 });

  // The test account has a fully-seeded profile (exam_name, dpdp_consent_at
  // already set directly in the DB — see docs/e2e-testing.md), so it should
  // land on /home, not /onboarding. Assert this explicitly: an unexpected
  // /onboarding redirect means the seed profile silently regressed.
  await expect(page).toHaveURL(/\/home/);

  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
