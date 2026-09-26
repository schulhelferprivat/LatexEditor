import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test, expect } from '../fixture';

for (const [platform, recommended] of [
  ['Win32', 'Windows (x64)'],
  ['MacIntel', 'macOS (Apple Silicon / ARM64)'],
]) {
  test(`Pages bietet beide Downloads an und empfiehlt ${recommended}`, async ({ page, context }) => {
    await page.addInitScript((platform) => {
      localStorage.setItem('install-dismissed', '1');
      Object.defineProperty(navigator, 'platform', { value: platform });
      Object.defineProperty(navigator, 'userAgentData', { value: { platform } });
    }, platform);
    await page.route('**/api/v1/**', (route) => route.abort());
    await page.goto('./');
    const banner = page.locator('.bridge-offline');
    await expect(banner).toContainText('Bridge nicht erreichbar');
    await expect(banner.getByRole('link', { name: `${recommended} (empfohlen)`, exact: true })).toBeVisible();
    for (const [label, file] of [
      ['Windows (x64)', 'LatexHelper-Bridge-Windows.exe'],
      ['macOS (Apple Silicon / ARM64)', 'LatexHelper-Bridge-macOS-arm64.zip'],
    ]) {
      const link = banner.getByRole('link', {
        name: label + (label === recommended ? ' (empfohlen)' : ''),
        exact: true,
      });
      await expect(link).toHaveAttribute('href', `${new URL(page.url()).pathname}downloads/${file}`);
      const downloaded = page.waitForEvent('download');
      await link.click();
      const download = await downloaded;
      expect(download.suggestedFilename()).toBe(file);
      const data = await readFile((await download.path())!);
      const expected = await readFile(`dist/downloads/${file}.sha256`, 'utf8');
      expect(`${createHash('sha256').update(data).digest('hex')}  ${file}\n`).toBe(expected);
      const checksumDownloaded = page.waitForEvent('download');
      await banner.getByRole('link', { name: `SHA-256 für ${label}`, exact: true }).click();
      const checksum = await checksumDownloaded;
      expect(await readFile((await checksum.path())!, 'utf8')).toBe(expected);
    }
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    expect(
      await page.evaluate(async () => {
        const keys = await caches.keys();
        const requests = await Promise.all(keys.map(async (key) => (await caches.open(key)).keys()));
        return requests.flat().some((request) => new URL(request.url).pathname.includes('/downloads/'));
      }),
    ).toBe(false);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Neu beginnen' })).toBeVisible();
    await context.setOffline(false);
  });
}
