import { spawnSync } from 'node:child_process';
import { readFile, writeFile, readdir, mkdir, cp } from 'node:fs/promises';
import path from 'node:path';
import parseLicense from 'spdx-expression-parse';
const compiler = spawnSync('rustc', ['-vV'], { encoding: 'utf8' });
if (compiler.status !== 0) throw new Error('Rust-Compiler fehlt.');
const target = process.env.LATEXHELPER_TARGET ?? /^host: (.+)$/m.exec(compiler.stdout)?.[1];
if (!target) throw new Error('Rust-Zielplattform fehlt.');
const result = spawnSync(
  'cargo',
  [
    'metadata',
    '--manifest-path',
    'bridge/Cargo.toml',
    '--format-version=1',
    '--locked',
    '--filter-platform',
    target,
  ],
  { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
);
if (result.status !== 0) throw new Error(result.stderr || 'Cargo-Metadaten fehlen.');
const metadata = JSON.parse(result.stdout);
const used = new Set();
const visit = (id) => {
  if (used.has(id)) return;
  used.add(id);
  const node = metadata.resolve.nodes.find((node) => node.id === id);
  for (const dependency of node?.deps ?? [])
    if (dependency.dep_kinds.some((kind) => kind.kind !== 'dev')) visit(dependency.pkg);
};
visit(metadata.resolve.root);
const approved = new Set([
  'MIT',
  'Apache-2.0',
  'Apache-2.0 WITH LLVM-exception',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'Unicode-3.0',
  'Zlib',
  'Unlicense',
  'CC0-1.0',
  '0BSD',
]);
const output = 'public/licenses/rust';
await mkdir(output, { recursive: true });
const report = [];
for (const pkg of metadata.packages.filter((pkg) => pkg.source && used.has(pkg.id))) {
  const choose = (node) => {
    if (node.conjunction === 'or') return choose(node.left) ?? choose(node.right);
    if (node.conjunction === 'and') {
      const left = choose(node.left),
        right = choose(node.right);
      return left && right ? `(${left} AND ${right})` : null;
    }
    const value = node.license + (node.plus ? '+' : '') + (node.exception ? ` WITH ${node.exception}` : '');
    return approved.has(value) ? value : null;
  };
  const selectedLicense = choose(parseLicense(String(pkg.license).replaceAll('/', ' OR ')));
  if (!selectedLicense) throw new Error(`Rust-Lizenz ungeprüft: ${pkg.name}: ${pkg.license}`);
  const root = path.dirname(pkg.manifest_path);
  const files = (await readdir(root)).filter((name) =>
    /^(license|licence|copying|copyright|notice)/i.test(name),
  );
  if (pkg.license_file) files.push(pkg.license_file);
  if (!files.length) throw new Error(`Rust-Lizenztext fehlt: ${pkg.name}`);
  const dir = path.join(output, `${pkg.name}-${pkg.version}`);
  await mkdir(dir, { recursive: true });
  for (const file of new Set(files))
    await cp(path.join(root, file), path.join(dir, path.basename(file)), { recursive: true });
  report.push({
    name: pkg.name,
    version: pkg.version,
    license: pkg.license,
    selectedLicense,
    repository: pkg.repository,
    notices: [...new Set(files)],
  });
}
await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const index = 'public/licenses/index.html';
let html = await readFile(index, 'utf8');
html = html.split('<h2>Rust-Bridge</h2>')[0].replace('</body>', '').replace('</html>', '');
await writeFile(
  index,
  html +
    '<h2>Rust-Bridge</h2><p><a href="rust/report.json">Bibliotheken, Versionen und Lizenztexte</a></p></body></html>',
);
console.log(`Rust-Lizenzprüfung: ${report.length} Pakete`);
