import { test, expect } from '@playwright/test';

// Phase 4 (authenticated E2E test foundation) — profile-editing round trip.
// Verifies a genuine write path: change the display name, save, reload the
// page fresh (forcing a real re-fetch from the staging DB, not just client
// state), and confirm the new value persisted. This is the same profiles
// table the /login race-condition bug (see App.tsx, enterprise/430) reads
// from, so it doubles as a regression guard for that fix's data path.
test('display name edit persists after reload', async ({ page }) => {
  await page.goto('/account');
  await expect(page.getByText('Page Error')).not.toBeVisible();

  const nameInput = page.getByLabel('Display name');
  await expect(nameInput).toBeVisible();

  const uniqueName = `E2E Test User ${Date.now()}`;
  await nameInput.fill(uniqueName);

  // Wait for the actual PATCH to resolve before reloading — the previous
  // version of this test only waited for the "Saving…" button label to
  // disappear, which can read as "already gone" if the click is observed
  // before React ever flips `saving` to true, letting the reload race ahead
  // of (and cancel) the in-flight request. That produced a flaky-looking
  // "save silently did nothing" failure with no app bug behind it.
  const savePatch = page.waitForResponse(res =>
    res.url().includes('/rest/v1/profiles') && res.request().method() === 'PATCH'
  );
  await page.getByRole('button', { name: /Save Changes/ }).click();
  const patchResponse = await savePatch;
  expect(patchResponse.ok()).toBe(true);

  await page.reload();

  // Reload re-triggers AuthGuard's loading state (session + profile re-fetch)
  // before AccountSettingsPage remounts, so give it the same budget as the
  // initial login flow rather than the default 5s.
  await expect(page.getByLabel('Display name')).toHaveValue(uniqueName, { timeout: 15_000 });
});
