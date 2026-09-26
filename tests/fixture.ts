import { test as base, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';

export const test = base.extend({
  context: async ({ playwright, baseURL }, use) => {
    const profile = await mkdtemp(path.join(tmpdir(), 'latexhelper-browser-test-'));
    const context = await playwright.chromium.launchPersistentContext(profile, {
      headless: true,
      baseURL,
      viewport: { width: 1440, height: 960 },
      executablePath:
        process.env.LATEXHELPER_CHROME ??
        (existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome' : undefined),
    });
    try {
      await use(context);
    } finally {
      await context.close();
      await rm(profile, { recursive: true, force: true });
    }
  },
});

export { expect };
