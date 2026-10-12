import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

const server = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer;

export default defineConfig({
  ...base,
  workers: 2,
  timeout: 90_000,
  testMatch: /(?:responsive|mobile-usability|welcome-intro|catalog-checkout|controls|chat|scroll-motion)\.spec\.ts/,
  use: { ...base.use, baseURL: 'http://127.0.0.1:4181' },
  outputDir: '../.tools/mobile-verification',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/mobile' }]],
  webServer: {
    ...server,
    command: 'npm run build -- --outDir .tools/mobile-dist && npm run preview -- --outDir .tools/mobile-dist --host 127.0.0.1 --port 4181 --strictPort',
    url: 'http://127.0.0.1:4181',
  },
  projects: [
    { name: 'android-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'] } },
  ],
});
