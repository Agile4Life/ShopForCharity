import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

process.env.PLAYWRIGHT_BROWSERS_PATH ||= fileURLToPath(new URL('./.browsers', import.meta.url));
export default defineConfig({
  testDir: './e2e-chat-live', outputDir: './.tools/chat-live-results',
  globalSetup: './e2e-chat-live/setup.ts', globalTeardown: './e2e-chat-live/teardown.ts',
  workers: 1, fullyParallel: false, retries: 0, timeout: 120000,
  expect: { timeout: 20000 }, reporter: [['list'], ['html', { outputFolder: 'playwright-report/chat-live', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'off', screenshot: 'only-on-failure', serviceWorkers: 'block' },
  projects: [{ name: 'desktop-chromium', use: devices['Desktop Chrome'] }, { name: 'mobile-chromium', use: devices['Pixel 7'] }],
  webServer: [
    { command: 'node ../backend/scripts/chat-live-server.mjs', url: 'http://127.0.0.1:8081/actuator/health/readiness', timeout: 45000, reuseExistingServer: false },
    { command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort', url: 'http://127.0.0.1:5174', timeout: 30000, reuseExistingServer: false,
      env: { VITE_API_BASE_URL: 'http://127.0.0.1:8081/api/v1' } },
  ],
});
