import { test as base, expect } from '../fixture';

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => localStorage.setItem('install-dismissed', '1'));
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/v1/session')
        return route.fulfill({
          json: {
            token: 'test',
            capabilities: { version: '1', engines: ['lualatex'], tools: ['lualatex', 'synctex'] },
          },
        });
      return route.fulfill({ json: {} });
    });
    await use(page);
  },
});

export { expect };
