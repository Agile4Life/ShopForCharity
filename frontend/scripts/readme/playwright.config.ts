import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from '../../playwright.config';

const server = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer;

export default defineConfig({
  testDir: '.',
  testMatch: 'capture.spec.ts',
  outputDir: '../../../.tools/readme-capture',
  reporter: 'list',
  workers: 1,
  timeout: 90_000,
  use: { ...base.use, reducedMotion: 'reduce' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 960 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: { ...server, cwd: fileURLToPath(new URL('../../', import.meta.url)) },
});
