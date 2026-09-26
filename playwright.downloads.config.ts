import { defineConfig } from '@playwright/test';

const base = process.env.LATEXHELPER_BASE ?? '/LatexEditor/';
export default defineConfig({
  testDir: 'tests/downloads',
  workers: 1,
  timeout: 60000,
  use: { baseURL: `http://localhost:4173${base}`, headless: true },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --host localhost --port 4173 --strictPort',
    env: { LATEXHELPER_BASE: base },
    url: `http://localhost:4173${base}`,
    reuseExistingServer: false,
  },
  reporter: 'list',
});
