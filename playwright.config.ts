import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    viewport: { width: 1440, height: 960 },
    launchOptions: {
      executablePath:
        process.env.LATEXHELPER_CHROME ??
        (existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome' : undefined),
    },
  },
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
  reporter: 'list',
});
