import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

const read = (file: string) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

describe('single source of truth for the version', () => {
  it('keeps VERSION in MAJOR.MINOR.PATCH form', async () => {
    expect((await read('VERSION')).trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('matches package.json, Cargo.toml and Cargo.lock', async () => {
    const version = (await read('VERSION')).trim();
    expect(JSON.parse(await read('package.json')).version).toBe(version);
    expect(await read('bridge/Cargo.toml')).toContain(`version = "${version}"`);
    expect(await read('bridge/Cargo.lock')).toContain(`name = "latexhelper-bridge"\nversion = "${version}"`);
  });

  it('leaves no hardcoded version in the packaging inputs', async () => {
    expect(await read('packaging/windows/latexhelper.iss')).toContain('AppVersion={#AppVersion}');
    const script = await read('scripts/package.mjs');
    expect(script).toContain('CFBundleShortVersionString</key><string>${version}');
    expect(script).toContain('/DAppVersion=${version}');
  });

  it('derives the shown version from VERSION, not from the commit count', async () => {
    expect(await read('vite.config.ts')).toContain('__APP_VERSION__: JSON.stringify(appVersion())');
  });
});
