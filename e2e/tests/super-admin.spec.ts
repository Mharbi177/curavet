import { expect, test } from '@playwright/test';
import { SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD } from './helpers';

/**
 * The platform console. Runs against `E2E_SUPER_URL` (the super-admin project's
 * baseURL) and exercises the real login flow against the API.
 */
test.describe('super-admin console', () => {
  test('keeps an unauthenticated visitor out of the dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/login/i, { timeout: 20_000 });
  });

  test('renders the landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/glambot/i).first()).toBeVisible();
  });

  test('signs a platform super-admin in', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel(/email/i).fill(SUPERADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(SUPERADMIN_PASSWORD);
    await page.getByRole('button', { name: /sign in|log ?in/i }).click();

    await expect(page).toHaveURL(/dashboard/i, { timeout: 20_000 });
    await expect(page.getByText(/overview/i).first()).toBeVisible();
  });
});
