import { test, expect } from './fixture';

test('browserseitiges Kontextmenü ist global deaktiviert', async ({ page }) => {
  await page.goto('/');
  const prevented = await page.evaluate(() => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
});
