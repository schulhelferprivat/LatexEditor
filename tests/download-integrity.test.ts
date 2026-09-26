import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('download integrity gate', () => {
  it('excludes downloads even when they exist before service worker generation', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'latexhelper-service-worker-'));
    directories.push(directory);
    await mkdir(path.join(directory, 'dist/downloads'), { recursive: true });
    await writeFile(path.join(directory, 'dist/index.html'), '<title>Test</title>');
    await writeFile(path.join(directory, 'dist/downloads/LatexHelper-Bridge-Windows.exe'), 'fixture');
    const result = spawnSync(process.execPath, [path.resolve('scripts/service-worker.mjs')], {
      cwd: directory,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    const worker = await readFile(path.join(directory, 'dist/sw.js'), 'utf8');
    expect(worker).toContain('const ASSETS=["index.html"]');
    expect(worker).not.toContain('LatexHelper-Bridge-Windows.exe');
  });

  it.each(['valid', 'corrupted', 'missing'] as const)('checks both artifacts: %s', async (scenario) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'latexhelper-checksums-'));
    directories.push(directory);
    const names = ['LatexHelper-Bridge-Windows.exe', 'LatexHelper-Bridge-macOS-arm64.zip'];
    for (const name of names) {
      const content = Buffer.from(`fixture: ${name}\n`);
      await writeFile(path.join(directory, name), content);
      await writeFile(
        path.join(directory, `${name}.sha256`),
        `${createHash('sha256').update(content).digest('hex')}  ${name}\n`,
      );
    }
    if (scenario === 'corrupted') await writeFile(path.join(directory, names[0]), 'changed');
    if (scenario === 'missing') await rm(path.join(directory, names[1]));
    const result = spawnSync(process.execPath, ['scripts/verify-downloads.mjs', directory], {
      encoding: 'utf8',
    });
    expect(result.error).toBeUndefined();
    expect(result.status === 0).toBe(scenario === 'valid');
  });
});
