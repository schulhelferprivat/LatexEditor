import { test, expect } from './fixture';

test('Wortkontext umfasst fünf Nachbarn und überschreitet nur Zeilengrenzen', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const modulePath = '/src/pdf/context-menu.ts';
    const { wordContext } = await import(modulePath);
    const host = document.createElement('div');
    host.innerHTML =
      '<div class="textLayer"><span>eins zwei drei vier fünf sechs</span><br><span>sieben acht neun zehn elf zwölf dreizehn vierzehn</span></div>';
    host.style.cssText = 'position:fixed;left:0;top:0;font:20px monospace;background:white';
    document.body.append(host);
    const spans = host.querySelectorAll('span');
    const at = (span: Element, word: string) => {
      const node = span.firstChild!;
      const start = node.textContent!.indexOf(word);
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + word.length);
      const rect = range.getBoundingClientRect();
      return wordContext(host, rect.left + rect.width / 2, rect.top + rect.height / 2);
    };
    const value = [
      at(spans[1], 'sieben'),
      at(spans[0], 'eins'),
      at(spans[1], 'vierzehn'),
      wordContext(host, 1000, 1000),
    ];
    host.remove();
    return value;
  });
  expect(result).toEqual([
    'zwei drei vier fünf sechs sieben acht neun zehn elf zwölf',
    'eins zwei drei vier fünf sechs',
    'neun zehn elf zwölf dreizehn vierzehn',
    undefined,
  ]);
});
