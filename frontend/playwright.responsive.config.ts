import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';
const server = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer;

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: 'http://127.0.0.1:4174' },
  webServer: {
    ...server,
    command: `${process.env.E2E_REUSE_BUILD ? '' : 'npm run build && '}npm run preview -- --host 127.0.0.1 --port 4174 --strictPort`,
    url: 'http://127.0.0.1:4174',
  },
  testMatch: /(?:responsive|hover|catalog-checkout|controls|pickup-schedule)\.spec\.ts/,
  outputDir: './.tools/responsive-cross-browser',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/responsive-cross-browser' }], ['junit', { outputFile: '.tools/responsive-cross-browser.xml' }]],
  projects: [
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
