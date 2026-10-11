import { defineConfig, devices } from '@playwright/test';
import base from './playwright.responsive.config';
const server = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer;

export default defineConfig({
  ...base,
  testMatch: /chat\.spec\.ts/,
  webServer: {
    ...server,
    command: 'npm run build -- --outDir .tools/chat-browser-dist && npm run preview -- --outDir .tools/chat-browser-dist --host 127.0.0.1 --port 4174 --strictPort',
  },
  projects: [
    ...(base.projects || []),
    { name: 'desktop-chromium', use: devices['Desktop Chrome'] },
    { name: 'mobile-chromium', use: devices['Pixel 7'] },
  ],
  outputDir: './.tools/chat-cross-browser',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/chat-cross-browser' }]],
});
