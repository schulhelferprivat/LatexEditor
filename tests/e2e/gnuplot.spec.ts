import { test, expect } from './fixture';

test('Gnuplot-Pfad prüfen, übernehmen und automatische Suche wiederherstellen', async ({ page }) => {
  const caps = {
    version: '1',
    engines: ['lualatex'],
    tools: ['lualatex'],
    gnuplotDir: null as string | null,
    gnuplotPath: null as string | null,
  };
  let refreshes = 0;
  const paths: (string | null)[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    if (url.endsWith('/session')) return route.fulfill({ json: { token: 'test', capabilities: caps } });
    if (url.endsWith('/gnuplot-dir')) {
      const { dir } = route.request().postDataJSON();
      paths.push(dir);
      if (dir === 'missing') return route.fulfill({ status: 400, body: 'Gnuplot nicht gefunden.' });
      caps.gnuplotDir = dir;
      caps.gnuplotPath = String.raw`C:\Program Files\gnuplot\bin\gnuplot.exe`;
      caps.tools = ['lualatex', 'gnuplot'];
      return route.fulfill({ json: caps });
    }
    if (url.endsWith('/capabilities/refresh')) {
      refreshes++;
      return route.fulfill({ json: caps });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Neu beginnen' }).click();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  const shell = page.getByLabel('Shell Escape für dieses Dokument aktivieren');
  await expect(shell).toBeChecked();
  await shell.uncheck();
  const input = page.getByLabel('Gnuplot-Installationspfad');
  const apply = page.getByRole('button', { name: 'Gnuplot-Pfad übernehmen' });
  const dir = String.raw`C:\Program Files\gnuplot`;
  await input.fill(dir);
  await apply.click();
  await expect(
    page.getByText('Erkannt: ' + String.raw`C:\Program Files\gnuplot\bin\gnuplot.exe`, { exact: true }),
  ).toBeVisible();
  await input.fill('missing');
  await apply.click();
  await expect(page.getByText('Gnuplot nicht gefunden.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fertig', exact: true }).click();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await expect(input).toHaveValue(dir);
  await expect(shell).not.toBeChecked();
  await input.fill('');
  await apply.click();
  await expect.poll(() => paths).toEqual([dir, 'missing', null]);
  await page.getByRole('button', { name: 'Erneut prüfen' }).click();
  await expect.poll(() => refreshes).toBe(1);
  await expect(shell).not.toBeChecked();
});
