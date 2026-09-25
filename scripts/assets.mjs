import { cp, mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as checker from 'license-checker-rseidelsohn';

const root = process.cwd();
const licenses = await new Promise((resolve, reject) =>
  checker.init({ start: root, production: true, excludePrivatePackages: true }, (error, data) =>
    error ? reject(error) : resolve(data),
  ),
);
const report = [];
const approved = new Set([
  'MIT',
  'Apache-2.0',
  'BSD',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
  'CC0-1.0',
  'Unlicense',
  'Python-2.0',
]);
await mkdir('public/licenses/packages', { recursive: true });
await mkdir('public/dictionaries', { recursive: true });
for (const [name, entry] of Object.entries(licenses)) {
  const metadata = JSON.parse(await readFile(path.join(entry.path, 'package.json'), 'utf8'));
  const expression =
    typeof metadata.license === 'string'
      ? metadata.license
      : Array.isArray(entry.licenses)
        ? entry.licenses.join(' OR ')
        : entry.licenses;
  const dictionary = name.startsWith('dictionary-de@');
  const terms = String(expression)
    .replace(/[()]/g, '')
    .split(/\s+(?:OR|AND)\s+/);
  if (
    !terms.every(
      (license) => approved.has(license) || (dictionary && ['GPL-2.0', 'GPL-3.0'].includes(license)),
    )
  )
    throw new Error(`Ungeprüfte Lizenz: ${name}: ${expression}`);
  if (!entry.licenseFile) throw new Error(`Lizenztext fehlt: ${name}`);
  const filename = name.replaceAll('/', '__') + '.txt';
  await cp(entry.licenseFile, path.join('public/licenses/packages', filename));
  report.push({
    package: name,
    license: expression,
    repository: entry.repository ?? null,
    notice: `packages/${filename}`,
  });
}
for (const language of ['de', 'en']) {
  for (const extension of ['aff', 'dic'])
    await cp(
      `node_modules/dictionary-${language}/index.${extension}`,
      `public/dictionaries/${language}.${extension}`,
    );
  await cp(`node_modules/dictionary-${language}`, `public/licenses/sources/dictionary-${language}`, {
    recursive: true,
  });
}
await cp('vendor/licenses', 'public/licenses/texts', { recursive: true });
await cp('vendor/dictionaries', 'public/licenses/sources/upstream', { recursive: true });
await cp('node_modules/pdfjs-dist/cmaps', 'public/pdf/cmaps', { recursive: true });
await cp('node_modules/pdfjs-dist/standard_fonts', 'public/pdf/standard_fonts', { recursive: true });
await cp('node_modules/pdfjs-dist/wasm', 'public/pdf/wasm', { recursive: true });
for (const folder of ['standard_fonts', 'wasm'])
  for (const name of await readdir(`node_modules/pdfjs-dist/${folder}`)) {
    if (/license/i.test(name))
      await cp(
        `node_modules/pdfjs-dist/${folder}/${name}`,
        `public/licenses/packages/pdfjs-${folder}-${name}.txt`,
      );
  }
const files = [];
async function hashes(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = path.join(dir, entry.name);
    if (entry.isDirectory()) await hashes(name);
    else
      files.push({
        path: name.replaceAll('\\', '/'),
        sha256: crypto
          .createHash('sha256')
          .update(await readFile(name))
          .digest('hex'),
      });
  }
}
await hashes('public/dictionaries');
await hashes('vendor/dictionaries');
await writeFile(
  'public/licenses/report.json',
  JSON.stringify({ packages: report, assets: files }, null, 2) + '\n',
);
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const sourceFiles = await readdir('vendor/dictionaries');
await writeFile(
  'public/licenses/index.html',
  `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LatexHelper · Lizenzen</title><style>body{font:15px/1.7 system-ui;background:#0f141c;color:#dbe3f0;max-width:900px;margin:60px auto;padding:0 24px}a{color:#5aa9f0}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:8px;border-bottom:1px solid #ffffff15}code{font-size:12px}</style><h1>LatexHelper · Drittanbieter-Lizenzen</h1><p>Alle Komponenten werden lokal ausgeliefert. Deutsche Wörterbuchdaten: dictionary-de 3.0.0 / igerman98 20161207, unverändert, GPL-2.0 oder GPL-3.0. Englische Daten: dictionary-en 4.0.0 / en_US, MIT und BSD samt enthaltenen Herkunftshinweisen.</p><p><a href="texts/GPL-2.0.txt">GPL-2.0</a> · <a href="texts/GPL-3.0.txt">GPL-3.0</a> · <a href="report.json">Versionen und Prüfsummen</a></p><h2>Wörterbuch-Quellen</h2><ul>${sourceFiles.map((name) => `<li><a href="sources/upstream/${encodeURIComponent(name)}">${escape(name)}</a></li>`).join('')}</ul><p>Die unveränderten npm-Daten und Lizenztexte liegen unter <code>licenses/sources/dictionary-de</code> und <code>licenses/sources/dictionary-en</code>. Der vollständige Quellstand des deutschen Ursprungswörterbuchs einschließlich Build-Dateien wird mitgeliefert.</p><h2>Bibliotheken</h2><table><tr><th>Paket</th><th>Lizenz</th></tr>${report.map((entry) => `<tr><td>${escape(entry.package)}</td><td><a href="${escape(entry.notice)}">${escape(entry.license)}</a></td></tr>`).join('')}</table></html>`,
);
console.log(`Lizenzprüfung: ${report.length} Pakete; Wörterbücher und PDF-Ressourcen kopiert.`);
