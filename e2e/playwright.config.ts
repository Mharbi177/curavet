import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration.
 *
 * These specs run against a *real* stack (Postgres + Redis + API + both
 * dashboards). Locally the API and the two Vite dev servers are started
 * automatically below; in CI the stack is expected to be already running
 * (typically `docker compose up -d postgres redis api salon-admin super-admin`):
 *
 *   pnpm --filter api db:migrate && pnpm --filter api seed
 *   pnpm e2e
 */
const SALON_URL = process.env.E2E_SALON_URL ?? 'http://localhost:5173';
const SUPER_URL = process.env.E2E_SUPER_URL ?? 'http://localhost:5174';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Booking and messaging flows are timing sensitive; a retry hides real flakes.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: SALON_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
  },

  projects: [
    {
      name: 'salon-admin',
      use: { ...devices['Desktop Chrome'], baseURL: SALON_URL },
      testIgnore: /super-admin\.spec\.ts/,
    },
    {
      name: 'super-admin',
      testMatch: /super-admin\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: SUPER_URL },
    },
  ],

  webServer: process.env.CI
    ? undefined
    : [
        {
          // Reuse an already-running stack when one is up.
          command: 'pnpm --filter api start',
          url: `${API_URL}/health`,
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: 'pnpm --filter salon-admin exec vite --port 5173 --strictPort',
          url: SALON_URL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: 'pnpm --filter super-admin exec vite --port 5174 --strictPort',
          url: SUPER_URL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      ],
});

