import { test, expect } from '@playwright/test';

// Phase 4 (authenticated E2E test foundation) — sign-out is the one
// authenticated flow every session eventually exercises.
//
// IMPORTANT: supabase-js's signOut() defaults to scope: 'global', which
// revokes the refresh token SERVER-SIDE — not just in this browser context.
// If this test reused the shared storageState (e2e/authenticated/.auth/
// e2e-test-user.json, written once by auth.setup.ts), it would invalidate
// that session for every other spec in the run, and the outcome would
// depend on file-execution order, which Playwright does not guarantee.
// So this test opts out of the shared storageState and logs in fresh via
// the real UI (same steps as auth.setup.ts), making it fully self-contained
// and safe to run in any order relative to the rest of the suite.
test.use({ storageState: { cookies: [], origins: [] } });

const E2E_EMAIL = 'e2e-test@edora-staging.internal';
const E2E_PASSWORD = 'E2eTestPassw0rd!2026';

test('user can sign out from the profile page', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('Email address').fill(E2E_EMAIL);
  await page.getByPlaceholder('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).last().click();
  await page.waitForURL(/\/home/, { timeout: 15_000 });

  await page.goto('/profile');
  await expect(page.getByText('Page Error')).not.toBeVisible();

  await page.getByRole('button', { name: 'Sign Out' }).first().click();
  await expect(page.getByText('Sign out?')).toBeVisible();

  await page.getByRole('button', { name: 'Sign Out' }).last().click();

  await page.waitForURL(/\/login/, { timeout: 10_000 });
  await expect(page.getByPlaceholder('Email address')).toBeVisible();
});
