import { test, expect } from '../e2e/fixture';
test('Produktions-PWA ist installierbar, lädt offline und prüft lokal Rechtschreibung', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(message.text());
  });
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const session = await context.newCDPSession(page);
  const manifest = await session.send('Page.getAppManifest');
  expect(manifest.errors).toEqual([]);
  expect(JSON.parse(manifest.data!).file_handlers[0].accept['application/x-tex']).toContain('.tex');
  const installability = await session.send('Page.getInstallabilityErrors');
  expect(installability.installabilityErrors).toEqual([]);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Neu beginnen' })).toBeVisible();
  await page.getByRole('button', { name: 'Neu beginnen' }).click();
  const editor = page.getByRole('textbox', { name: 'LaTeX-Quelltext' });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Ein grober Rechtschreibfehhler.');
  await expect.poll(() => page.locator('.cm-lintRange-info').count()).toBeGreaterThan(0);
  await page.getByRole('combobox', { name: 'Sprache der Rechtschreibprüfung' }).selectOption('en');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('A spelling mistakke.');
  await expect.poll(() => page.locator('.cm-lintRange-info').count()).toBeGreaterThan(0);
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
test('Browser, echte Bridge, LuaLaTeX und PDF.js bauen und synchronisieren ein Dokument', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(message.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem('preamble', JSON.stringify({ enabled: false, text: '' }));
    let directory: FileSystemDirectoryHandle;
    const prepare = async () => {
      directory = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('Dokument', { create: true });
      const file = await directory.getFileHandle('main.tex', { create: true });
      const stream = await file.createWritable();
      await stream.write(
        '\\documentclass{article}\n\\begin{document}\nHallo Welt. Das ist ein echter Build.\n\\end{document}',
      );
      await stream.close();
      return file;
    };
    Object.defineProperty(window, 'showOpenFilePicker', { value: async () => [await prepare()] });
    Object.defineProperty(window, 'showDirectoryPicker', { value: async () => directory });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Einstellungen' });
  await expect(settings.getByRole('heading', { name: 'Bridge-Verwaltung' })).toBeVisible();
  await expect(settings.getByText(/Erkannt:.*lualatex/)).toBeVisible();
  await settings.getByRole('button', { name: 'Fertig' }).click();
  await page.getByRole('button', { name: 'Dokument öffnen', exact: true }).click();
  await page.getByRole('button', { name: 'Kompilieren' }).click();
  await expect(page.locator('.pdf-page')).toHaveCount(1, { timeout: 45000 });
  await expect(page.locator('.textLayer')).toContainText('Hallo Welt');
  const editor = page.getByRole('textbox', { name: 'LaTeX-Quelltext' });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.getByRole('button', { name: 'Im PDF zeigen' }).click();
  await expect(page.locator('.pdf-marker')).toBeVisible();
  await page.locator('.pdf-marker').evaluate((marker) => {
    const event = new MouseEvent('click', {
      bubbles: true,
      ctrlKey: true,
      clientX: marker.getBoundingClientRect().left + 8,
      clientY: marker.getBoundingClientRect().top + 8,
    });
    marker.parentElement!.dispatchEvent(event);
  });
  await expect(editor).toBeFocused();
  await page.screenshot({ path: 'test-results/production-build.png', fullPage: true });
  await page.keyboard.type('Neu');
  await expect(page.getByText('Veraltet', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Im PDF zeigen' })).toBeDisabled();
  expect(errors).toEqual([]);
});
