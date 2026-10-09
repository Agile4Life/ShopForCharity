import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-integrated',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 25_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/integrated', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    screenshot: 'only-on-failure',
    // Real authentication requests contain tokens/passwords; do not record them in traces.
    trace: 'off',
    actionTimeout: 20000,
    navigationTimeout: 20000,
    serviceWorkers: 'block',
  },
  projects: [{ name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node ../backend/scripts/playwright-integration-server.mjs',
      url: 'http://127.0.0.1:8080/actuator/health/readiness',
      timeout: 90_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
