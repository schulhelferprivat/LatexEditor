import { test, expect } from './fixture';
import type { Page } from '@playwright/test';
async function files(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('preamble'))
      localStorage.setItem('preamble', JSON.stringify({ enabled: false, text: '' }));
    const prepare = async () => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('Dokumente', { create: true });
      async function seed(name: string, text: string) {
        const file = await dir.getFileHandle(name, { create: true });
        if (!(await file.getFile()).size) {
          const stream = await file.createWritable();
          await stream.write(text);
          await stream.close();
        }
        return file;
      }
      const first = await seed(
        'erste.tex',
        '\\documentclass{article}\n\\begin{document}\nHallo Welt\n\\end{document}',
      );
      const second = await seed(
        'zweite.tex',
        '\\documentclass{article}\n\\begin{document}\nZweiter Text\n\\end{document}',
      );
      return { dir, first, second };
    };
    let index = 0;
    Object.defineProperty(window, 'showOpenFilePicker', {
      value: async () => {
        const f = await prepare();
        return [index++ === 0 ? f.first : f.second];
      },
    });
    Object.defineProperty(window, 'showDirectoryPicker', { value: async () => (await prepare()).dir });
    Object.defineProperty(window, 'showSaveFilePicker', { value: async () => (await prepare()).first });
  });
}
function pdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream = 'BT /F1 18 Tf 70 740 Td (Hallo Welt) Tj ET';
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  objects.push(
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  );
  let result = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(result));
    result += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(result);
  result +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n')
      .join('');
  result += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(result);
}
test('Meldungszeile springt zur Fehlerstelle, Kopieren bleibt separat', async ({ page }) => {
  await files(page);
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/session')
      return route.fulfill({
        json: {
          token: 'session',
          capabilities: { version: '1', engines: ['lualatex'], tools: ['lualatex'] },
        },
      });
    if (path === '/api/v1/workspaces') return route.fulfill({ json: { id: 'workspace' } });
    if (path === '/api/v1/builds') return route.fulfill({ json: { id: 'job' } });
    if (path === '/api/v1/builds/job')
      return route.fulfill({
        json: {
          id: 'job',
          state: 'done',
          progress: 'Fehlgeschlagen',
          results: [
            {
              variant: 'arbeitsblatt',
              ok: false,
              diagnostics: [{ severity: 'error', message: 'Unbekannter Befehl', file: 'erste.tex', line: 3 }],
              log: 'Unbekannter Befehl',
            },
          ],
        },
      });
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Dokument öffnen', exact: true }).click();
  await page.getByRole('button', { name: 'Kompilieren' }).click();
  const dialog = page.getByRole('dialog', { name: 'Fehler & Protokoll' });
  await expect(dialog).toBeVisible();
  const diagnostic = dialog.locator('.diagnostic');
  await expect(diagnostic.getByRole('button', { name: 'Unbekannter Befehl erste.tex:3' })).toBeVisible();
  await diagnostic.getByRole('button', { name: 'Meldung kopieren' }).click();
  await expect(dialog).toBeVisible();
  await diagnostic.getByText('Unbekannter Befehl').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.cm-jump-highlight')).toContainText('Hallo Welt');
});
test('Speichern, Entwurf, PDF-Zoom, Final-Export und Wiederöffnung', async ({ page }) => {
  await files(page);
  const requests: string[] = [];
  const errors: string[] = [];
  let nextStatus: Promise<void> | undefined;
  let requestedVariants = ['arbeitsblatt'];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push(`${request.method()} ${url.pathname}`);
    if (url.pathname === '/api/v1/session')
      return route.fulfill({
        json: {
          token: 'session',
          capabilities: {
            preamble: true,
            version: '1',
            engines: ['lualatex'],
            tools: ['synctex', 'lualatex'],
          },
        },
      });
    if (url.pathname === '/api/v1/workspaces') return route.fulfill({ json: { id: 'workspace' } });
    if (url.pathname === '/api/v1/builds') {
      requestedVariants = request.postDataJSON().variants.map((variant: { id: string }) => variant.id);
      return route.fulfill({ json: { id: 'job' } });
    }
    if (url.pathname === '/api/v1/builds/job') {
      if (nextStatus) {
        await nextStatus;
        nextStatus = undefined;
        return route.fulfill({
          json: { id: 'job', state: 'cancelled', progress: 'Abgebrochen', results: [] },
        });
      }
      return route.fulfill({
        json: {
          id: 'job',
          state: 'done',
          progress: 'Fertig',
          results: requestedVariants.map((variant) => ({
            variant,
            ok: true,
            artifact: variant,
            diagnostics: [],
            log: 'Output written.',
          })),
        },
      });
    }
    if (url.pathname.includes('/pdf/')) return route.fulfill({ contentType: 'application/pdf', body: pdf() });
    if (url.pathname.includes('/sync/'))
      return route.fulfill({
        json: request.postDataJSON()?.page
          ? [{ file: 'erste.tex', line: 3, column: 1 }]
          : [{ page: 1, x: 70, y: 102 }],
      });
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Dokument öffnen', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'LaTeX-Quelltext' });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\nText');
  expect(requests.some((request) => request === 'POST /api/v1/builds')).toBe(false);
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByText('Ungespeicherte Änderungen')).toHaveCount(0);
  await page.getByRole('button', { name: 'Kompilieren' }).click();
  await expect(page.locator('.pdf-page')).toHaveCount(2);
  await expect
    .poll(() =>
      page
        .locator('.pdf-page canvas')
        .first()
        .evaluate((canvas) => (canvas as HTMLCanvasElement).width),
    )
    .toBeGreaterThan(100);
  await expect(page.locator('.textLayer').first()).toContainText('Hallo Welt');
  const text = page.locator('.textLayer span').first();
  const box = (await text.boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const lens = page.locator('.pdf-lens');
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await expect(lens).toBeVisible();
  const inkHeight = await lens.locator('canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const rows: number[] = [];
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (data[(y * canvas.width + x) * 4] < 100) {
          rows.push(y);
          break;
        }
      }
    }
    return (Math.max(...rows) - Math.min(...rows) + 1) / window.devicePixelRatio;
  });
  expect(inkHeight).toBeGreaterThan(box.height);
  await page.mouse.move(center.x + 15, center.y + 10);
  await expect.poll(async () => (await lens.boundingBox())!.x).toBeCloseTo(center.x + 15 - 100, 0);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('');
  await page.mouse.up();
  await expect(lens).toBeHidden();
  const paper = (await page.locator('.pdf-page').first().boundingBox())!;
  await page.mouse.move(paper.x + 2, paper.y + 2);
  await page.mouse.down();
  await expect(lens).toBeVisible();
  await page.mouse.move(paper.x - 10, paper.y + 2);
  await expect(lens).toBeHidden();
  await page.mouse.move(center.x, center.y);
  await expect(lens).toBeVisible();
  await page.mouse.move(10, 10);
  await page.mouse.up();
  await expect(lens).toBeHidden();
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await expect(lens).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(lens).toBeHidden();
  await page.mouse.up();
  for (const event of ['pointercancel', 'scroll']) {
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await expect(lens).toBeVisible();
    await page.locator('.pdf-scroll').evaluate((host, type) => {
      if (type === 'pointercancel') {
        for (let id = 1; id < 10; id++) {
          if (host.hasPointerCapture(id)) host.dispatchEvent(new PointerEvent(type, { pointerId: id }));
        }
      } else host.dispatchEvent(new Event(type));
    }, event);
    await expect(lens).toBeHidden();
    await page.mouse.up();
  }
  await page.keyboard.down('Control');
  await page.mouse.click(center.x, center.y);
  await page.keyboard.up('Control');
  await expect(lens).toBeHidden();
  await expect.poll(() => requests.some((request) => request.includes('/sync/'))).toBe(true);
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          document.body.dataset.copied = text;
        },
      },
    });
  });
  await page.mouse.click(center.x, center.y, { button: 'right' });
  const menu = page.getByRole('menu', { name: 'PDF-Aktionen' });
  await expect(menu).toBeVisible();
  await page.getByRole('menuitem', { name: 'Kopieren', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-copied', 'Hallo Welt');
  await expect(menu).toBeHidden();
  await page.mouse.click(center.x, center.y, { button: 'right' });
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Im Quelltext finden' })).toBeFocused();
  const syncBefore = requests.filter((request) => request.includes('/sync/')).length;
  await page.keyboard.press('Enter');
  await expect
    .poll(() => requests.filter((request) => request.includes('/sync/')).length)
    .toBe(syncBefore + 1);
  await page.mouse.click(paper.x + 5, paper.y + 5, { button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Kopieren', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
    });
  });
  await page.mouse.click(center.x, center.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Kopieren', exact: true }).click();
  await expect(
    page.getByText('Text konnte nicht in die Zwischenablage kopiert werden.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Präambel', exact: true }).click();
  await page.getByLabel('LaTeX-Präambel').fill('discarded');
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await page.getByRole('button', { name: 'Präambel', exact: true }).click();
  await expect(page.getByLabel('LaTeX-Präambel')).toHaveValue('');
  await page.getByLabel('LaTeX-Präambel').fill('\\documentclass{article}');
  await page.getByRole('checkbox', { name: 'Gemeinsame Präambel verwenden' }).check();
  await page.getByRole('button', { name: 'Übernehmen', exact: true }).click();
  await page.mouse.click(center.x, center.y, { button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Im Quelltext finden' })).toBeDisabled();
  await page.keyboard.press('Escape');
  let entries = await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('Dokumente');
    const names = [];
    for await (const [name] of dir.entries()) names.push(name);
    return names;
  });
  expect(entries).not.toContain('erste (Arbeitsblatt).pdf');
  await page.getByRole('button', { name: 'Kompilieren' }).click();
  await page.getByRole('button', { name: 'An Seite anpassen' }).click();
  await page.getByRole('radio', { name: 'Endversion' }).check();
  await page.getByRole('button', { name: 'Kompilieren' }).click();
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('Dokumente');
        try {
          return (await (await dir.getFileHandle('erste (Arbeitsblatt).pdf')).getFile()).size;
        } catch {
          return 0;
        }
      }),
    )
    .toBeGreaterThan(100);
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('Dokumente');
        try {
          return (await (await dir.getFileHandle('erste (Lösung).pdf')).getFile()).size;
        } catch {
          return 0;
        }
      }),
    )
    .toBeGreaterThan(100);
  await page.locator('.pdf-page').first().scrollIntoViewIfNeeded();
  await expect(text).toHaveText('Hallo Welt');
  let releaseStatus!: () => void;
  nextStatus = new Promise<void>((resolve) => {
    releaseStatus = resolve;
  });
  const compile = page.getByRole('button', { name: 'Kompilieren' });
  const compileSize = await compile.boundingBox();
  await compile.click();
  await expect(page.getByRole('radio', { name: 'Entwurf' })).toBeDisabled();
  await expect(page.getByRole('radio', { name: 'Endversion' })).toBeDisabled();
  const progress = page.getByRole('button', { name: 'Abbrechen' });
  await expect(progress).toBeVisible();
  await expect(progress.locator('svg')).toHaveCSS('animation-name', 'build-spin');
  const progressSize = await progress.boundingBox();
  expect(progressSize?.width).toBe(compileSize?.width);
  expect(progressSize?.height).toBe(compileSize?.height);
  await progress.click();
  releaseStatus();
  await expect(page.getByRole('button', { name: 'Kompilieren' })).toBeVisible();
  expect(requests).toContain('POST /api/v1/builds/job/cancel');
  const beforeSwitch = (await text.boundingBox())!;
  await page.mouse.move(beforeSwitch.x + 5, beforeSwitch.y + 5);
  await page.mouse.down();
  await expect(lens).toBeVisible();
  await page
    .getByRole('button', { name: 'Öffnen', exact: true })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await expect(lens).toBeHidden();
  await page.mouse.up();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByRole('tab', { name: 'zweite.tex' })).toHaveAttribute('aria-selected', 'true');
  await page.reload();
  await expect(page.getByRole('tab')).toHaveCount(1);
  await expect(page.getByRole('tab')).toContainText('zweite.tex');
  await page.getByRole('button', { name: 'Präambel', exact: true }).click();
  await expect(page.getByLabel('LaTeX-Präambel')).toHaveValue('\\documentclass{article}');
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  expect(errors).toEqual([]);
});
