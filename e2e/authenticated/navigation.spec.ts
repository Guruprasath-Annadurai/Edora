import { test, expect } from '@playwright/test';

// Phase 4 (authenticated E2E test foundation) — core logged-in navigation.
// Reuses the storageState saved by auth.setup.ts (see playwright.staging.config.ts),
// so every test here starts already signed in as the seeded staging E2E account.
//
// NOTE on scope: the enterprise remediation mandate's original phrasing referenced
// "~30 authenticated flows" but no concrete list of those 30 flows exists anywhere
// in this repo's docs (checked docs/e2e-testing.md and the full enterprise/ tree).
// The flows below are a reconstruction, built directly from the app's real route
// table (src/App.tsx) and component structure — not a recovery of an original list.
// They prioritize the highest-traffic authenticated surfaces: tab-bar navigation,
// profile/account management, and the sign-out flow, since those are shared
// infrastructure that every other authenticated journey depends on.

// Scoped to the nav landmark (TabBar's own aria-label="Main navigation") —
// several pages (HomePage, ChatPage) also render their own in-content links
// whose accessible names happen to contain "Novo", so an unscoped
// getByRole('link', { name: 'Novo' }) is ambiguous (strict-mode violation).
function tabLink(page: import('@playwright/test').Page, name: string) {
  return page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name, exact: true });
}

test.describe('authenticated tab-bar navigation', () => {
  test('lands on /home after auth setup', async ({ page }) => {
    await page.goto('/home');
    await expect(page).toHaveURL(/\/home/);
    await expect(page.getByText('Page Error')).not.toBeVisible();
  });

  test('Learn tab navigates to /learning', async ({ page }) => {
    await page.goto('/home');
    await tabLink(page, 'Learn').click();
    await expect(page).toHaveURL(/\/learning/);
    await expect(page.getByText('Page Error')).not.toBeVisible();
  });

  test('Novo tab navigates to /chat', async ({ page }) => {
    await page.goto('/home');
    await tabLink(page, 'Novo').click();
    await expect(page).toHaveURL(/\/chat/);
    await expect(page.getByText('Page Error')).not.toBeVisible();
    await expect(page.getByPlaceholder('Ask Novo or say "quiz me on…"')).toBeVisible();
  });

  test('Battle tab navigates to /battle', async ({ page }) => {
    await page.goto('/home');
    await tabLink(page, 'Battle').click();
    await expect(page).toHaveURL(/\/battle/);
    await expect(page.getByText('Page Error')).not.toBeVisible();
  });

  test('Profile tab navigates to /profile', async ({ page }) => {
    await page.goto('/home');
    await tabLink(page, 'Profile').click();
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.getByText('Page Error')).not.toBeVisible();
  });

  test('Home tab returns to /home from a different tab', async ({ page }) => {
    await page.goto('/profile');
    await tabLink(page, 'Home').click();
    await expect(page).toHaveURL(/\/home/);
  });
});
