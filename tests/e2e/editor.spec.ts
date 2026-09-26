import { test, expect } from './fixture';
test('leerer Arbeitsplatz, Editor und Snippets funktionieren ohne automatische Builds', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const builds: string[] = [];
  await page.route('**/api/v1/**', (route) => {
    if (route.request().url().endsWith('/builds')) builds.push(route.request().url());
    return route.fulfill({
      status: 200,
      json: {
        token: 'test',
        capabilities: { version: '1', engines: ['lualatex'], tools: ['lualatex', 'synctex'] },
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Neu beginnen' }).click();
  await page.getByRole('radio', { name: 'Endversion' }).check();
  const editor = page.getByRole('textbox', { name: 'LaTeX-Quelltext' });
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\nEin lesbarer Text.');
  await expect(page.getByRole('tab')).toHaveAccessibleName('Unbenannt.tex Ungespeichert');
  await page.getByRole('button', { name: 'Mathe', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Bruch', exact: true }).click();
  await expect(editor).toContainText('\\frac{Zähler}{Nenner}');
  await editor.focus();
  await page.keyboard.type('a');
  await page.keyboard.press('Tab');
  await page.keyboard.type('b');
  await expect(editor).toContainText('\\frac{a}{b}');
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(editor).toContainText('Nenner');
  await page.getByRole('button', { name: 'Suchen und Ersetzen' }).click();
  await expect(page.locator('.search-bar')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.search-bar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Varianten' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/editor.png', fullPage: true });
  expect(builds).toEqual([]);
  expect(errors).toEqual([]);
});
test('Suchen und Ersetzen nutzt einfache Teiltreffer und behält die Ersetzen-Aktionen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Neu beginnen' }).click();
  const editor = page.getByRole('textbox', { name: 'LaTeX-Quelltext' });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('Haus haus hausboot haus');
  await page.getByRole('button', { name: 'Suchen und Ersetzen' }).click();
  const search = page.getByRole('search', { name: 'Suchen und Ersetzen' });
  await expect(search.getByRole('button', { name: 'Nur ganzes Wort' })).toHaveCount(0);
  await expect(search.getByRole('button', { name: 'Regulärer Ausdruck' })).toHaveCount(0);
  await expect(search.getByRole('button', { name: 'Alle auswählen' })).toHaveCount(0);
  await expect(search.getByRole('button', { name: 'Alle ersetzen' })).toBeVisible();
  const find = search.getByRole('textbox', { name: 'Suchen' });
  await find.fill('h.us');
  await expect(search.getByText('0 Treffer')).toBeVisible();
  await find.fill('haus');
  await expect(search.getByText('4 Treffer')).toBeVisible();
  await search.getByRole('button', { name: 'Groß-/Kleinschreibung beachten' }).click();
  await expect(search.getByText('3 Treffer')).toBeVisible();
  await search.getByRole('button', { name: 'Nächster Treffer' }).click();
  await expect.poll(() => editor.evaluate(() => window.getSelection()?.toString())).toBe('haus');
  await search.getByRole('button', { name: 'Vorheriger Treffer' }).click();
  await expect.poll(() => editor.evaluate(() => window.getSelection()?.toString())).toBe('haus');
  await search.getByRole('textbox', { name: 'Ersetzen durch' }).fill('Baum');
  await search.getByRole('button', { name: 'Ersetzen', exact: true }).click();
  await expect(editor).toContainText('Baum');
  await search.getByRole('button', { name: 'Alle ersetzen' }).click();
  await expect(editor).toHaveText('Haus Baum Baumboot Baum');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('Alles');
  await expect(editor).toHaveText('Alles');
});
test('kommentiert markierte LaTeX-Zeilen über das Kontextmenü aus und wieder ein', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Neu beginnen' }).click();
  const editor = page.getByRole('textbox', { name: 'LaTeX-Quelltext' });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('Erste Zeile\n  Zweite Zeile\nDritte Zeile');
  const lines = page.locator('.cm-content .cm-line');
  const rightClickFirstLine = async () => {
    const box = (await lines.first().boundingBox())!;
    await page.mouse.click(box.x + 30, box.y + box.height / 2, { button: 'right' });
  };
  await rightClickFirstLine();
  const menu = page.getByRole('menu', { name: 'Quelltext-Aktionen' });
  await expect(menu.getByRole('menuitem', { name: 'Auskommentieren' })).toBeDisabled();
  await expect(menu.getByRole('menuitem', { name: 'Entkommentieren' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('Shift+End');
  await rightClickFirstLine();
  await expect(menu.getByRole('menuitem', { name: 'Auskommentieren' })).toBeEnabled();
  await expect(menu.getByRole('menuitem', { name: 'Entkommentieren' })).toBeEnabled();
  await menu.getByRole('menuitem', { name: 'Auskommentieren' }).click();
  await expect(lines.first()).toContainText(/^%/);
  await expect(lines.nth(1)).toHaveText('  Zweite Zeile');
  await expect(lines.nth(2)).toHaveText('Dritte Zeile');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await rightClickFirstLine();
  await menu.getByRole('menuitem', { name: 'Entkommentieren' }).click();
  await expect(lines).toHaveText(['Erste Zeile', '  Zweite Zeile', 'Dritte Zeile']);
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await rightClickFirstLine();
  await menu.getByRole('menuitem', { name: 'Auskommentieren' }).click();
  for (const line of await lines.allTextContents()) expect(line).toMatch(/^\s*%/);
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await rightClickFirstLine();
  await menu.getByRole('menuitem', { name: 'Entkommentieren' }).click();
  await expect(lines).toHaveText(['Erste Zeile', '  Zweite Zeile', 'Dritte Zeile']);
});
test('bereinigt markierten LaTeX-Code über das Kontextmenü', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Neu beginnen' }).click();
  const editor = page.getByRole('textbox', { name: 'LaTeX-Quelltext' });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(
    '\\begin{itemize}\n          \\item Erster Punkt\n                \\item Zweiter Punkt\n      \\end{itemize}',
  );
  const lines = page.locator('.cm-content .cm-line');
  const rightClickFirstLine = async () => {
    const box = (await lines.first().boundingBox())!;
    await page.mouse.click(box.x + 30, box.y + box.height / 2, { button: 'right' });
  };
  await rightClickFirstLine();
  const menu = page.getByRole('menu', { name: 'Quelltext-Aktionen' });
  await expect(menu.getByRole('menuitem', { name: 'Codebereinigung' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await rightClickFirstLine();
  await expect(menu.getByRole('menuitem', { name: 'Codebereinigung' })).toBeEnabled();
  await menu.getByRole('menuitem', { name: 'Codebereinigung' }).click();
  await expect(lines).toHaveText([
    '\\begin{itemize}',
    '\t\\item Erster Punkt',
    '\t\\item Zweiter Punkt',
    '\\end{itemize}',
  ]);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(lines).toHaveText([
    '\\begin{itemize}',
    '          \\item Erster Punkt',
    '                \\item Zweiter Punkt',
    '      \\end{itemize}',
  ]);
});
test('klappt mehrzeilige LaTeX-Umgebungen über die Zeilennummernleiste ein', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Neu beginnen' }).click();
  const editor = page.getByRole('textbox', { name: 'LaTeX-Quelltext' });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('\\begin{itemize}\n  \\item Eintrag\n\\end{itemize}');
  const fold = page.locator('.cm-foldGutter span:visible').first();
  await expect(fold).toHaveAttribute('title', 'Umgebung einklappen');
  await fold.click();
  const fadingOut = await page
    .locator('.cm-content .cm-line')
    .nth(1)
    .evaluate((line) => line.getAnimations().some((animation) => animation.playState === 'running'));
  expect(fadingOut).toBe(true);
  await expect(fold).toHaveAttribute('title', 'Umgebung ausklappen');
  await expect(page.locator('.cm-content')).toContainText('\\begin{itemize}');
  await expect(page.locator('.cm-content')).toContainText('\\end{itemize}');
  await expect(page.locator('.cm-content .cm-line')).toHaveCount(2);
  await expect(page.locator('.cm-content .cm-line').first()).toContainText('\\begin{itemize}');
  await expect(page.locator('.cm-content .cm-line').last()).toContainText('\\end{itemize}');
  await expect(page.locator('.cm-fold-gap-spacer')).toBeVisible();
  const gapMarker = page.locator('.cm-lineNumbers .cm-fold-gap-marker');
  await expect(gapMarker).toBeVisible();
  await expect(gapMarker).toHaveAttribute('aria-label', 'Eingeklappten Bereich ausklappen');
  const gapPosition = await gapMarker.evaluate((marker) => {
    const lines = [...document.querySelectorAll('.cm-content .cm-line')];
    const markerRect = marker.getBoundingClientRect();
    const number = [...document.querySelectorAll('.cm-lineNumbers .cm-gutterElement')].find(
      (element) => element.textContent?.trim() === '3',
    )!;
    const numberRange = document.createRange();
    numberRange.selectNodeContents(number);
    const numberRect = numberRange.getBoundingClientRect();
    const centerY = markerRect.top + markerRect.height / 2;
    const centerX = markerRect.left + markerRect.width / 2;
    return {
      betweenLines:
        centerY > lines[0].getBoundingClientRect().bottom && centerY < lines[1].getBoundingClientRect().top,
      horizontalOffset: centerX - (numberRect.left + numberRect.width / 2),
    };
  });
  expect(gapPosition.betweenLines).toBe(true);
  expect(Math.abs(gapPosition.horizontalOffset)).toBeLessThan(1);
  await expect(page.getByText('\\item Eintrag', { exact: true })).toHaveCount(0);
  await gapMarker.click();
  const fadingIn = await page
    .locator('.cm-content .cm-line')
    .nth(1)
    .evaluate((line) => line.getAnimations().some((animation) => animation.playState === 'running'));
  expect(fadingIn).toBe(true);
  await expect(fold).toHaveAttribute('title', 'Umgebung einklappen');
  await expect(page.locator('.cm-lineNumbers .cm-fold-gap-marker')).toHaveCount(0);
  await expect(page.locator('.cm-content')).toContainText('\\item Eintrag');
  await fold.click();
  await expect(gapMarker).toBeVisible();
  await fold.click();
  await expect(gapMarker).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('faltet verschachtelte Umgebungen und respektiert reduzierte Bewegung', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Neu beginnen' }).click();
  const editor = page.getByRole('textbox', { name: 'LaTeX-Quelltext' });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(
    '\\begin{itemize}\n  \\begin{enumerate}\n    \\item Eintrag\n  \\end{enumerate}\n\\end{itemize}',
  );
  const folds = page.locator('.cm-foldGutter span:visible');
  await expect(folds).toHaveCount(2);
  await folds.first().click();
  expect(await page.locator('.cm-content').textContent()).not.toContain('\\item Eintrag');
  await expect(page.locator('.cm-fold-gap-marker')).toBeVisible();
  await expect(page.getByText('\\item Eintrag', { exact: true })).toHaveCount(0);
  await page.locator('.cm-fold-gap-marker').click();
  await expect(folds).toHaveCount(2);
  await folds.last().click();
  await expect(page.locator('.cm-fold-gap-marker')).toBeVisible();
  await expect(page.locator('.cm-content')).toContainText('\\end{itemize}');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('ControlOrMeta+Shift+BracketLeft');
  await expect(folds.first()).toHaveAttribute('title', 'Umgebung ausklappen');
  await page.keyboard.press('ControlOrMeta+Shift+BracketRight');
  await expect(folds.first()).toHaveAttribute('title', 'Umgebung einklappen');
});
test('zentriert den Button für ein neues Dokument in der Tab-Leiste', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Neu beginnen' }).click();
  const offset = await page.getByRole('button', { name: 'Neues Dokument' }).evaluate((button) => {
    const buttonRect = button.getBoundingClientRect();
    const tabsRect = button.closest('.tabs')!.getBoundingClientRect();
    return buttonRect.top + buttonRect.height / 2 - tabsRect.top - tabsRect.height / 2;
  });
  expect(Math.abs(offset)).toBeLessThan(1);
});
test('bietet die Endversion ohne Variantenauswahl an', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Neu beginnen' }).click();
  await expect(page.getByRole('button', { name: 'Varianten' })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Endversion' })).toBeEnabled();
});
test('Kompiliermodus und Lösung gelten während der Sitzung für alle Dokumente', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Neu beginnen' }).click();
  const solution = page.getByRole('checkbox', { name: 'Lösung' });
  const modes = page.getByRole('radiogroup', { name: 'Kompiliermodus' });
  const draft = modes.getByRole('radio', { name: 'Entwurf' });
  const final = modes.getByRole('radio', { name: 'Endversion' });
  const compile = page.getByRole('button', { name: 'Kompilieren' });
  await expect(solution).toBeEnabled();
  await expect(solution).not.toBeChecked();
  await expect(draft).toBeChecked();
  await expect(final).not.toBeChecked();
  await expect(compile).toHaveCount(1);
  const solutionPosition = await solution.boundingBox();
  const draftPosition = await draft.boundingBox();
  expect(solutionPosition!.x + solutionPosition!.width).toBeLessThan(draftPosition!.x);
  await solution.check();
  await final.check();
  await page.getByRole('button', { name: 'Neues Dokument' }).click();
  await expect(final).toBeChecked();
  await page.reload();
  await page.getByRole('button', { name: 'Neu beginnen' }).click();
  await expect(solution).not.toBeChecked();
  await expect(draft).toBeChecked();
  await final.check();
  await page.getByRole('button', { name: 'Präambel', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Gemeinsame Präambel verwenden' }).uncheck();
  await page.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(solution).toBeDisabled();
  await expect(final).toBeDisabled();
  await expect(draft).toBeChecked();
  await page.getByRole('button', { name: 'Präambel', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Gemeinsame Präambel verwenden' }).check();
  await page.getByRole('button', { name: 'Übernehmen' }).click();
  await final.check();
  await expect(final).toBeEnabled();
  await expect(final).toBeChecked();
});
test('Ungespeicherte Tabs schließen nur nach ausdrücklicher Entscheidung', async ({ page }) => {
  await page.route('**/api/v1/session', (route) =>
    route.fulfill({ json: { token: 'test', capabilities: { version: '1', engines: [], tools: [] } } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Neu beginnen' }).click();
  await page.getByRole('button', { name: 'Unbenannt.tex schließen' }).click();
  await expect(page.getByRole('dialog', { name: 'Ungespeicherte Änderungen' })).toBeVisible();
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(page.getByRole('tab')).toHaveCount(1);
  await page.getByRole('button', { name: 'Unbenannt.tex schließen' }).click();
  await page.getByRole('button', { name: 'Verwerfen', exact: true }).click();
  await expect(page.getByRole('tab')).toHaveCount(0);
});
