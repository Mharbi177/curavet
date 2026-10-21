import { expect, test } from '@playwright/test';
import { API_URL, seedSalon } from './helpers';

export { API_URL, seedSalon };

test.describe('salon-admin authentication', () => {
  test('rejects an invalid password', async ({ page }) => {
    const salon = await seedSalon(`auth-${Date.now()}`);

    await page.goto('/login');
    await page.getByLabel(/email/i).fill(salon.email);
    await page.getByLabel(/password/i).fill('definitely-wrong');
    await page.getByRole('button', { name: /sign in|log ?in/i }).click();

    await expect(page.getByText(/invalid|incorrect|failed/i).first()).toBeVisible();
  });

  test('signs a salon owner in and lands on the dashboard', async ({ page }) => {
    const salon = await seedSalon(`login-${Date.now()}`);

    await page.goto('/login');
    await page.getByLabel(/email/i).fill(salon.email);
    await page.getByLabel(/password/i).fill(salon.password);
    await page.getByRole('button', { name: /sign in|log ?in/i }).click();

    await expect(page).toHaveURL(/dashboard/i, { timeout: 20_000 });
    await expect(page.getByText(/today/i).first()).toBeVisible();
  });

  test('keeps an unauthenticated visitor out of the dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/login/i, { timeout: 20_000 });
  });
});
