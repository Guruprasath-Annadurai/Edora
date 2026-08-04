import { test, expect } from '@playwright/test';

// Scope note (see playwright.config.ts and docs/e2e-testing.md): there is no
// dedicated test Supabase project, so these tests never submit real
// credentials or trigger an actual auth network call — only client-side
// rendering, navigation, and form-state behavior that can't touch
// production data or auth rate limits.

test.describe('Login page', () => {
  test('loads and shows the sign-in form by default', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    await expect(page.getByPlaceholder('Email address')).toBeVisible();
    await expect(page.getByPlaceholder('Password', { exact: true })).toBeVisible();
  });

  test('switching to Sign Up mode reveals the name and confirm-password fields', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign Up' }).first().click();
    await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();
    await expect(page.getByPlaceholder('Your full name')).toBeVisible();
    await expect(page.getByPlaceholder('Confirm password')).toBeVisible();
  });

  test('switching back to Sign In hides the signup-only fields again', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign Up' }).first().click();
    await expect(page.getByPlaceholder('Your full name')).toBeVisible();

    await page.getByRole('button', { name: 'Sign In' }).first().click();
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    await expect(page.getByPlaceholder('Your full name')).not.toBeVisible();
  });

  test('submitting the sign-in form with an empty password shows a client-side validation error without any network call', async ({ page }) => {
    let authRequestFired = false;
    page.on('request', req => {
      if (req.url().includes('/auth/v1/')) authRequestFired = true;
    });

    await page.goto('/login');
    await page.getByPlaceholder('Email address').fill('someone@example.com');
    // Password left empty on purpose.
    await page.getByRole('button', { name: 'Sign In' }).last().click();

    await expect(page.getByText('Please enter your password.')).toBeVisible();
    expect(authRequestFired).toBe(false);
  });

  test('the "Forgot password?" link opens the reset-password modal', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /forgot password/i }).click();
    await expect(page.getByRole('heading', { name: 'Reset Password' })).toBeVisible();
  });

  test('the password field is masked by default and the show/hide toggle works', async ({ page }) => {
    await page.goto('/login');
    const passwordInput = page.getByPlaceholder('Password', { exact: true });
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // The eye-icon toggle button sits immediately after the password input.
    await passwordInput.locator('xpath=following-sibling::button[1]').click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
  });
});
