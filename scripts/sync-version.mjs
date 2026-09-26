import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appVersion } from './version.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const version = await appVersion();
const targets = [
  {
    file: 'package.json',
    pattern: /^(\s*"version":\s*")[^"]+(")/m,
  },
  {
    file: 'bridge/Cargo.toml',
    pattern: /^(version = ")[^"]+(")/m,
  },
  {
    file: 'bridge/Cargo.lock',
    pattern: /^(name = "latexhelper-bridge"\nversion = ")[^"]+(")/m,
  },
];
let drift = false;
for (const target of targets) {
  const file = path.join(root, target.file);
  const text = await readFile(file, 'utf8');
  if (!target.pattern.test(text)) throw new Error(`Versionsfeld nicht gefunden in ${target.file}`);
  const next = text.replace(target.pattern, `$1${version}$2`);
  if (next === text) continue;
  drift = true;
  if (check) {
    console.error(`${target.file} weicht von VERSION ${version} ab.`);
    continue;
  }
  await writeFile(file, next);
  console.log(`${target.file} auf ${version} gesetzt.`);
}
if (check && drift) {
  console.error('npm run version:sync ausführen und committen.');
  process.exit(1);
}
if (!drift) console.log(`Alle Manifeste stimmen mit VERSION ${version} überein.`);
