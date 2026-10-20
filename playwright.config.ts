import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:4175/posledniy-zachet/',
    viewport: { width: 1280, height: 800 },
    reducedMotion: 'reduce',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175/posledniy-zachet/',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
