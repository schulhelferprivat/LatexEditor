import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/production',
  workers: 1,
  timeout: 60000,
  use: { baseURL: 'http://localhost:38471', headless: true, viewport: { width: 1440, height: 960 } },
  webServer: {
    command: 'node scripts/test-server.mjs',
    url: 'http://localhost:38471',
    reuseExistingServer: false,
  },
  reporter: 'list',
});
